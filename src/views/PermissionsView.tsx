import { useState } from 'react'
import { IcBot, IcCheck, IcMic, IcSearch, IcShieldPerson, IcUsers, IcWave } from '../components/TacIcons'

interface Tier {
  id: string
  name: string
  gid: string
  pwr: number
  icon: 'shield' | 'person' | 'badge' | 'token' | 'mic' | 'group'
}

const TIERS: Tier[] = [
  { id: 'server_admin', name: '服务器管理员', gid: '100', pwr: 100, icon: 'shield' },
  { id: 'normal', name: '普通成员', gid: '201', pwr: 40, icon: 'person' },
  { id: 'channel_admin', name: '频道管理员', gid: '305', pwr: 75, icon: 'badge' },
  { id: 'operator', name: '操作员', gid: '402', pwr: 60, icon: 'token' },
  { id: 'voice', name: '语音 / 已验证', gid: '508', pwr: 50, icon: 'mic' },
  { id: 'guest', name: '访客', gid: '999', pwr: 0, icon: 'group' },
]

interface PermItem {
  key: string
  desc: string
  val: string
  on: boolean
}

const GLOBAL_PERMS: PermItem[] = [
  { key: 'b_client_kick_from_server', desc: '允许踢出低层级连接', val: 'i_val: 75', on: true },
  { key: 'b_client_ban_create', desc: '创建持久硬件/IP 封禁哈希', val: 'i_val: 100', on: true },
  { key: 'b_client_remoteaddress_view', desc: '查看原始 WAN IPv4/IPv6 节点', val: 'i_val: 100', on: true },
]

const CHANNEL_PERMS: PermItem[] = [
  { key: 'b_channel_create_permanent', desc: '创建持久磁盘存储频道', val: 'i_val: 100', on: true },
  { key: 'b_channel_delete_flag_force', desc: '强制删除非空频道节点', val: 'i_val: 100', on: true },
  { key: 'i_channel_maxclients', desc: '频道容量上限覆盖', val: '无限制', on: true },
  { key: 'i_channel_create_modify_codec_max_quality', desc: 'Opus 超宽带（最高 128 kbps）', val: '128 KBPS', on: true },
]

const TALK_PERMS: PermItem[] = [
  { key: 'i_client_talk_power', desc: '自然传输优先级', val: '100 权限', on: true },
  { key: 'i_client_grant_talk_power', desc: '向被静音者授予临时发言权', val: '100 权限', on: true },
  { key: 'b_client_is_priority_speaker', desc: '将背景语音压低约 -20dB', val: '激活', on: true },
  { key: 'b_client_whisper_list_target', desc: '跨频道广播注入', val: '全局', on: true },
]

const AUDIT = [
  { ts: '16:42:08', tag: '权限修改', tagCls: 'ok', detail: <>客户端 <strong>Commander_Kael</strong> 修改了 Operator (402) 组的 <strong>i_client_talk_power</strong></>, status: '成功 (200)', statusCls: 'ok' },
  { ts: '16:38:44', tag: '频道修改', tagCls: 'info', detail: <>客户端 <strong>Valkyrie_Lead</strong> 将 CID 4096 的编解码码率恢复为 <strong>96 kbps</strong></>, status: 'OPUS_VOICE_48K 已提交', statusCls: 'ok' },
  { ts: '16:15:22', tag: '访问拒绝', tagCls: 'err', detail: <>客户端 <strong>Ghost_Rider_09</strong> 被拒绝 <strong>b_channel_create_permanent</strong>（说话权限不足）</>, status: '组: 访客 错误 (403)', statusCls: 'err' },
  { ts: '15:59:11', tag: '耳语同步', tagCls: 'warn', detail: <>由 <strong>Commander_Kael</strong> 注入频道集群 A1-Tactical 的直连耳语目标</>, status: '节点: 8 客户端已确认', statusCls: 'warn' },
]

