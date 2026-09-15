import { useEffect, useMemo, useState } from 'react'
import type {
  AuditEntry,
  ChannelPatch,
  PermChange,
  PermissionSnapshot,
  SecurityTier,
} from '../../shared/types'
import {
  IcBot,
  IcCheck,
  IcMic,
  IcSearch,
  IcShieldPerson,
  IcUsers,
  IcWave,
} from '../components/TacIcons'

export interface PermissionsViewProps {
  snapshot: PermissionSnapshot | null
  sqStatus: { connected: boolean; error?: string; serverVersion?: string }
  onRequestSnapshot: () => void
  onApply: (tierId: string, changes: PermChange[]) => void
  onUpdateChannel: (channelId: number, patch: ChannelPatch) => void
  onConnectSq: (host: string, queryPort: number, username: string, password: string) => void
  onDisconnectSq: () => void
  whisperClients: number[]
  whisperChannels: number[]
  onSyncWhisper: (clients: number[], channels: number[]) => void
}

const FALLBACK_TIERS: SecurityTier[] = [
  { id: '100', name: '服务器管理员', gid: 100, talkPower: 100, icon: 'shield' },
  { id: '201', name: '普通成员', gid: 201, talkPower: 40, icon: 'person' },
  { id: '305', name: '频道管理员', gid: 305, talkPower: 75, icon: 'badge' },
  { id: '402', name: '操作员', gid: 402, talkPower: 60, icon: 'token' },
  { id: '508', name: '语音 / 已验证', gid: 508, talkPower: 50, icon: 'mic' },
  { id: '999', name: '访客', gid: 999, talkPower: 0, icon: 'group' },
]

function auditCls(status: AuditEntry['status']): string {
  return status === 'ok' ? 'ok' : status === 'err' ? 'err' : 'warn'
}

function auditTagLabel(tag: AuditEntry['tag']): string {
  switch (tag) {
    case 'perm_edit':
      return '权限修改'
    case 'chan_mod':
      return '频道修改'
    case 'access_deny':
      return '访问拒绝'
    case 'whisper_sync':
      return '耳语同步'
    case 'sq_connect':
      return '管理连接'
    default:
      return tag
  }
}

