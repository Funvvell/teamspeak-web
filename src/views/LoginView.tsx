import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  IcBolt,
  IcBookmark,
  IcBot,
  IcCheck,
  IcDns,
  IcGame,
  IcKey,
  IcLogin,
  IcSearch,
  IcShield,
  IcStar,
  IcWifi,
} from '../components/TacIcons'
import type { RecentServer } from '../lib/utils'
import type { FieldErrors } from './types'

export interface LoginViewProps {
  addressInput: string
  setAddressInput: (v: string) => void
  fieldErrors: FieldErrors
  setFieldErrors: Dispatch<SetStateAction<FieldErrors>>
  host: string
  port: string
  nickname: string
  password: string
  lastError: string | null
  connecting: boolean
  setNickname: (v: string) => void
  setPassword: (v: string) => void
  connectFromLogin: (overrides?: { address?: string; nickname?: string; password?: string }) => void
  connectAsGuest: () => void
  disconnect: () => void
  recent: RecentServer[]
  pickRecent: (r: RecentServer) => void
  clearRecent: () => void
  rememberServer: boolean
  setRememberServer: (v: boolean) => void
  micOk: boolean
  micDeviceName: string
  micPermission: 'granted' | 'denied' | 'unknown'
  requestMic: () => void
  setHelpOpen: (v: boolean) => void
}

interface DemoServer {
  id: number
  name: string
  host: string
  game: string
  ping: number
  loss: number
  slots: number
  max: number
  region: string
  sec: number
  full?: boolean
  tag?: string
}

const DEMO_SERVERS: DemoServer[] = [
  { id: 1, name: 'CS2 Major 公开 PUG 联赛 #1', host: '185.107.96.14:9987', game: 'CS2', ping: 12, loss: 0.0, slots: 118, max: 128, region: 'EU-西部中部', sec: 29 },
  { id: 2, name: 'Valorant 战术训练营 欧服', host: 'val.scrimhub.gg:9987', game: 'Valorant', ping: 18, loss: 0.0, slots: 84, max: 128, region: 'EU-西部中部', sec: 25, tag: '竞技' },
  { id: 3, name: 'DayZ 地下硬核生存小队', host: 'dayz-underground.net:9987', game: 'DayZ', ping: 31, loss: 0.1, slots: 48, max: 64, region: 'EU-西部中部', sec: 18, tag: '电台特效' },
  { id: 4, name: 'Arma 3 拟真联合特遣队', host: 'jtg-alpha.milsim.de:9987', game: 'Arma 3', ping: 26, loss: 0.0, slots: 52, max: 100, region: 'EU-西部中部', sec: 32 },
  { id: 5, name: 'iRacing 24小时纽北维修区语音', host: 'nurburg-voice.pro:9987', game: 'Sim Racing', ping: 38, loss: 0.0, slots: 24, max: 40, region: 'EU-西部中部', sec: 20, tag: '领航耳语' },
  { id: 6, name: 'NA 竞技训练联赛东部枢纽', host: 'na-scrims.esports.io:9987', game: 'CS2', ping: 88, loss: 0.4, slots: 64, max: 64, region: 'NA-东部', sec: 35, full: true, tag: '已满' },
]

const BOOKMARKS = [
  {
    id: 'apex',
    name: 'Apex Masters 欧服中部',
    host: 'eu.apexmasters.gg:9987',
    ping: 14,
    slots: 62,
    max: 96,
    note: '自动加入（大厅 1）',
    active: true,
  },
  {
    id: 'tf141',
    name: 'Arma 战术 141 特遣队',
    host: 'tf141.milsim-voice.net',
    ping: 28,
    slots: 34,
    max: 64,
    note: '已保存密码',
    active: false,
  },
  {
    id: 'gt3',
    name: 'Apex GT3 遥测通讯',
    host: 'racing.apex-voice.org:10022',
    ping: 42,
    slots: 19,
    max: 32,
    note: '麦克风自动衰减',
    active: false,
  },
]

