import type { ReactNode } from 'react'
import {
  IcBell,
  IcBolt,
  IcBot,
  IcHeadset,
  IcMic,
  IcMusic,
  IcSettings,
  IcShieldPerson,
  IcUsers,
  IcVolumeUp,
  IcWave,
} from './TacIcons'

export type NavKey = 'channels' | 'audio' | 'browser' | 'permissions'

export interface AppChromeProps {
  connected: boolean
  nickname: string
  serverName?: string | null
  host?: string
  selfLatency: number | null
  muted: boolean
  deafened: boolean
  soundsOn: boolean
  musicBotUrl?: string
  nav: NavKey
  /** full = channels 3-pane; solo = settings/browser/permissions single main */
  layout?: 'full' | 'solo'
  setNav: (n: NavKey) => void
  onGoLogin?: () => void
  openSettings: (nav: 'audio' | 'account') => void
  toggleSounds: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  children: ReactNode
}

export function AppChrome({
  connected,
  nickname,
  serverName,
  host,
  selfLatency,
  muted,
  deafened,
  soundsOn,
  musicBotUrl,
  nav,
  layout = 'full',
  setNav,
  onGoLogin,
  openSettings,
  toggleSounds,
  toggleMute,
  toggleDeafen,
  children,
}: AppChromeProps) {
  const role = nickname ? '服务器管理员' : '—'
  const lat = selfLatency != null ? `${selfLatency}ms` : '—'
  return (
    <div className="app" style={{ flexDirection: 'column' }}>
      <div
        className="app-shell"
        style={
          layout === 'full' && connected
            ? undefined
            : {
                gridTemplateColumns: 'var(--rail-w) minmax(0, 1fr)',
                gridTemplateRows: 'var(--header-h) minmax(0, 1fr)',
                gridTemplateAreas: '"rail header" "rail main"',
              }
        }
      >
        {/* Left icon rail */}
        <aside className="nav-rail">
          <button
            type="button"
            className="rail-logo"
            title="返回登录页"
            aria-label="返回登录页"
            onClick={onGoLogin}
          >
            <IcWave size={20} />
          </button>
          <nav className="rail-nav" aria-label="主导航">
            <button
              type="button"
              className={`rail-button${nav === 'channels' ? ' active' : ''}`}
              title="频道与语音"
              aria-label="频道与语音"
              onClick={() => setNav('channels')}
            >
              <IcVolumeUp size={20} />
            </button>
            <button
              type="button"
              className={`rail-button${nav === 'audio' ? ' active' : ''}`}
              title="音频与快捷键"
              aria-label="音频与快捷键"
              onClick={() => setNav('audio')}
            >
              <IcSettings size={20} />
              {connected && <span className="rail-dot" />}
            </button>
            <button
              type="button"
              className={`rail-button${nav === 'browser' ? ' active' : ''}`}
              title="服务器浏览器"
              aria-label="服务器浏览器"
              onClick={() => setNav('browser')}
            >
              <IcGamepadFallback />
            </button>
            <button
              type="button"
              className={`rail-button${nav === 'permissions' ? ' active' : ''}`}
              title="权限与管理"
              aria-label="权限与管理"
              onClick={() => setNav('permissions')}
            >
              <IcUsers size={20} />
              <span className="rail-dot alert" />
            </button>
          </nav>
          <div className="rail-bottom">
            <button
              type="button"
              className="rail-button"
              title="新建连接"
              aria-label="新建连接"
              onClick={() => setNav('browser')}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
            </button>
            <button
              type="button"
              className="rail-button"
              title="设置"
              aria-label="设置"
              onClick={() => {
                setNav('audio')
                openSettings('audio')
              }}
            >
              <IcSettings size={18} />
            </button>
          </div>
        </aside>

        {/* Top header */}
        <header className="tac-header">
          <div className="tac-brand">
            <div className="tac-brand-mark">
              <IcBot size={18} />
            </div>
            <div className="tac-brand-copy">
              <strong>VoiceSpeak</strong>
              <span>战术语音</span>
            </div>
          </div>
          <div className="tac-conn">
            <span className={`tac-conn-dot${connected ? '' : ' off'}`} />
            <div>
              <div className={`tac-conn-label${connected ? '' : ' off'}`}>
                {connected ? '已连接' : '未连接'}
              </div>
            </div>
            <div className="tac-conn-meta">
              <span>{serverName || host || '主服务器'}</span>
              <span>{connected ? 'EU-中部' : '待机'}</span>
            </div>
          </div>
          <div className="tac-codec">
            <span>Opus</span>
            <strong>48kHz / 128kbps</strong>
          </div>
          <div className="tac-telemetry" aria-label="网络遥测">
            <span>
              延迟 <span className="t-val">{lat}</span>
            </span>
            <span className="t-sep">|</span>
            <span>
              抖动 <span className="t-val">{connected ? '1.2ms' : '—'}</span>
            </span>
            <span className="t-sep">|</span>
            <span>
              丢包 <span className="t-val">{connected ? '0.0%' : '—'}</span>
            </span>
          </div>
          <div className="tac-actions">
            <button
              type="button"
              className={`icon-btn${muted ? ' off' : ''}`}
              title={muted ? '取消静音' : '静音麦克风'}
              aria-pressed={muted}
              onClick={toggleMute}
            >
              {muted ? <IcMic size={16} /> : <IcMic size={16} />}
            </button>
            <button
              type="button"
              className={`icon-btn${deafened ? ' off' : ''}`}
              title={deafened ? '取消闭听' : '闭听'}
              aria-pressed={deafened}
              onClick={toggleDeafen}
            >
              <IcHeadset size={16} />
            </button>
            <button
              type="button"
              className={`icon-btn${soundsOn ? '' : ' off'}`}
              title={soundsOn ? '通知音效开' : '通知音效关'}
              aria-pressed={soundsOn}
              onClick={toggleSounds}
            >
              <IcBell size={16} />
            </button>
            {!!musicBotUrl && (
              <button
                type="button"
                className="icon-btn"
                title="点歌机器人"
                onClick={() => window.open(musicBotUrl, '_blank', 'noopener,noreferrer')}
              >
                <IcMusic size={16} />
              </button>
            )}
            <div className="tac-user">
              <span className="u-name">{nickname || '未命名'}</span>
              <span className="u-role">{role}</span>
            </div>
          </div>
        </header>

        {/* Main content slot */}
        {children}
      </div>
    </div>
  )
}

function IcGamepadFallback() {
  return <IcBolt size={20} />
}

/** Simple gamepad-ish icon via users fallback kept intentional */
export { IcShieldPerson }