export function PermissionsView({
  snapshot,
  sqStatus,
  onRequestSnapshot,
  onApply,
  onUpdateChannel,
  onConnectSq,
  onDisconnectSq,
  onSyncWhisper,
  whisperClients,
  whisperChannels,
}: PermissionsViewProps) {
  const tiers = snapshot?.tiers ?? FALLBACK_TIERS
  const tree = snapshot?.tree ?? []
  const inspector = snapshot?.inspector
  const audit = snapshot?.audit ?? []

  const [tier, setTier] = useState(tiers[0]?.id ?? '100')
  const [filter, setFilter] = useState('')
  const [autoInherit, setAutoInherit] = useState(true)
  const [lifeCycle, setLifeCycle] = useState<'permanent' | 'semi' | 'temp'>('permanent')
  const [maxMode, setMaxMode] = useState<'unlimited' | 'strict'>('unlimited')
  const [bits, setBits] = useState(inspector?.codecQuality ?? 96)
  const [passwordOn, setPasswordOn] = useState(inspector?.passwordEnabled ?? false)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [draftPerms, setDraftPerms] = useState<Record<string, boolean>>({})
  const [sqForm, setSqForm] = useState({
    host: '127.0.0.1',
    queryPort: '10011',
    username: 'serveradmin',
    password: '',
  })

  useEffect(() => {
    if (!snapshot) return
    const m: Record<string, boolean> = {}
    for (const g of tree) for (const item of g.items) m[item.key] = item.enabled
    setDraftPerms(m)
    if (inspector) {
      setName(inspector.name)
      setTopic(inspector.topic)
      setDescription(inspector.description)
      setBits(inspector.codecQuality || 96)
      setPasswordOn(inspector.passwordEnabled)
      setLifeCycle(
        inspector.permanent ? 'permanent' : inspector.semiPermanent ? 'semi' : 'temp',
      )
      setMaxMode(inspector.maxClients > 0 ? 'strict' : 'unlimited')
    }
  // Sync inspector fields when a new snapshot arrives (tree/inspector derive from snapshot).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  useEffect(() => {
    onRequestSnapshot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = useMemo(
    () => tiers.find((t) => t.id === tier) ?? tiers[0] ?? FALLBACK_TIERS[0],
    [tiers, tier],
  )

  const q = filter.trim().toLowerCase()
  const keep = (k: string, d: string) =>
    !q || k.toLowerCase().includes(q) || d.toLowerCase().includes(q)

  const togglePerm = (k: string) =>
    setDraftPerms((p) => ({ ...p, [k]: !p[k] }))

  const handleCommit = () => {
    const changes: PermChange[] = []
    for (const g of tree) {
      for (const item of g.items) {
        const next = draftPerms[item.key]
        if (next !== undefined && next !== item.enabled) {
          changes.push({ key: item.key, enabled: next })
        }
      }
    }
    onApply(active.id, changes)
  }

  const handleSaveChannel = () => {
    if (!inspector) return
    const patch: ChannelPatch = {
      name,
      topic,
      description,
      maxClients: maxMode === 'unlimited' ? 0 : inspector.maxClients || 5,
      permanent: lifeCycle === 'permanent',
      codecQuality: bits,
      password: passwordOn ? 'tactical' : null,
    }
    onUpdateChannel(inspector.channelId, patch)
  }

  const groupItems = (id: string) =>
    tree.find((g) => g.id === id)?.items ?? []

  return (
    <div className="perm-page" style={{ gridArea: 'main', minHeight: 0 }}>
      <div className="perm-inner">
        <section className="perm-top">
          <div className="perm-top-left">
            <div className="perm-top-title">
              <span className="live-dot" style={{ background: sqStatus.connected ? 'var(--tertiary)' : 'var(--danger)' }} />
              系统权限矩阵
            </div>
            <div className="perm-node">
              <span>管理:</span>
              <span className="t">{sqStatus.connected ? '已连接' : '未连接'}</span>
              {sqStatus.serverVersion && (
                <>
                  <span className="slash">/</span>
                  <span className="n">{sqStatus.serverVersion}</span>
                </>
              )}
              {sqStatus.error && (
                <>
                  <span className="slash">/</span>
                  <span style={{ color: 'var(--error)' }}>{sqStatus.error}</span>
                </>
              )}
            </div>
          </div>
          <div className="perm-top-right">
            <div className="perm-search">
              <IcSearch size={14} style={{ color: 'var(--on-surface-variant)' }} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="过滤权限键…"
                aria-label="过滤权限"
              />
            </div>
            <button type="button" className="ghost" onClick={onRequestSnapshot}>
              刷新快照
            </button>
            {sqStatus.connected ? (
              <button type="button" className="ghost" onClick={onDisconnectSq}>
                断开管理
              </button>
            ) : (
              <button
                type="button"
                className="commit-btn"
                onClick={() =>
                  onConnectSq(
                    sqForm.host,
                    Number(sqForm.queryPort) || 10011,
                    sqForm.username,
                    sqForm.password,
                  )
                }
              >
                连接 ServerQuery
              </button>
            )}
            <button type="button" className="commit-btn" onClick={handleCommit}>
              <IcShieldPerson size={16} />
              提交变更
            </button>
          </div>
        </section>

        {!sqStatus.connected && (
          <section className="perm-card">
            <div className="perm-card-head">
              <span>ServerQuery 连接</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr 1fr', gap: 8 }}>
              <input
                value={sqForm.host}
                onChange={(e) => setSqForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="主机"
                aria-label="SQ 主机"
              />
              <input
                value={sqForm.queryPort}
                onChange={(e) => setSqForm((f) => ({ ...f, queryPort: e.target.value }))}
                placeholder="10011"
                aria-label="SQ 端口"
              />
              <input
                value={sqForm.username}
                onChange={(e) => setSqForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="用户名"
                aria-label="SQ 用户名"
              />
              <input
                type="password"
                value={sqForm.password}
                onChange={(e) => setSqForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="密码"
                aria-label="SQ 密码"
              />
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--outline)' }}>
              mock 模式可直接刷新快照；真实服务器需网关配置 SQ_* 或在此填写管理口令。
            </p>
          </section>
        )}

        <div className="perm-grid">
          <div className="perm-col">
            <div className="perm-card">
              <div className="perm-card-head">
                <span>安全上下文</span>
                <span className="count">{tiers.length} 个层级</span>
              </div>
              {tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tier-btn${tier === t.id ? ' active' : ''}`}
                  onClick={() => setTier(t.id)}
                >
                  <div className="tier-left">
                    <span className="tier-icon">
                      {t.icon === 'mic' ? <IcMic size={14} /> : t.icon === 'shield' ? <IcShieldPerson size={14} /> : <IcUsers size={14} />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="tier-name">{t.name}</div>
                      <div className="tier-sub">i_group_id: {t.gid}</div>
                    </div>
                  </div>
                  <span className={`tier-pwr${t.talkPower === 0 ? ' dim' : ''}`}>
                    权限 {t.talkPower}
                  </span>
                </button>
              ))}
            </div>

            <div className="perm-card">
              <div className="perm-card-head">
                <span>ACL 委派链</span>
              </div>
              <div className="acl-box">
                <div className="t">
                  <span className="k">层级支配</span>
                  <span className="v">b_client_skip_perm</span>
                </div>
                <p className="d">
                  服务器管理员对频道与客户端覆盖拥有全局优先权。否定标志已禁用。
                </p>
              </div>
              <div className="auto-inherit">
                <span>自动继承根权限</span>
                <button
                  type="button"
                  className={`switch${autoInherit ? ' on' : ''}`}
                  role="switch"
                  aria-checked={autoInherit}
                  aria-label="自动继承"
                  onClick={() => setAutoInherit((v) => !v)}
                />
              </div>
            </div>

            <div className="perm-card">
              <div className="perm-card-head">
                <span>说话优先级分布</span>
                <span className="count" style={{ background: 'transparent', color: 'var(--primary)' }}>
                  权限 {active.talkPower}/100
                </span>
              </div>
              <div className="pwr-chart" aria-hidden="true">
                <i style={{ height: '15%' }} />
                <i style={{ height: '35%' }} />
                <i className="blue" style={{ height: '50%' }} />
                <i className="blue" style={{ height: '60%' }} />
                <i className="cyan" style={{ height: '75%' }} />
                <i className="green" style={{ height: '100%' }} />
              </div>
              <div className="pwr-labels">
                <span>访客</span>
                <span>普通</span>
                <span>语音</span>
                <span>操作</span>
                <span>频道管</span>
                <span>服管</span>
              </div>
            </div>
          </div>

          <div className="perm-col">
            <div className="perm-card">
              <div className="perm-tree-title">
                <div>
                  <h2>权限树矩阵</h2>
                  <p>所选权威层级的有效权限</p>
                </div>
                <span className="pwr">
                  <span className="a">层级权限:</span>{' '}
                  <span className="b">{active.talkPower} / 100</span>
                </span>
              </div>
              <PermGroup
                title="全局 / 管理"
                items={groupItems('global').filter((p) => keep(p.key, p.desc))}
                state={draftPerms}
                onToggle={togglePerm}
              />
              <PermGroup
                title="频道管理"
                items={groupItems('channel').filter((p) => keep(p.key, p.desc))}
                state={draftPerms}
                onToggle={togglePerm}
              />
              <PermGroup
                title="说话权限与语音"
                items={groupItems('talk').filter((p) => keep(p.key, p.desc))}
                state={draftPerms}
                onToggle={togglePerm}
              />
            </div>
          </div>

          <div className="perm-col">
            <div className="perm-card">
              <div className="inspector-title">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--primary-container)',
                    }}
                  />
                  频道检查器
                </span>
                <span className="cid">CID: {inspector?.channelId ?? '—'}</span>
              </div>

              <div className="insp-field">
                <label>频道代号</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="insp-field">
                <label>子话题横幅</label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>
              <div className="insp-field">
                <label>简报 / 描述</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="insp-field">
                <label>最大成员分配</label>
                <div className="seg-btns two">
                  <button
                    type="button"
                    className={`seg-btn${maxMode === 'unlimited' ? ' active' : ''}`}
                    onClick={() => setMaxMode('unlimited')}
                  >
                    无限制
                  </button>
                  <button
                    type="button"
                    className={`seg-btn${maxMode === 'strict' ? ' active' : ''}`}
                    onClick={() => setMaxMode('strict')}
                  >
                    严格（5 席位）
                  </button>
                </div>
              </div>

              <div className="insp-field">
                <label>持久化生命周期</label>
                <div className="seg-btns">
                  <button
                    type="button"
                    className={`seg-btn${lifeCycle === 'permanent' ? ' active' : ''}`}
                    onClick={() => setLifeCycle('permanent')}
                  >
                    永久
                  </button>
                  <button
                    type="button"
                    className={`seg-btn${lifeCycle === 'semi' ? ' active' : ''}`}
                    onClick={() => setLifeCycle('semi')}
                  >
                    半永久
                  </button>
                  <button
                    type="button"
                    className={`seg-btn${lifeCycle === 'temp' ? ' active' : ''}`}
                    onClick={() => setLifeCycle('temp')}
                  >
                    临时
                  </button>
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--on-surface-variant)',
                    marginBottom: 4,
                  }}
                >
                  <span>OPUS 语音编解码</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{bits} kbps</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={128}
                  step={8}
                  value={bits}
                  onChange={(e) => setBits(Number(e.target.value))}
                  aria-label="码率"
                  style={{ width: '100%', accentColor: '#00e5ff' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>频道密码</span>
                <button
                  type="button"
                  className={`switch${passwordOn ? ' on' : ''}`}
                  role="switch"
                  aria-checked={passwordOn}
                  aria-label="频道密码"
                  onClick={() => setPasswordOn((v) => !v)}
                />
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    fontWeight: 700,
                    color: passwordOn ? 'var(--tertiary)' : 'var(--on-surface-variant)',
                  }}
                >
                  {passwordOn ? '已启用' : '已禁用'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="primary" style={{ fontSize: 12 }} onClick={handleSaveChannel}>
                  保存更改
                </button>
              </div>
            </div>

            <div className="perm-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <div className="identity-avatar" style={{ width: 56, height: 56 }}>
                <IcWave size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13 }}>
                  广播协议 Opus V2
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                  耳语目标: 客户端 {whisperClients.length} · 频道 {whisperChannels.length}
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onSyncWhisper(whisperClients, whisperChannels)}
                >
                  同步耳语列表
                </button>
              </div>
            </div>
          </div>
        </div>

        <section className="audit-log">
          <div className="audit-head">
            <div>
              <h2>
                <IcBot size={16} style={{ color: 'var(--primary)' }} />
                服务器审计与安全遥测日志
              </h2>
              <p>网关 ServerQuery 操作环形缓冲</p>
            </div>
          </div>
          {audit.length === 0 && (
            <div className="empty">暂无审计条目 — 连接管理端或提交变更后出现</div>
          )}
          {audit.map((a, i) => (
            <div key={`${a.ts}-${i}`} className="audit-row">
              <span className="ts">{new Date(a.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
              <span className={`tag ${auditCls(a.status)}`}>{auditTagLabel(a.tag)}</span>
              <span className="detail">{a.detail}</span>
              <span className={`status ${auditCls(a.status)}`}>{a.statusText}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function PermGroup({
  title,
  items,
  state,
  onToggle,
}: {
  title: string
  items: { key: string; desc: string; valueLabel: string; enabled: boolean }[]
  state: Record<string, boolean>
  onToggle: (k: string) => void
}) {
  return (
    <div className="perm-group">
      <div className="perm-group-head">
        <IcUsers size={14} style={{ color: 'var(--primary)' }} />
        {title}
        <span className="n">{items.length} 条规则</span>
      </div>
      {items.map((p) => (
        <label key={p.key} className="perm-item">
          <span className="ok">
            <IcCheck size={12} />
          </span>
          <span className="text">
            <div className="key">{p.key}</div>
            <div className="desc">{p.desc}</div>
          </span>
          <span className="val">{p.valueLabel}</span>
          <input
            type="checkbox"
            checked={state[p.key] ?? p.enabled}
            onChange={() => onToggle(p.key)}
            aria-label={p.key}
          />
        </label>
      ))}
      {items.length === 0 && <div className="empty">无匹配权限</div>}
    </div>
  )
}