const GAMES = ['全部', 'CS2', 'Valorant', 'Arma 3', 'DayZ', '模拟赛车'] as const
const GAME_MAP: Record<string, string> = {
  全部: 'ALL',
  CS2: 'CS2',
  Valorant: 'Valorant',
  'Arma 3': 'Arma 3',
  DayZ: 'DayZ',
  模拟赛车: 'Sim Racing',
}

export function LoginView({
  addressInput,
  setAddressInput,
  fieldErrors,
  setFieldErrors,
  host,
  port,
  nickname,
  password,
  lastError,
  connecting,
  setNickname,
  setPassword,
  connectFromLogin,
  recent,
  pickRecent,
  rememberServer,
  setHelpOpen,
}: LoginViewProps) {
  const [game, setGame] = useState<string>('全部')
  const [query, setQuery] = useState('')
  const [maxPing, setMaxPing] = useState(80)
  const [hideFull, setHideFull] = useState(true)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [region] = useState('EU-西部中部')
  const [starred, setStarred] = useState<Set<string>>(new Set(['apex']))
  const [nickLocal, setNickLocal] = useState(nickname || 'Commander_Kael')
  const [passLocal, setPassLocal] = useState(password || '')

  const address = addressInput || (host ? `${host}:${port || '9987'}` : '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return DEMO_SERVERS.filter((s) => {
      const gameKey = GAME_MAP[game] ?? 'ALL'
      if (gameKey !== 'ALL' && s.game !== gameKey) return false
      if (s.ping > maxPing) return false
      if (hideFull && s.full) return false
      if (hideEmpty && s.slots === 0) return false
      if (q && !`${s.name} ${s.host} ${s.game}`.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.ping - b.ping)
  }, [game, query, maxPing, hideFull, hideEmpty])

  const doConnect = (hostOverride?: string) => {
    const target = hostOverride ?? address
    if (hostOverride) setAddressInput(hostOverride)
    const nick = (nickLocal || nickname).trim()
    connectFromLogin({ address: target, nickname: nick, password: passLocal })
  }

  const hostError = fieldErrors.host
  const nickError = fieldErrors.nickname

  return (
    <div className="login-page" style={{ gridArea: 'main', minHeight: 0, height: '100%' }}>
      {connecting && <div className="opening-stamp">连接中…</div>}
      <div className="sb-wrap">
        {/* Direct Tactical Uplink */}
        <section className="uplink-hud" aria-label="直接连接">
          <div className="uplink-head">
            <div className="uplink-title">
              <IcBolt size={18} style={{ color: 'var(--primary)' }} />
              <h2>战术直连上行链路</h2>
              <span className="badge muted" style={{ color: 'var(--tertiary)' }}>
                就绪 // OPUS_V2
              </span>
            </div>
            <div className="uplink-status">
              <span className="ok-dot" />
              <span>UDP 路由已激活</span>
              <span>默认端口: 9987</span>
            </div>
          </div>
          <form
            className="uplink-form"
            onSubmit={(e) => {
              e.preventDefault()
              doConnect()
            }}
          >
            <div className="uplink-field">
              <label>
                <span>目标服务器（IP / 主机名:端口）</span>
                <span className="req">必填</span>
              </label>
              <div className="input-wrap">
                <span className="f-icon">
                  <IcDns size={16} />
                </span>
                <input
                  value={addressInput}
                  onChange={(e) => {
                    setAddressInput(e.target.value)
                    if (fieldErrors.host) setFieldErrors((f) => ({ ...f, host: undefined }))
                  }}
                  placeholder="例如 voice.example.gg:9987"
                  disabled={connecting}
                  required
                />
              </div>
              {hostError && <span className="field-error">{hostError}</span>}
              {lastError && !connecting && (
                <span className="field-error">{lastError}</span>
              )}
            </div>
            <div className="uplink-field">
              <label>
                <span>服务器口令</span>
              </label>
              <div className="input-wrap">
                <span className="f-icon">
                  <IcKey size={16} />
                </span>
                <input
                  type="password"
                  value={passLocal}
                  onChange={(e) => {
                    setPassLocal(e.target.value)
                    setPassword(e.target.value)
                  }}
                  placeholder="可选授权令牌"
                  disabled={connecting}
                />
              </div>
            </div>
            <div className="uplink-field">
              <label>
                <span>呼号 / 昵称</span>
              </label>
              <div className="input-wrap">
                <span className="f-icon">
                  <IcBot size={16} />
                </span>
                <input
                  value={nickLocal}
                  onChange={(e) => {
                    setNickLocal(e.target.value)
                    setNickname(e.target.value)
                    if (fieldErrors.nickname)
                      setFieldErrors((f) => ({ ...f, nickname: undefined }))
                  }}
                  placeholder="战术代号"
                  disabled={connecting}
                />
              </div>
              {nickError && <span className="field-error">{nickError}</span>}
            </div>
            <div>
              <button type="submit" className="uplink-connect" disabled={connecting}>
                <IcLogin size={16} />
                {connecting ? '连接中…' : '连接'}
              </button>
            </div>
          </form>
          {!!(recent.length || rememberServer) && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--outline)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                最近
              </span>
              {recent.slice(0, 3).map((r) => (
                <button
                  key={`${r.host}:${r.port}`}
                  type="button"
                  className="game-tag"
                  onClick={() => pickRecent(r)}
                >
                  {r.host}
                </button>
              ))}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--outline)' }}>
                · 默认 {host || '—'}:{port || '9987'}
              </span>
              <button type="button" className="ghost" onClick={() => setHelpOpen(true)}>
                帮助
              </button>
            </div>
          )}
        </section>

        <div className="sb-grid">
          {/* Bookmarks */}
          <div className="sb-bookmarks">
            <div className="sb-panel-title">
              <div className="sb-panel-title-left">
                <span className="t">
                  <IcBookmark size={16} />
                </span>
                固定书签
              </div>
              <button type="button" className="sb-new-btn">
                + 新建
              </button>
            </div>
            {BOOKMARKS.map((bm) => (
              <div key={bm.id} className={`bm-card${bm.active ? ' active' : ''}`}>
                <div className="bm-top">
                  <div className="bm-identity">
                    <div className="bm-icon">
                      <IcWifi size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="bm-name-row">
                        <span className="bm-name">{bm.name}</span>
                        {bm.active && <span className="bm-pulse" />}
                      </div>
                      <div className="bm-host">{bm.host}</div>
                    </div>
                  </div>
                  <span className={`bm-ping${bm.ping > 35 ? ' warn' : ''}`}>{bm.ping}ms</span>
                </div>
                <div className="bm-meta">
                  <div className="left">
                    <IcCheck size={12} className="t" style={{ color: 'var(--tertiary)' }} />
                    <span className="t">{bm.note}</span>
                  </div>
                  <div className="right">
                    <span className="n">
                      {bm.slots}/{bm.max}
                    </span>
                    <span>在线</span>
                  </div>
                </div>
                <div className="bm-actions">
                  <button type="button" onClick={() => doConnect(bm.host)}>
                    {bm.active ? '重新连接' : '连接'}
                  </button>
                  <button type="button" className="sq" title="书签设置">
                    <IcShield size={14} />
                  </button>
                </div>
              </div>
            ))}
            <div className="relay-health">
              <div className="relay-row">
                <span>公共节点中继健康度</span>
                <span className="t">99.98% 在线</span>
              </div>
              <div className="relay-bar" aria-hidden="true">
                <span className="g" />
                <span className="c" />
                <span className="r" />
              </div>
              <div className="relay-row">
                <span>总节点: 2,410</span>
                <span>丢包扩散: 0.04%</span>
              </div>
            </div>
          </div>

          {/* Directory */}
          <div className="sb-directory">
            <div className="sb-filters">
              <div className="sb-filter-top">
                <div className="sb-search">
                  <span className="f-icon">
                    <IcSearch size={16} />
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="按名称、战队标签、游戏或服务器 IP 过滤…"
                    aria-label="搜索服务器"
                  />
                  {query && (
                    <button
                      type="button"
                      className="clear"
                      onClick={() => setQuery('')}
                      aria-label="清除"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="sb-region">
                  <label>区域:</label>
                  <select defaultValue={region} aria-label="区域">
                    <option>EU-西部中部</option>
                    <option>NA-东部</option>
                    <option>NA-西部</option>
                    <option>亚洲</option>
                  </select>
                </div>
              </div>
              <div className="sb-game-tags">
                {GAMES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`game-tag${game === g ? ' active' : ''}`}
                    onClick={() => setGame(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="sb-filter-bot">
                <div className="sb-ping-row">
                  <span>最大延迟:</span>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    value={maxPing}
                    onChange={(e) => setMaxPing(Number(e.target.value))}
                    aria-label="最大延迟"
                  />
                  <span className="val">{maxPing}ms</span>
                </div>
                <label className="sb-check">
                  <input
                    type="checkbox"
                    checked={hideFull}
                    onChange={(e) => setHideFull(e.target.checked)}
                  />
                  隐藏已满
                </label>
                <label className="sb-check">
                  <input
                    type="checkbox"
                    checked={hideEmpty}
                    onChange={(e) => setHideEmpty(e.target.checked)}
                  />
                  隐藏空服
                </label>
              </div>
            </div>

            <div className="sb-count-row">
              <span>发现 {filtered.length} 个服务器</span>
              <span>
                排序: <span className="sort">延迟（最低）</span>{' '}
                <button type="button" className="refresh" onClick={() => setQuery('')}>
                  ↻ 刷新
                </button>
              </span>
            </div>

            <div className="server-list">
              {filtered.map((s) => (
                <div key={s.id} className={`server-row${s.full ? ' full' : ''}`}>
                  <div className="server-badge-num">
                    <IcGame size={14} />
                  </div>
                  <div className="server-info">
                    <div className="server-info-top">
                      <span className="server-info-name">{s.name}</span>
                      <span className="badge cyan">{s.game}</span>
                      {s.tag && (
                        <span className={s.full ? 'badge danger' : 'badge muted'}>{s.tag}</span>
                      )}
                    </div>
                    <div className="server-info-meta">
                      <span>{s.host}</span>
                      <span>· {s.region.split('&')[0].trim()}</span>
                      <span className="lock">
                        <IcShield size={11} /> 安全等级 {s.sec}
                      </span>
                    </div>
                  </div>
                  <div className="server-net">
                    <span className={`ping${s.ping > 70 ? ' warn' : ''}`}>
                      <IcWifi size={12} />
                      {s.ping}ms
                    </span>
                    <span className="loss">{s.loss.toFixed(1)}% 丢包</span>
                  </div>
                  <div className="server-slots">
                    <span className={`n${s.full ? ' full' : ''}`}>
                      {s.slots}/{s.max}
                    </span>
                    <span className="slot-bar">
                      <i
                        className={s.full ? 'full' : ''}
                        style={{ width: `${Math.round((s.slots / s.max) * 100)}%` }}
                      />
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`star-btn${starred.has(String(s.id)) ? ' on' : ''}`}
                    aria-label="收藏"
                    onClick={() =>
                      setStarred((prev) => {
                        const next = new Set(prev)
                        const k = String(s.id)
                        if (next.has(k)) next.delete(k)
                        else next.add(k)
                        return next
                      })
                    }
                  >
                    <IcStar size={16} />
                  </button>
                  <button
                    type="button"
                    className={`join-btn${s.full ? ' full' : ''}`}
                    disabled={s.full}
                    onClick={() => doConnect(s.host)}
                  >
                    {s.full ? '已满' : '加入 →'}
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="empty">无匹配服务器 — 调整过滤条件或使用上方直连</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
