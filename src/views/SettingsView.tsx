import { useState } from 'react'
import { IcBell, IcBot, IcCheck, IcHeadset, IcMic, IcMusic, IcShieldPerson, IcSettings, IcTune, IcVolumeUp, IcWave } from '../components/TacIcons'
import type { SettingsNav, MicrophoneController } from './types'

export interface SettingsViewProps {
  nickname: string
  setNickname: (v: string) => void
  onBack: () => void
  leaveServer: () => void
  settingsNav: SettingsNav
  setSettingsNav: (n: SettingsNav) => void
  mic: MicrophoneController
  muted: boolean
  inputDb: number
  voxPct: number
  rnnoiseOn: boolean
  toggleRnnoise: () => void
  aecOn: boolean
  toggleAec: () => void
  agcOn: boolean
  toggleAgc: () => void
  outputDevices: MediaDeviceInfo[]
  sinkId: string
  setSinkId: (v: string) => void
  applySinkId: (v: string) => void
  soundsOn: boolean
  toggleSounds: () => void
  desktopNotifyOn: boolean
  toggleDesktopNotify: () => void
  authRequired: boolean
  gatewayToken: string
  onGatewayTokenChange: (v: string) => void
  resetSettings: () => void
  saveSettings: () => void
  catalog?: { bookmarks: { id: string; name: string; host: string; port: number; note?: string }[] }
  addBookmark?: (name: string, host: string, port: number, nickname?: string) => void
  removeBookmark?: (id: string) => void
  syncWhisper?: (clients: number[], channels: number[]) => void
  whisperClients?: number[]
  whisperChannels?: number[]
}

const MODULES = [
  { key: 'playback', icon: 'vol', label: '播放与监听', meta: '默认', metaCls: '' },
  { key: 'capture', icon: 'mic', label: '采集与 DSP 引擎', meta: null, metaCls: 'live' },
  { key: 'keybinds', icon: 'kb', label: '快捷键与按键通话', meta: '已绑定 7', metaCls: 'tertiary' },
  { key: 'whisper', icon: 'wave', label: '耳语列表', meta: '激活', metaCls: 'primary' },
  { key: 'sound', icon: 'bell', label: '音效包与提示音', meta: '默认 TTS', metaCls: '' },
  { key: 'security', icon: 'shield', label: '安全与身份', meta: '等级 42', metaCls: 'tertiary' },
] as const

type ModuleKey = (typeof MODULES)[number]['key']

