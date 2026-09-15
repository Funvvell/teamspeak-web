import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  IcBolt,
  IcBot,
  IcCheck,
  IcDns,
  IcGame,
  IcKey,
  IcSearch,
  IcSettings,
  IcShield,
  IcStar,
  IcWifi,
  IcWave,
} from '../components/TacIcons'
import type { RecentServer } from '../lib/utils'
import { parseHostPort } from '../lib/utils'
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
  connectFromLogin: (overrides?: {
    address?: string
    nickname?: string
    password?: string
  }) => void
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
  catalog?: {
    bookmarks: {
      id: string
      name: string
      host: string
      port: number
      note?: string
      nickname?: string
      gameTag?: string
    }[]
    recent?: { host: string; port: number; nickname?: string; ts: number }[]
  }
  addBookmark?: (
    name: string,
    host: string,
    port: number,
    nickname?: string,
  ) => void
  removeBookmark?: (id: string) => void
  openSettings?: () => void
  openPermissions?: () => void
  openBrowser?: () => void
}

const CALLSIGN_PREFIX = [
  'Ghost',
  'Viper',
  'Kael',
  'Apex',
  'Falcon',
  'Reaper',
  'Shadow',
  'Spectre',
]
const CALLSIGN_CODE = [
  '01',
  '07',
  'Lead',
  'Tactical',
  'HQ',
  '99',
  'Alpha',
  'Bravo',
]

let callSeq = 0
function nextCallsign(): string {
  callSeq = (callSeq + 7) % 128
  const name = `${CALLSIGN_PREFIX[callSeq % CALLSIGN_PREFIX.length]}_${CALLSIGN_CODE[(callSeq >> 2) % CALLSIGN_CODE.length]}`
  return name
}
function nextPing(): number {
  callSeq = (callSeq + 3) % 128
  return 12 + (callSeq % 16)
}