export function PermissionsView() {
  const [tier, setTier] = useState('server_admin')
  const [filter, setFilter] = useState('')
  const [autoInherit, setAutoInherit] = useState(true)
  const [lifeCycle, setLifeCycle] = useState<'permanent' | 'semi' | 'temp'>('permanent')
  const [maxMode, setMaxMode] = useState<'unlimited' | 'strict'>('unlimited')
  const [bits, setBits] = useState(96)
  const [passwordOn, setPasswordOn] = useState(false)
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    for (const p of [...GLOBAL_PERMS, ...CHANNEL_PERMS, ...TALK_PERMS]) m[p.key] = p.on
    return m
  })

  const active = TIERS.find((t) => t.id === tier) ?? TIERS[0]
  const q = filter.trim().toLowerCase()
  const keep = (k: string, d: string) =>
    !q || k.toLowerCase().includes(q) || d.toLowerCase().includes(q)

  const togglePerm = (k: string) =>
    setPerms((p) => ({ ...p, [k]: !p[k] }))

  return (
    <div className="perm-page" style={{ gridArea: 'main', minHeight: 0 }}>
      <div
        role="note"
        aria-label="演示说明"
        style={{
          margin: '12px 16px 0',
          padding: '10px 14px',
          border: '1px solid var(--outline, #8a8070)',
          background: 'var(--surface-variant, #efe6d6)',
          color: 'var(--on-surface-variant, #5c5348)',
          fontSize: 12,
          lineHeight: 1.5,
          letterSpacing: 0.2,
        }}
      >
        <strong style={{ color: 'var(--on-surface, #1a1714)' }}>演示预览</strong>
        {' — 本页权限组、审计日志均为界面演示数据，尚未接入 TeamSpeak 服务器权限系统。'}
        {'开关与「提交变更」不会影响真实服务器。'}
      </div>
      <div className="perm-inner">
        <section className="perm-top">
          <div className="perm-top-left">
            <div className="perm-top-title">
              <span className="live-dot" />
              系统权限矩阵
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 6px',
                  border: '1px solid currentColor',
                  color: 'var(--primary, #c23b1a)',
                }}
              >
                演示
              </span>
            </div>
            <div className="perm-node">
              <span>节点:</span>
              <span className="n">AMS-CORE-09</span>
              <span className="slash">/</span>
              <span>层级:</span>
              <span className="t">SERVER_TIER_IV</span>
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
            <button type="button" className="commit-btn">
              <IcShieldPerson size={16} />
              提交变更
            </button>
          </div>
        </section>

        <div className="perm-grid">
          {/* Left: tiers */}
          <div className="perm-col">
            <div className="perm-card">
              <div className="perm-card-head">
                <span>安全上下文</span>
                <span className="count">6 个层级</span>
              </div>
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tier-btn${tier === t.id ? ' active' : ''}`}
                  onClick={() => setTier(t.id)}
                >
                  <div className="tier-left">
                    <span className="tier-icon">
                      {t.icon === 'shield' ? <IcShieldPerson size={14} /> : t.icon === 'mic' ? <IcMic size={14} /> : <IcUsers size={14} />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="tier-name">{t.name}</div>
                      <div className="tier-sub">i_group_id: {t.gid}</div>
                    </div>
                  </div>
                  <span className={`tier-pwr${t.pwr === 0 ? ' dim' : ''}`}>权限 {t.pwr}</span>
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
                  权限 {active.pwr}/100
                </span>
              </div>
              <div className="pwr-chart" aria-hidden="true">
                <i style={{ height: '15%' }} title="访客" />
                <i style={{ height: '35%' }} title="普通" />
                <i className="blue" style={{ height: '50%' }} title="语音" />
                <i className="blue" style={{ height: '60%' }} title="操作员" />
                <i className="cyan" style={{ height: '75%' }} title="频道管理员" />
                <i className="green" style={{ height: '100%' }} title="服务器管理员" />
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

          {/* Middle: tree */}
          <div className="perm-col">
            <div className="perm-card">
              <div className="perm-tree-title">
                <div>
                  <h2>权限树矩阵</h2>
                  <p>所选权威层级的有效权限</p>
                </div>
                <span className="pwr">
                  <span className="a">层级权限:</span> <span className="b">{active.pwr} / 100</span>
                </span>
              </div>

              <PermGroup
                title="全局 / 管理"
                icon="globe"
                count={GLOBAL_PERMS.length}
                items={GLOBAL_PERMS.filter((p) => keep(p.key, p.desc))}
                state={perms}
                onToggle={togglePerm}
              />
              <PermGroup
                title="频道管理"
                icon="chan"
                count={CHANNEL_PERMS.length}
                items={CHANNEL_PERMS.filter((p) => keep(p.key, p.desc))}
                state={perms}
                onToggle={togglePerm}
              />
              <PermGroup
                title="说话权限与语音"
                icon="talk"
                count={TALK_PERMS.length}
                items={TALK_PERMS.filter((p) => keep(p.key, p.desc))}
                state={perms}
                onToggle={togglePerm}
              />
            </div>
          </div>

          {/* Right: inspector */}
          <div className="perm-col">
            <div className="perm-card">
              <div className="inspector-title">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-container)' }} />
                  频道检查器
                </span>
                <span className="cid">CID: 4096</span>
              </div>

              <div className="insp-field">
                <label>频道代号</label>
                <input defaultValue="[TAC] 战术指挥 // Alpha" />
              </div>
              <div className="insp-field">
                <label>子话题横幅</label>
                <input defaultValue="训练模拟。强制按键通话。仅战术交流。" />
              </div>
              <div className="insp-field">
                <label>
                  简报 / 描述{' '}
                  <span style={{ float: 'right', color: 'var(--primary)', fontWeight: 500 }}>BBCode 已启用</span>
                </label>
                <textarea defaultValue={'[b]作战准则：[/b]\n1. 仅报告目标位置\n2. [color=#00daf3]优先发言已激活'} />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', fontWeight: 600 }}>
                  渲染预览
                </label>
                <div className="insp-preview">
                  <strong>作战准则：</strong>
                  <br />
                  1. 仅报告目标位置
                  <br />
                  2. <span className="em">优先发言已激活</span>
                </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--on-surface-variant)', marginBottom: 4 }}>
                  <span>OPUS 语音编解码</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{bits} kbps</span>
                </div>
                <input
                  type="range"
                  min={32}
                  max={128}
                  step={8}
                  value={bits}
                  onChange={(e) => setBits(Number(e.target.value))}
                  aria-label="码率"
                  style={{ width: '100%', accentColor: '#00e5ff' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--outline)', marginTop: 2 }}>
                  <span>32 kbps（省带宽）</span>
                  <span>128 kbps（超清工作室）</span>
                </div>
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
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: passwordOn ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}>
                  {passwordOn ? '已启用' : '已禁用'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="ghost" style={{ color: 'var(--error)' }}>⌁ 清除</button>
                <button type="button" className="ghost">还原</button>
                <button type="button" className="primary" style={{ fontSize: 12 }}>保存更改</button>
              </div>
            </div>

            <div className="perm-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <div className="identity-avatar" style={{ width: 56, height: 56 }}>
                <IcWave size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13 }}>广播协议 Opus V2</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                  复杂度: 10/10 · VBR 已激活
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tertiary)', fontWeight: 700, marginTop: 2 }}>
                  延迟开销 ≈ 2.4ms
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Audit log */}
        <section className="audit-log">
          <div className="audit-head">
            <div>
              <h2>
                <IcBot size={16} style={{ color: 'var(--primary)' }} />
                服务器审计与安全遥测日志
              </h2>
              <p>实时不可变加密系统账本</p>
            </div>
            <div className="audit-right">
              <span className="badge muted">安全套接字: 0.0.0.0:10011</span>
              <button type="button" className="ghost">⇩ 导出 CSV</button>
            </div>
          </div>
          {AUDIT.map((a, i) => (
            <div key={i} className="audit-row">
              <span className="ts">{a.ts}</span>
              <span className={`tag ${a.tagCls}`}>{a.tag}</span>
              <span className="detail">{a.detail}</span>
              <span className={`status ${a.statusCls}`}>{a.status}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function PermGroup({
  title,
  icon,
  count,
  items,
  state,
  onToggle,
}: {
  title: string
  icon: string
  count: number
  items: PermItem[]
  state: Record<string, boolean>
  onToggle: (k: string) => void
}) {
  void icon
  return (
    <div className="perm-group">
      <div className="perm-group-head">
        <IcUsers size={14} style={{ color: 'var(--primary)' }} />
        {title}
        <span className="n">{count} 条规则</span>
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
          <span className="val">{p.val}</span>
          <input
            type="checkbox"
            checked={!!state[p.key]}
            onChange={() => onToggle(p.key)}
            aria-label={p.key}
          />
        </label>
      ))}
    </div>
  )
}