export function SettingsView(props: SettingsViewProps) {
  const {
    nickname,
    mic,
    muted,
    inputDb,
    voxPct,
    rnnoiseOn,
    toggleRnnoise,
    aecOn,
    toggleAec,
    agcOn,
    toggleAgc,
    outputDevices,
    sinkId,
    applySinkId,
    soundsOn,
    toggleSounds,
    resetSettings,
    saveSettings,
    onBack,
    syncWhisper,
    whisperClients = [],
    whisperChannels = [],
  } = props

  const [module, setModule] = useState<ModuleKey>('capture')
  const [profile] = useState('ESPORTS_LOW_JITTER.tsprf')

  const devices = mic.state.devices.filter((d) => d.kind === 'audioinput')

  const mode = mic.state.vox.mode === 'open' ? 'continuous' : mic.state.vox.mode === 'ptt' ? 'ptt' : 'vad'

  return (
    <div className="settings-page" style={{ gridArea: 'main', minHeight: 0 }}>
      <div className="settings-inner">
        {/* Diag strip */}
        <div className="diag-strip">
          <div className="diag-left">
            <div className="diag-icon">
              <IcTune size={22} />
            </div>
            <div>
              <div className="diag-title">
                <h1>音频矩阵与快捷键架构</h1>
                <span className="badge muted" style={{ color: 'var(--primary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  DSP 引擎 v4.2.1
                </span>
              </div>
              <p className="diag-sub">
                低开销低延迟 Opus 处理、空间耳语路由与战术硬件配置
              </p>
            </div>
          </div>
          <div className="diag-right">
            <div className="diag-chip">
              <div className="kv">
                <span className="k">I/O 缓冲延迟</span>
                <span className="v">2.18ms (96 samples)</span>
              </div>
              <span className="pulse" />
            </div>
            <div className="diag-chip">
              <div className="kv">
                <span className="k">当前配置档案</span>
                <span className="v blue" style={{ fontWeight: 500 }}>{profile}</span>
              </div>
              <IcShieldPerson size={16} style={{ color: 'var(--on-surface-variant)' }} />
            </div>
            <button type="button" className="ghost" onClick={onBack} title="返回主界面">
              ← 返回
            </button>
          </div>
        </div>

        <div className="settings-grid">
          {/* Left dock */}
          <aside className="settings-dock">
            <div className="mod-list">
              <span className="mod-list-label">配置模块</span>
              {MODULES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`mod-btn${module === m.key ? ' active' : ''}`}
                  onClick={() => setModule(m.key)}
                >
                  <span className="mod-btn-left">
                    <ModuleIcon kind={m.icon} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.label}
                    </span>
                  </span>
                  {m.metaCls === 'live' ? (
                    <span className="live-dot" />
                  ) : (
                    <span className={`mod-meta${m.metaCls ? ` ${m.metaCls}` : ''}`}>{m.meta}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="identity-card">
              <div className="identity-card-head">
                <span>当前身份证书</span>
                <IcCheck size={16} style={{ color: 'var(--tertiary)' }} />
              </div>
              <div className="identity-body">
                <div className="identity-avatar">
                  <IcBot size={22} />
                </div>
                <div className="identity-copy">
                  <div className="name">{nickname || 'Commander_Kael'}</div>
                  <div className="sha">SHA-256: 7f8a9e…01c4b2</div>
                  <div className="lvl">
                    <span className="l">安全等级:</span>{' '}
                    <span className="n">42 (26,450 bits)</span>
                  </div>
                </div>
              </div>
              <div className="identity-trust">
                <span>身份可信度</span>
                <span className="v">已验证 (100%)</span>
              </div>
              <div className="trust-bar" aria-hidden="true">
                <i />
              </div>
            </div>
          </aside>

          {/* Canvas */}
          <main className="settings-canvas">
            {/* Mic capture */}
            <section className="cfg-section">
              <div className="cfg-section-head">
                <div className="cfg-section-title">
                  <IcWave size={20} style={{ color: 'var(--primary-fixed)' }} />
                  <div>
                    <h2>麦克风采集与检测模式</h2>
                    <p>硬件前置放大集成与阈值响应计量</p>
                  </div>
                </div>
                <div className="mode-pills" role="group" aria-label="检测模式">
                  <button
                    type="button"
                    className={`mode-pill${mode === 'vad' ? ' active' : ''}`}
                    onClick={() => mic.setVox({ mode: 'vox' })}
                  >
                    语音活动 (VAD)
                  </button>
                  <button
                    type="button"
                    className={`mode-pill${mode === 'ptt' ? ' active' : ''}`}
                    onClick={() => mic.setVox({ mode: 'ptt' })}
                  >
                    按键通话 (PTT)
                  </button>
                  <button
                    type="button"
                    className={`mode-pill${mode === 'continuous' ? ' active' : ''}`}
                    onClick={() => mic.setVox({ mode: 'open' })}
                  >
                    常开发送
                  </button>
                </div>
              </div>

              <div className="cfg-grid cfg-grid-8-4">
                <div>
                  <span className="cfg-label">输入设备接口</span>
                  <div className="device-select">
                    <span className="eq">
                      <IcVolumeUp size={18} />
                    </span>
                    <select
                      value={mic.state.selectedId || ''}
                      onChange={(e) => void mic.requestMic(e.target.value)}
                      aria-label="输入设备"
                    >
                      {devices.length === 0 && <option value="">默认麦克风</option>}
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Input ${d.deviceId.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                    <span className="chev" aria-hidden="true">
                      ▾
                    </span>
                  </div>
                  {!mic.state.micOn && (
                    <button
                      type="button"
                      className="ghost"
                      style={{ marginTop: 6 }}
                      onClick={() => void mic.requestMic(mic.state.selectedId || undefined)}
                    >
                      请求麦克风权限
                    </button>
                  )}
                </div>
                <div>
                  <div className="gain-row">
                  <span className="cfg-label" style={{ marginBottom: 0 }}>输入前置增益</span>
                    <span className="gain-val">+4.5 dB</span>
                  </div>
                  <div className="gain-slider-wrap">
                    <IcMic size={14} style={{ color: 'var(--on-surface-variant)' }} />
                    <input type="range" min={-12} max={12} step={0.5} defaultValue={4.5} aria-label="前置增益" />
                    <IcMic size={14} style={{ color: 'var(--on-surface-variant)' }} />
                  </div>
                </div>
              </div>

              <div className="mic-test-bar">
                <button
                  type="button"
                  className={`mic-test-btn${mic.state.micOn && !muted ? ' rec' : ''}`}
                  onClick={() => (mic.state.micOn ? mic.stopMic() : void mic.requestMic())}
                >
                  {mic.state.micOn && !muted ? '■ 停止麦克风测试' : '▶ 开始麦克风测试'}
                </button>
                <span className="mic-test-hint">
                  回放本地麦克风缓冲区，网络延迟为 0%
                </span>
                <div className="mic-test-right">
                  <span>阈值门限:</span>
                  <span className="thr">-28 dB</span>
                  <span className="tx">● 传输中</span>
                </div>
              </div>

              <div className="db-scale">
                <span>-60 dB</span>
                <span>-45 dB</span>
                <span className="normal">-30 dB（正常）</span>
                <span>-12 dB</span>
                <span className="peak">-3 dB（峰值）</span>
                <span>0 dB</span>
              </div>
              <TestMeter db={muted ? -60 : inputDb} threshold={-28} />

              <div className="vad-row">
                <span className="lbl">声控灵敏度门限（滑动调整触发阈值）</span>
                <span className="pct">{voxPct}% 门限余量</span>
              </div>
              <input
                type="range"
                className="vad-slider"
                min={1}
                max={60}
                value={voxPct}
                onChange={(e) => mic.setVox({ threshold: Number(e.target.value) / 100 })}
                aria-label="VOX 阈值"
              />
            </section>

            {/* Codec engine */}
            <section className="cfg-section">
              <div className="cfg-section-head">
                <div className="cfg-section-title">
                  <IcSettings size={20} style={{ color: 'var(--primary-fixed)' }} />
                  <div>
                    <h2>编解码与信号处理引擎</h2>
                    <p>Opus 低延迟音频压缩、实时滤波与声学隔离</p>
                  </div>
                </div>
                <span className="badge cyan">FP32 加速</span>
              </div>
              <div className="engine-grid">
                <div className="engine-card">
                  <div className="engine-card-head">
                    <span>压缩编码器</span>
                    <IcCheck size={14} style={{ color: 'var(--primary)' }} />
                  </div>
                  <select defaultValue="opus" aria-label="编码器" disabled>
                    <option value="opus">Opus 语音（CBR 低延迟）</option>
                  </select>
                  <div className="desc">码率: 128 kbps（目标 &lt;1.5ms 编码）</div>
                </div>
                <div className="engine-card">
                  <div className="engine-card-head">
                    <span>内部采样率</span>
                    <IcCheck size={14} style={{ color: 'var(--primary)' }} />
                  </div>
                  <select defaultValue="48000" aria-label="采样率" disabled>
                    <option value="48000">48,000 Hz（广播级）</option>
                  </select>
                  <div className="desc">内核时钟直接锁定</div>
                </div>
                <div className="engine-card">
                  <div className="engine-card-head">
                    <span>键盘与 AI 降噪</span>
                  </div>
                  <div className="desc">
                    通过神经网络抑制机械键盘与机箱风扇噪声。
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span className="foot" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      DeepFilter <span style={{ color: 'var(--tertiary)' }}>{rnnoiseOn ? '开启' : '关闭'}</span>
                    </span>
                    <button
                      type="button"
                      className={`switch${rnnoiseOn ? ' on' : ''}`}
                      role="switch"
                      aria-checked={rnnoiseOn}
                      aria-label="RNNoise"
                      onClick={toggleRnnoise}
                    />
                  </div>
                </div>
              </div>
              <div className="toggle-row">
                <label className="toggle-card">
                  <span className="tc-left">
                    <input type="checkbox" checked={aecOn} onChange={toggleAec} />
                    回声消除 (AEC)
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>
                    开放麦泄漏
                  </span>
                </label>
                <label className="toggle-card">
                  <span className="tc-left">
                    <input type="checkbox" checked={agcOn} onChange={toggleAgc} />
                    自动增益控制 (AGC)
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>
                    耳语 ↔ 呼喊
                  </span>
                </label>
                <label className="toggle-card">
                  <span className="tc-left">
                    <input type="checkbox" checked readOnly />
                    高通滤波器 (80Hz)
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>
                    去除桌面低频
                  </span>
                </label>
              </div>
            </section>

            {/* Keybinds (visual only, key fields live) */}
            <section className="cfg-section">
              <div className="cfg-section-head">
                <div className="cfg-section-title">
                  <IcHeadset size={20} style={{ color: 'var(--primary-fixed)' }} />
                  <div>
                    <h2>自定义快捷键与全局热键</h2>
                    <p>硬件级拦截钩子，实现即时通讯与开关操作</p>
                  </div>
                </div>
                <button type="button" className="ghost">+ 添加快捷键</button>
              </div>
              <KeybindRow
                color="ok"
                action="按键通话（主语音）"
                keys={['MOUSE 5', '拇指键']}
                behavior="按住发射"
                scope="全局系统"
              />
              <KeybindRow
                color="off"
                action="战术耳语至指挥官"
                keys={['CTRL', 'NUMPAD 0']}
                behavior="按住（耳语列表 #1）"
                scope="全局系统"
              />
              <KeybindRow
                color="err"
                action="切换硬件麦克风静音"
                keys={['ALT', 'M']}
                behavior="按下切换"
                scope="全局系统"
              />
              <KeybindRow
                color="warn"
                action="闭听声音输出（关键时刻）"
                keys={['F9']}
                behavior="按下切换"
                scope="游戏内激活"
              />
              <KeybindRow
                color="off"
                action={`切换到子频道: ${nickname || 'Alpha 地堡'}`}
                keys={['CTRL', 'F1']}
                behavior="瞬时切换"
                scope="Apex Masters 欧服"
                dim
              />
            </section>

            {/* Output / notifications */}
            <section className="cfg-section">
              <div className="cfg-section-head">
                <div className="cfg-section-title">
                  <IcVolumeUp size={20} style={{ color: 'var(--primary-fixed)' }} />
                  <div>
                    <h2>播放与监听</h2>
                    <p>输出路由、提示音量与通知行为</p>
                  </div>
                </div>
              </div>
              <div className="cfg-grid cfg-grid-3">
                <div>
                  <span className="cfg-label">输出设备</span>
                  <div className="device-select">
                    <span className="eq">
                      <IcHeadset size={18} />
                    </span>
                    <select
                      value={sinkId}
                      onChange={(e) => {
                        props.setSinkId(e.target.value)
                        applySinkId(e.target.value)
                      }}
                      aria-label="输出设备"
                    >
                      <option value="">系统默认输出</option>
                      {outputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Output ${d.deviceId.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                    <span className="chev" aria-hidden="true">▾</span>
                  </div>
                </div>
                <div className="engine-card">
                  <div className="engine-card-head">
                    <span>音效包</span>
                    <IcBell size={14} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12 }}>界面与通知音效</span>
                    <button
                      type="button"
                      className={`switch${soundsOn ? ' on' : ''}`}
                      role="switch"
                      aria-checked={soundsOn}
                      aria-label="音效"
                      onClick={toggleSounds}
                    />
                  </div>
                  <div className="foot foot t">默认 TTS 提示</div>
                </div>
                <div className="engine-card">
                  <div className="engine-card-head">
                    <span>桌面通知</span>
                    <IcMusic size={14} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12 }}>操作系统通知</span>
                    <button
                      type="button"
                      className={`switch${props.desktopNotifyOn ? ' on' : ''}`}
                      role="switch"
                      aria-checked={props.desktopNotifyOn}
                      aria-label="桌面通知"
                      onClick={props.toggleDesktopNotify}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Whisper targets (bound) */}
            <section className="cfg-section">
              <div className="cfg-section-head">
                <div className="cfg-section-title">
                  <IcWave size={20} style={{ color: 'var(--primary-fixed)' }} />
                  <div>
                    <h2>战术耳语列表</h2>
                    <p>同步到网关的跨频道耳语目标</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => syncWhisper?.(whisperClients, whisperChannels)}
                >
                  同耳语到网关
                </button>
              </div>
              <div className="cfg-cards">
                <div className="cfg-card">
                  <span className="c-title">客户端目标</span>
                  <div className="c-body">
                    {whisperClients.length
                      ? whisperClients.map((id) => `#${id}`).join(', ')
                      : '无客户端目标'}
                  </div>
                </div>
                <div className="cfg-card">
                  <span className="c-title">频道目标</span>
                  <div className="c-body">
                    {whisperChannels.length
                      ? whisperChannels.map((id) => `CID ${id}`).join(', ')
                      : '无频道目标'}
                  </div>
                </div>
              </div>
              <div className="toggle-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={() => {
                    const next = [...new Set([...whisperClients, 2])]
                    syncWhisper?.(next, whisperChannels)
                  }}
                >
                  + 目标陈默 (id 2)
                </button>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={() => syncWhisper?.([], whisperChannels)}
                >
                  清空客户端目标
                </button>
              </div>
            </section>

            {/* Footer actions */}
            <div className="settings-footer">
              <div className="footer-left">
                <button type="button" className="ghost">⇩ 导出身份密钥 (.ini)</button>
                <button type="button" className="ghost">⇩ 导入配置</button>
              </div>
              <div className="footer-right">
                <button type="button" className="reset" onClick={resetSettings}>
                  恢复默认
                </button>
                <button type="button" className="discard" onClick={onBack}>
                  放弃更改
                </button>
                <button type="button" className="apply" onClick={saveSettings}>
                  <IcCheck size={16} /> 应用设置
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