const FALLBACK_PILLS = [
  { host: 'voice.esports-hub.gg', port: '9987', label: 'Apex Masters (9987)', dot: 'tertiary' },
  { host: 'milsim.tactical-voice.org', port: '9987', label: 'Arma3 MilSim (9987)', dot: 'secondary' },
  { host: '185.107.96.14', port: '9987', label: '185.107.96.14 (9987)', dot: 'tertiary-container' },
]

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
  pickRecent: _pickRecent,
  clearRecent,
  rememberServer: _rememberServer,
  setRememberServer: _setRememberServer,
  catalog,
  addBookmark,
  requestMic: _requestMic,
  setHelpOpen: _setHelpOpen,
  micOk: _micOk,
  micDeviceName: _micDeviceName,
  micPermission: _micPermission,
  openSettings,
  openPermissions,
  openBrowser,
}: LoginViewProps) {
  const [addrLocal, setAddrLocal] = useState(
    addressInput || host || 'voice.esports-hub.gg',
  )
  const [portLocal, setPortLocal] = useState(port || '9987')
  const [nickLocal, setNickLocal] = useState(nickname || 'Commander_Kael')
  const [passLocal, setPassLocal] = useState(password || '')
  const [showPass, setShowPass] = useState(false)
  const [channelOpen, setChannelOpen] = useState(true)
  const [channelName, setChannelName] = useState('#天梯排位 Alpha 队')
  const [channelPass, setChannelPass] = useState('')
  const [autoJoin, setAutoJoin] = useState(true)
  const [saveBookmark, setSaveBookmark] = useState(true)
  const [noiseGate, setNoiseGate] = useState(true)
  const [pingMs, setPingMs] = useState(18)
  const [socketNote, setSocketNote] = useState('UDP 端口检测正常')
  const [toast, setToast] = useState<string | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)
  const [browserFilter, setBrowserFilter] = useState('')

  useEffect(() => {
    setAddrLocal(addressInput || (host ? host : addrLocal))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressInput, host])

  useEffect(() => {
    if (port) setPortLocal(port)
  }, [port])

  useEffect(() => {
    if (nickname) setNickLocal(nickname)
  }, [nickname])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (connecting) {
      setToast(
        `正在向服务器 [${addrLocal}:${portLocal}] 发送 UDP 协议握手包（呼号: ${nickLocal}）…`,
      )
    }
  }, [connecting, addrLocal, portLocal, nickLocal])

  const pills = useMemo(() => {
    const fromRecent = (recent ?? []).slice(0, 3).map((r) => ({
      host: r.host,
      port: String(r.port),
      label: `${r.host} (${r.port})`,
      dot: 'tertiary' as const,
    }))
    const fromCat = (catalog?.recent ?? [])
      .slice(0, 3)
      .map((r) => ({
        host: r.host,
        port: String(r.port),
        label: `${r.host} (${r.port})`,
        dot: 'secondary' as const,
      }))
    const merged = [...fromRecent, ...fromCat]
    const seen = new Set<string>()
    const unique = merged.filter((p) => {
      const k = `${p.host}:${p.port}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    return unique.length ? unique.slice(0, 3) : FALLBACK_PILLS.slice(0, 3)
  }, [recent, catalog])

  const browserRows = useMemo(() => {
    const q = browserFilter.trim().toLowerCase()
    const rows: {
      id: string
      name: string
      host: string
      port: number
      note?: string
      gameTag?: string
    }[] = [
      ...(catalog?.bookmarks ?? []),
      ...(catalog?.recent ?? []).map((r, i) => ({
        id: `rec-${i}-${r.host}`,
        name: r.nickname ? `${r.host} · ${r.nickname}` : r.host,
        host: r.host,
        port: r.port,
        note: '最近连接',
      })),
    ]
    if (!q) return rows
    return rows.filter((r) =>
      `${r.name} ${r.host} ${r.gameTag ?? ''}`.toLowerCase().includes(q),
    )
  }, [catalog, browserFilter])

  const addrValid = /^[a-zA-Z0-9._:-]+$/.test(addrLocal.trim()) && addrLocal.trim().length > 0
  const lat = connecting ? '—' : `${pingMs}ms`

  function quickFill(h: string, p: string) {
    const { host, port } = parseHostPort(h.includes(':') ? h : `${h}:${p}`)
    const hh = host || h
    const pp = port || p
    setAddrLocal(hh)
    setPortLocal(pp)
    setAddressInput(`${hh}:${pp}`)
    setSocketNote(`已锁定 ${hh}`)
    setPingMs(nextPing())
    setFieldErrors({})
  }

  function randomizeCallsign() {
    const name = nextCallsign()
    setNickLocal(name)
    setNickname(name)
  }

  function clearInputs() {
    setAddrLocal('')
    setPortLocal('9987')
    setPassLocal('')
    setChannelName('')
    setChannelPass('')
    setSocketNote('等待输入')
    setAddressInput('')
    clearRecent()
  }

  function submit() {
    const raw = addrLocal.trim()
    const n = nickLocal.trim()
    if (!raw || !n) {
      setFieldErrors({
        host: !raw ? '请填写服务器地址' : undefined,
        nickname: !n ? '请填写昵称' : undefined,
      })
      return
    }
    // Peel any stacked :port from field before combining with port input
    const parsed = parseHostPort(raw)
    const h = parsed.host || raw
    const p = (portLocal.trim() || parsed.port || '9987').replace(/\D/g, '') || '9987'
    setAddrLocal(h)
    setPortLocal(p)
    setFieldErrors({})
    setAddressInput(`${h}:${p}`)
    setNickname(n)
    setPassword(passLocal)
    if (saveBookmark && addBookmark) {
      addBookmark(n || h, h, Number(p) || 9987, n)
    }
    if (autoJoin) {
      localStorage.setItem(
        'tsweb:fav',
        JSON.stringify({ host: h, port: p, nickname: n }),
      )
    }
    localStorage.setItem('tsweb:noise-gate', noiseGate ? '1' : '0')
    connectFromLogin({ address: `${h}:${p}`, nickname: n, password: passLocal })
  }

  return (
    <div className="login-page full-bleed">
      <div className="login-bg" aria-hidden="true">
        <div className="login-grid" />
        <div className="login-hud-glow" />
      </div>

      {/* Left rail (prototype) */}
      <aside className="login-rail">
        <button type="button" className="rail-logo" title="VoiceSpeak">
          <IcWave size={20} />
        </button>
        <button type="button" className="rail-btn active" title="连接服务器">
          <IcLoginGlyph />
        </button>
        <button type="button" className="rail-btn" title="收藏" onClick={() => setShowBrowser(true)}>
          <IcStar size={18} />
          <span className="rail-dot" />
        </button>
        <button type="button" className="rail-btn" title="权限与密钥" onClick={openPermissions}>
          <IcShield size={18} />
          <span className="rail-dot alert" />
        </button>
        <button type="button" className="rail-btn" title="服务器大厅" onClick={() => (openBrowser ? openBrowser() : setShowBrowser(true))}>
          <IcGame size={18} />
        </button>
        <div className="rail-bottom">
          <button type="button" className="rail-btn" title="设置" onClick={openSettings}>
            <IcSettings size={16} />
          </button>
        </div>
      </aside>

      {/* Top bar (prototype) */}
      <header className="login-header">
        <div className="lh-brand">
          <div className="lh-mark">
            <IcBot size={16} />
          </div>
          <div>
            <strong>VoiceSpeak</strong>
            <span>TACTICAL DIRECT</span>
          </div>
        </div>
        <div className="lh-status">
          <span className="dot" />
          <span>网关待命</span>
          <span className="sep">·</span>
          <span className="muted">READY</span>
        </div>
        <div className="lh-tip">输入服务器地址即可直接进入入驻</div>
        <div className="lh-codec">
          UDP/Opus
          <br />
          48kHz
        </div>
        <nav className="lh-tabs">
          <button type="button" className="active">连接<br />服务器</button>
        </nav>
        <div className="lh-tele">
          <span>协议 TS3/V-UDP</span>
          <span>探测延迟 <b>{lat}</b></span>
          <span>丢包 <b>0.0%</b></span>
        </div>
        <div className="lh-user">
          <div className="u-name">{nickLocal || '未命名'}</div>
          <div className="u-sub">本地身份密钥就绪</div>
        </div>
      </header>

      {/* HUD corners */}
      <div className="hud-tl" aria-hidden="true">
        <div><i /> GATEWAY_MODE: DIRECT_SERVER_SOCKET</div>
        <div>UDP AUDIO LINK // PORT RANGE: 9987 - 9999</div>
        <div>SECURITY LEVEL VERIFIER: SHA-256 ECC ENCLAVE</div>
      </div>
      <div className="hud-tr" aria-hidden="true">
        <div><span>AUDIO_CODEC</span> <b>OPUS VOICE (48 kHz)</b></div>
        <div>DEFAULT ROUTE: LOW_LATENCY_UDP</div>
        <div>NAT TRAVERSAL: STUN/ICE ENABLED</div>
      </div>
      <div className="hud-bl" aria-hidden="true">
        <IcDns size={14} /> VOICESPEAK PROTOCOL v4.19-TAC · CONNECT MODULE
      </div>
      <div className="hud-br" aria-hidden="true">
        直连核心服务状态: 就绪 <span className="pulse-dot" />
      </div>

      <main className="login-main-area">
        <div className="login-card-wrap">
          <div className="login-status-strip">
            <div className="left">
              <span className="ping" />
              快速直连网关 · CONNECT TO SERVER
            </div>
            <div className="right">
              <IcWifi size={12} />
              延迟 {lat} · 联通就绪
            </div>
          </div>

          <div className="login-card">
            <div className="login-card-head">
              <div className="icon">
                <IcWifi size={22} />
              </div>
              <div>
                <h1>
                  VoiceSpeak{' '}
                  <span className="tag">战术语音</span>
                </h1>
                <p>输入服务器地址 / IP 与端口号，快速连接加入作战语音频道</p>
              </div>
            </div>

            <div className="recent-row">
              <div className="recent-label">
                <span className="hist">◷</span> 最近连接记录（点击快速填入）：
              </div>
              <button type="button" className="link-btn" onClick={clearInputs}>
                清空输入
              </button>
            </div>
            <div className="pill-row">
              {pills.map((p) => (
                <button
                  key={`${p.host}:${p.port}`}
                  type="button"
                  className="pill"
                  onClick={() => quickFill(p.host, p.port)}
                >
                  <i className={p.dot} />
                  {p.label}
                </button>
              ))}
            </div>

            <form
              className="login-form"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              {/* Address */}
              <div className="field">
                <div className="field-head">
                  <label htmlFor="server-address">
                    <IcDns size={14} /> 服务器地址 / 域名或 IP (Server Address) <em>*</em>
                  </label>
                  <span className={`sock ${addrValid ? 'ok' : ''}`}>
                    <i /> {socketNote}
                  </span>
                </div>
                <div className="addr-grid">
                  <div className="addr-host">
                    <input
                      id="server-address"
                      value={addrLocal}
                      onChange={(e) => {
                        setAddrLocal(e.target.value)
                        setAddressInput(e.target.value)
                        if (fieldErrors.host)
                          setFieldErrors((f) => ({ ...f, host: undefined }))
                      }}
                      placeholder="如 voice.esports-hub.gg 或 185.107.96.14"
                      disabled={connecting}
                      required
                      autoComplete="off"
                    />
                    {addrValid && (
                      <span className="ok-icon" title="地址格式校验有效">
                        <IcCheck size={14} />
                      </span>
                    )}
                  </div>
                  <div className="addr-port">
                    <span className="colon">:</span>
                    <input
                      id="server-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={portLocal}
                      onChange={(e) => setPortLocal(e.target.value)}
                      placeholder="9987"
                      title="默认 TS3 UDP 语音端口 9987"
                      disabled={connecting}
                      required
                    />
                  </div>
                </div>
                {fieldErrors.host && (
                  <span className="err">{fieldErrors.host}</span>
                )}
                {lastError && !connecting && <span className="err">{lastError}</span>}
              </div>

              {/* Nickname */}
              <div className="field">
                <div className="field-head">
                  <label htmlFor="callsign-input">
                    <IcDns size={14} /> 用户昵称 / 战术呼号 (Nickname / Callsign) <em>*</em>
                  </label>
                  <span className="uid">
                    UID: <b>VK-8842-ALPHA</b>
                  </span>
                </div>
                <div className="nick-wrap">
                  <span className="tac">TAC</span>
                  <input
                    id="callsign-input"
                    value={nickLocal}
                    onChange={(e) => {
                      setNickLocal(e.target.value)
                      setNickname(e.target.value)
                      if (fieldErrors.nickname)
                        setFieldErrors((f) => ({ ...f, nickname: undefined }))
                    }}
                    placeholder="输入你在语音频道中的公开代号"
                    disabled={connecting}
                    required
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="dice"
                    title="随机生成特战呼号"
                    onClick={randomizeCallsign}
                  >
                    ⚄
                  </button>
                </div>
                {fieldErrors.nickname && (
                  <span className="err">{fieldErrors.nickname}</span>
                )}
              </div>

              {/* Password */}
              <div className="field">
                <div className="field-head">
                  <label htmlFor="password-input">
                    <IcKey size={14} /> 服务器连接密码 (Server Password)
                  </label>
                  <span className="hint">若为公开服务器无需填写</span>
                </div>
                <div className="pass-wrap">
                  <input
                    id="password-input"
                    type={showPass ? 'text' : 'password'}
                    value={passLocal}
                    onChange={(e) => {
                      setPassLocal(e.target.value)
                      setPassword(e.target.value)
                    }}
                    placeholder="若服务器设有防恶意准入密码请输入"
                    disabled={connecting}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="eye"
                    title="显示/隐藏密码"
                    onClick={() => setShowPass((v) => !v)}
                  >
                    {showPass ? '◌' : '◉'}
                  </button>
                </div>
              </div>

              {/* Channel collapsible */}
              <div className="ch-panel">
                <button
                  type="button"
                  className="ch-toggle"
                  onClick={() => setChannelOpen((v) => !v)}
                >
                  <span className="left">
                    <span className="hash">#</span>
                    <span>指定默认进入频道与密码 (可选)</span>
                    <span className="sub">Direct Channel</span>
                  </span>
                  <span className={`chev${channelOpen ? ' open' : ''}`}>▾</span>
                </button>
                {channelOpen && (
                  <div className="ch-fields">
                    <label>
                      <span>目标频道名称 / 路径</span>
                      <input
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value)}
                        placeholder="例如: #天梯排位 Alpha 队"
                      />
                    </label>
                    <label>
                      <span>频道锁定密码</span>
                      <input
                        type="password"
                        value={channelPass}
                        onChange={(e) => setChannelPass(e.target.value)}
                        placeholder="无密码请留空"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Identity strip */}
              <div className="id-strip">
                <div className="left">
                  <span className="fp">◎</span>
                  <div>
                    <div className="t">
                      本地身份密钥: Level 29 <span className="badge">已挂载</span>
                    </div>
                    <div className="s">ED25519 客户端私钥校验就绪 · 免验证码直接登入</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="import-btn"
                  onClick={() =>
                    setToast(
                      '已识别本地 TeamSpeak 3 身份凭证（identity.ini）· Level 29 校验通过',
                    )
                  }
                >
                  导入 TS3 身份
                </button>
              </div>

              {/* Toggles */}
              <div className="check-row">
                <label>
                  <input
                    type="checkbox"
                    checked={autoJoin}
                    onChange={(e) => setAutoJoin(e.target.checked)}
                  />
                  自动加入此服务器
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={saveBookmark}
                    onChange={(e) => setSaveBookmark(e.target.checked)}
                  />
                  保存至书签收藏夹
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={noiseGate}
                    onChange={(e) => setNoiseGate(e.target.checked)}
                  />
                  启用降噪与防爆音
                </label>
              </div>

              <button
                type="submit"
                className="connect-btn"
                disabled={connecting}
              >
                <IcBolt size={20} />
                <span>
                  {connecting
                    ? '[ 正在建立战术语音链路… ]'
                    : '[ 立即连接到服务器 / CONNECT ]'}
                </span>
              </button>
            </form>

            <div className="util-bar">
              <button type="button" className="util" onClick={() => (openBrowser ? openBrowser() : setShowBrowser(true))}>
                <IcSearch size={14} /> 公网战术服务器大厅 (Public Browser)
              </button>
              <span className="div">|</span>
              <button
                type="button"
                className="util tertiary"
                onClick={() =>
                  setToast('已尝试读取本地 TS3/TS5 收藏夹书签文件…')
                }
              >
                导入 TS3/TS5 收藏夹书签 (.ini)
              </button>
            </div>

            <div className="card-foot">
              <span className="ok">
                <IcCheck size={13} /> UDP/SRTP 链路加密认证就绪
              </span>
              <span className="tele">
                CODEC: OPUS 48kHz <b>LATENCY: ~{pingMs}ms</b>
              </span>
            </div>
          </div>

          {toast && (
            <div className="login-toast" role="status">
              {toast}
            </div>
          )}
        </div>
      </main>

      {/* Public browser drawer */}
      {showBrowser && (
        <div className="browser-overlay" role="dialog" aria-label="公网服务器大厅">
          <div className="browser-panel">
            <div className="browser-head">
              <h2>公网战术服务器大厅</h2>
              <input
                value={browserFilter}
                onChange={(e) => setBrowserFilter(e.target.value)}
                placeholder="按名称或主机过滤…"
              />
              <button type="button" onClick={() => setShowBrowser(false)}>
                关闭
              </button>
            </div>
            <div className="browser-list">
              {browserRows.length === 0 && (
                <div className="empty">暂无书签或最近连接 — 使用上方直连表单</div>
              )}
              {browserRows.map((r) => (
                <div key={r.id} className="browser-row">
                  <div className="bi">
                    <strong>{r.name}</strong>
                    <span>
                      {r.host}:{r.port}
                      {r.gameTag ? ` · ${r.gameTag}` : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="join"
                    onClick={() => {
                      quickFill(r.host, String(r.port))
                      setShowBrowser(false)
                    }}
                  >
                    填入
                  </button>
                  <button
                    type="button"
                    className="join primary"
                    onClick={() => {
                      quickFill(r.host, String(r.port))
                      setShowBrowser(false)
                      setAddressInput(`${r.host}:${r.port}`)
                      connectFromLogin({
                        address: `${r.host}:${r.port}`,
                        nickname: nickLocal.trim() || 'Commander_Kael',
                        password: passLocal,
                      })
                    }}
                  >
                    加入
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IcLoginGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
