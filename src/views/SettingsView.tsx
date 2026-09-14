import type { ReactNode } from 'react'
import { Input } from '@shared/components/ui/input'
import { Button } from '@shared/components/ui/button'
import { Slider as BrutalSlider } from '@shared/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@shared/components/ui/toggle-group'
import { SettingRow, Switch } from '../components/controls'
import type { SettingsNav, MicrophoneController } from './types'

function ActivationControls({
  mic,
  voxPct,
}: {
  mic: MicrophoneController
  voxPct: number
}) {
  return (
    <>
      <SettingRow
        label="发送方式"
        right={<span className="setting-status">当前：{mic.state.vox.mode === 'open' ? '常开' : mic.state.vox.mode === 'vox' ? '语音控制' : '按键通话'}</span>}
      >
        <ToggleGroup
          type="single"
          value={mic.state.vox.mode}
          onValueChange={(v) => {
            if (v) mic.setVox({ mode: v as 'open' | 'vox' | 'ptt' })
          }}
          className="justify-start gap-1.5"
        >
          <ToggleGroupItem value="open" className="h-9 px-3 text-sm">常开</ToggleGroupItem>
          <ToggleGroupItem value="vox" className="h-9 px-3 text-sm">语音控制</ToggleGroupItem>
          <ToggleGroupItem value="ptt" className="h-9 px-3 text-sm">按键通话</ToggleGroupItem>
        </ToggleGroup>
      </SettingRow>
      {mic.state.vox.mode === 'vox' && (
        <SettingRow label="VOX 阈值" right={<span className="setting-status">{voxPct}%</span>}>
          <BrutalSlider
            min={1}
            max={60}
            value={[voxPct]}
            onValueChange={(v) => mic.setVox({ threshold: (v[0] ?? 1) / 100 })}
            className="max-w-[240px]"
          />
        </SettingRow>
      )}
      {mic.state.vox.mode === 'ptt' && (
        <SettingRow
          label="按键说话快捷键"
          right={<span className="setting-status">{mic.keyLabel(mic.state.vox.pttKey)}</span>}
        >
          <button
            type="button"
            className="key-capture"
            onClick={() => {
              const onKey = (e: KeyboardEvent) => {
                e.preventDefault()
                if (e.code !== 'Escape') mic.setVox({ pttKey: e.code })
                window.removeEventListener('keydown', onKey, true)
              }
              window.addEventListener('keydown', onKey, true)
            }}
          >
            {mic.keyLabel(mic.state.vox.pttKey)}
            <span className="key-capture-hint">点击后按新键</span>
          </button>
        </SettingRow>
      )}
    </>
  )
}

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
  setSinkId: (id: string) => void
  applySinkId: (id: string) => void
  soundsOn: boolean
  toggleSounds: () => void
  desktopNotifyOn: boolean
  toggleDesktopNotify: () => void
  authRequired: boolean
  gatewayToken: string
  onGatewayTokenChange: (v: string) => void
  resetSettings: () => void
  saveSettings: () => void
}