function ModuleIcon({ kind }: { kind: string }) {
  const s = 18
  if (kind === 'mic') return <IcMic size={s} />
  if (kind === 'kb') return <IcSettings size={s} />
  if (kind === 'wave') return <IcWave size={s} />
  if (kind === 'bell') return <IcBell size={s} />
  if (kind === 'shield') return <IcShieldPerson size={s} />
  return <IcVolumeUp size={s} />
}

function KeybindRow({
  color,
  action,
  keys,
  behavior,
  scope,
  dim,
}: {
  color: 'ok' | 'off' | 'err' | 'warn'
  action: string
  keys: string[]
  behavior: string
  scope: string
  dim?: boolean
}) {
  return (
    <div className="keybind-row">
      <span className={`kb-dot${color === 'off' ? ' off' : color === 'err' ? ' err' : color === 'warn' ? ' warn' : ''}`} />
      <span className={`kb-action${dim ? ' dim' : ''}`}>{action}</span>
      <span className="kbd-chip">
        {keys.map((k, i) => (
          <span key={k}>
            {i > 0 && <span className="plus">+</span>}
            {k}
          </span>
        ))}
      </span>
      <span className="kb-behavior">{behavior}</span>
      <span className="kb-scope">{scope}</span>
      <button type="button" className="kb-edit" aria-label={`编辑 ${action}`}>
        ✎
      </button>
    </div>
  )
}

function TestMeter({ db, threshold }: { db: number; threshold: number }) {
  const segs = 32
  const norm = Math.max(0, Math.min(1, (db + 60) / 60))
  const onCount = Math.round(norm * segs)
  const thrPct = Math.max(0, Math.min(100, ((threshold + 60) / 60) * 100))
  return (
    <div className="led-meter" role="meter" aria-valuenow={db} aria-valuemin={-60} aria-valuemax={0}>
      {Array.from({ length: segs }, (_, i) => {
        const p = (i + 1) / segs
        const cls = i < onCount ? (p > 0.92 ? 'clip' : p > 0.8 ? 'warm' : 'on') : ''
        return <i key={i} className={cls} />
      })}
      <div className="led-threshold" style={{ left: `calc(${thrPct}% - 1px)` }} />
    </div>
  )
}