export function SettingsView({
  nickname,
  setNickname,
  onBack,
  leaveServer,
  settingsNav,
  setSettingsNav,
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
  setSinkId,
  applySinkId,
  soundsOn,
  toggleSounds,
  desktopNotifyOn,
  toggleDesktopNotify,
  authRequired,
  gatewayToken,
  onGatewayTokenChange,
  resetSettings,
  saveSettings,
}: SettingsViewProps) {
  const navItems: { id: SettingsNav; label: string }[] = [
    { id: 'account', label: '帐号与身份' },
    { id: 'audio', label: '音频与语音' },
    { id: 'activation', label: '语音激活' },
    { id: 'notify', label: '通知' },
    { id: 'theme', label: '界面与主题' },
    { id: 'network', label: '网络与网关' },
  ]
  const titles: Record<SettingsNav, { title: string; sub: string }> = {
    account: { title: '帐号与身份', sub: '昵称与身份信息，保存在本机' },
    audio: { title: '音频与语音', sub: '设备音量在这调，改完就生效' },
    activation: { title: '语音激活', sub: '啥时候开口，你说了算' },
    notify: { title: '通知', sub: '来消息了，要不要吱一声' },
    theme: { title: '界面与主题', sub: '界面怎么顺眼怎么来' },
    network: { title: '网络与网关', sub: '网关和端口，都在这' },
  }
  const t = titles[settingsNav]

  const renderContent = (): ReactNode => {
    switch (settingsNav) {
      case 'account':
        return (
          <SettingRow label="昵称">
            <Input
              value={nickname || ''}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="你的昵称"
              className="max-w-[300px] h-10"
            />
          </SettingRow>
        )
      case 'audio':
        return (
          <>
            {mic.state.permission === 'denied' && (
              <div className="error-box">
                麦克风权限被拒绝 → 在浏览器地址栏左侧锁形图标中重新允许
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() =>
                      void mic.requestMic(mic.state.selectedId || undefined)
                    }
                  >
                    重试
                  </button>
                </div>
              </div>
            )}
            <SettingRow
              label="输入设备"
              right={
                <span className="setting-status">
                  已授权 · 48 kHz · 单声道
                </span>
              }
            >
              <select
                value={mic.state.selectedId}
                onChange={async (e) => {
                  const id = e.target.value
                  mic.setState((s) => ({ ...s, selectedId: id }))
                  if (mic.state.micOn) await mic.requestMic(id)
                }}
              >
                {mic.state.devices.length === 0 && (
                  <option value="">识别中…</option>
                )}
                {mic.state.devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId.slice(0, 6)}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow
              label="输入电平"
              right={<span className="setting-status">{inputDb} dB</span>}
            >
              <div className="level-meter">
                <span
                  style={{
                    width: `${Math.round((muted ? 0 : mic.state.level) * 100)}%`,
                  }}
                />
              </div>
            </SettingRow>
            <SettingRow label="AI 降噪 RNNoise">
              <Switch on={rnnoiseOn} onToggle={toggleRnnoise} label="AI 降噪 RNNoise" />
            </SettingRow>
            <SettingRow label="回声消除 · 软件 AEC">
              <Switch on={aecOn} onToggle={toggleAec} label="回声消除 · 软件 AEC" />
            </SettingRow>
            <SettingRow label="自动增益">
              <Switch on={agcOn} onToggle={toggleAgc} label="自动增益" />
            </SettingRow>
            <ActivationControls mic={mic} voxPct={voxPct} />
            <SettingRow
              label="输出设备"
              right={
                <span className="setting-status">
                  {outputDevices.length} 个输出设备可用
                </span>
              }
            >
              <select
                value={sinkId}
                onChange={(e) => {
                  const id = e.target.value
                  setSinkId(id)
                  applySinkId(id)
                  void mic.setOutputDevice(id)
                }}
              >
                <option value="">系统默认</option>
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow
              label="主音量"
              right={
                <span className="setting-status">
                  {Math.round(mic.state.outputVolume * 100)}%
                </span>
              }
            >
              <BrutalSlider
                min={0}
                max={200}
                value={[Math.round(mic.state.outputVolume * 100)]}
                onValueChange={(v) => mic.setOutputVolume((v[0] ?? 0) / 100)}
                className="max-w-[240px]"
              />
            </SettingRow>
            <SettingRow label="通知音效（进出 / 私聊 / Poke）">
              <Switch on={soundsOn} onToggle={toggleSounds} label="通知音效" />
            </SettingRow>
            <SettingRow label="桌面通知（页面失焦时弹出）">
              <Switch
                on={desktopNotifyOn}
                onToggle={toggleDesktopNotify}
                label="桌面通知"
              />
            </SettingRow>
          </>
        )
      case 'activation':
        return <ActivationControls mic={mic} voxPct={voxPct} />
      case 'notify':
        return (
          <>
            <SettingRow label="通知音效（进出 / 私聊 / Poke）">
              <Switch on={soundsOn} onToggle={toggleSounds} label="通知音效" />
            </SettingRow>
            <SettingRow label="桌面通知（页面失焦时弹出）">
              <Switch
                on={desktopNotifyOn}
                onToggle={toggleDesktopNotify}
                label="桌面通知"
              />
            </SettingRow>
          </>
        )
      case 'theme':
        return (
          <SettingRow label="主题">
            <div className="theme-options">
              <button type="button" className="theme-option active">
                浅色（默认）
              </button>
              <button type="button" className="theme-option" disabled title="即将上线">
                深色
              </button>
            </div>
          </SettingRow>
        )
      case 'network':
        return (
          <>
            {(authRequired || gatewayToken) ? (
              <SettingRow label="网关 Token">
                <Input
                  type="password"
                  value={gatewayToken}
                  onChange={(e) => onGatewayTokenChange(e.target.value)}
                  placeholder={authRequired ? '必填' : '可选'}
                  className="max-w-[300px] h-10"
                />
              </SettingRow>
            ) : (
              <SettingRow label="网关认证">
                <span className="setting-hint">当前网关无需认证</span>
              </SettingRow>
            )}
            <SettingRow label="默认端口">
              <span className="setting-hint">TeamSpeak 语音端口默认为 9987</span>
            </SettingRow>
          </>
        )
    }
  }

  return (
    <div className="settings-view">
      <header className="settings-bar">
        <button
          type="button"
          className="settings-back"
          onClick={onBack}
          aria-label="返回"
        >
          ‹
        </button>
        <strong>设置</strong>
        <span className="settings-bar-nick">{nickname || '未命名'}</span>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="设置分类">
          {navItems.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`settings-nav-item${settingsNav === n.id ? ' active' : ''}`}
              onClick={() => setSettingsNav(n.id)}
            >
              <span className="settings-nav-icon" aria-hidden="true">
                {n.id === 'account'
                  ? '●'
                  : n.id === 'audio'
                    ? '♪'
                    : n.id === 'activation'
                      ? '◉'
                      : n.id === 'notify'
                        ? '◇'
                        : n.id === 'theme'
                          ? '▣'
                          : '◎'}
              </span>
              <span>{n.label}</span>
            </button>
          ))}
          <div className="nav-spacer" />
          <button
            type="button"
            className="settings-nav-item danger"
            onClick={leaveServer}
          >
            断开连接
          </button>
        </nav>
        <section className="settings-content">
          <div className="settings-head">
            <h2>{t.title}</h2>
            <p>{t.sub}</p>
          </div>
          <div className="settings-card">{renderContent()}</div>
          <div className="settings-actions">
            <Button variant="outline" size="sm" onClick={resetSettings}>
              恢复默认
            </Button>
            <Button variant="primary" size="sm" onClick={saveSettings}>
              保存
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
