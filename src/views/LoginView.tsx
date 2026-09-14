import type { Dispatch, SetStateAction } from 'react'
import { Input } from '@shared/components/ui/input'
import { Button } from '@shared/components/ui/button'
import { Switch as BrutalSwitch } from '@shared/components/ui/switch'
import { MicIcon } from '../components/icons'
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
  connectFromLogin: () => void
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
  connectAsGuest,
  disconnect,
  recent,
  pickRecent,
  clearRecent,
  rememberServer,
  setRememberServer,
  micOk,
  micDeviceName,
  micPermission,
  requestMic,
  setHelpOpen,
}: LoginViewProps) {
  const lastFailed = !!lastError && !connecting
  const dnsLike =
    lastFailed && /解析|dns|resolve|enotfound|not found/i.test(lastError || '')
  const hostError = fieldErrors.host
  const nickError = fieldErrors.nickname

  return (
    <div className="login-page">
      {connecting && <div className="opening-stamp">连接中…</div>}
      <div className="login-main">
        <div className="login-sheet">
        <div className="login-kicker">TeamSpeak Web</div>
        <h1 className="login-title">连接到服务器</h1>
        <p className="login-sub">
          {connecting
            ? `正在接通 ${host || ''}:${port || ''}`
            : '在浏览器中加入语音会话，无需安装应用。'}
        </p>
        <div className="login-form">
          <label className={`field${hostError ? ' invalid' : ''}`}>
            <span className="field-label">服务器地址</span>
            <Input
              value={addressInput}
              onChange={(e) => {
                setAddressInput(e.target.value)
                if (fieldErrors.host)
                  setFieldErrors((f) => ({ ...f, host: undefined }))
              }}
              placeholder="ts.example.com:9987"
              disabled={connecting}
              className="h-11"
            />
            {hostError && <span className="field-error">{hostError}</span>}
            {lastFailed && (
              <span className="field-error">
                {dnsLike
                  ? '无法解析服务器地址，请检查域名与端口（默认 9987）'
                  : lastError}
              </span>
            )}
          </label>

          <label className={`field${nickError ? ' invalid' : ''}`}>
            <span className="field-label">昵称</span>
            <Input
              value={nickname || ''}
              onChange={(e) => {
                setNickname(e.target.value)
                if (fieldErrors.nickname)
                  setFieldErrors((f) => ({ ...f, nickname: undefined }))
              }}
              placeholder="你的昵称"
              disabled={connecting}
              className="h-11"
            />
            {nickError && <span className="field-error">{nickError}</span>}
          </label>

          <label className="field">
            <span className="field-label">服务器密码（可选）</span>
            <Input
              type="password"
              value={password || ''}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="部分服务器需要"
              disabled={connecting}
              className="h-11"
              autoComplete="off"
            />
          </label>

          <div className="mic-check">
            <span className={`mic-check-state${micOk ? ' ok' : ''}`}>
              <MicIcon off={!micOk} />
              {lastFailed
                ? '上次连接失败。请检查地址后重试。'
                : micOk
                  ? `麦克风可用 · ${micDeviceName || '已连接'}`
                  : micPermission === 'denied'
                    ? '无法访问麦克风。请在浏览器中允许访问。'
                    : '正在检查麦克风…'}
            </span>
            {lastFailed ? (
              <button type="button" className="link-btn" onClick={() => setHelpOpen(true)}>
                帮助
              </button>
            ) : (
              <button type="button" className="link-btn" onClick={requestMic}>
                重测
              </button>
            )}
          </div>

          {connecting && (
            <div className="encrypt-row">
              <span className="encrypt-track"><i /></span>
              <span className="encrypt-text">正在经网关建立加密桥接…</span>
              <button type="button" className="ghost" onClick={disconnect}>
                取消
              </button>
            </div>
          )}

          <div className="remember-row">
            <span>记住此服务器</span>
            <BrutalSwitch
              checked={rememberServer}
              onCheckedChange={(v) => setRememberServer(!!v)}
              aria-label="记住此服务器"
            />
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full login-cta"
            disabled={connecting}
            loading={connecting}
            onClick={connectFromLogin}
          >
            {connecting ? '连接中…' : lastFailed ? '重试' : '连接'}
          </Button>

          <div className="login-or"><span>或</span></div>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={connecting}
            onClick={connectAsGuest}
          >
            以访客身份继续
          </Button>

          <div className="recent-block">
            <div className="recent-head">
              <span>最近连接</span>
              {recent.length > 0 && (
                <button type="button" className="link-btn" onClick={clearRecent}>
                  清除
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <div className="recent-empty">暂无记录</div>
            ) : (
              <ul className="recent-list">
                {recent.map((r) => (
                  <li key={`${r.host}:${r.port}`}>
                    <button type="button" onClick={() => pickRecent(r)}>
                      <span className="recent-label">{r.label}</span>
                      <span className="recent-addr">
                        {r.host}:{r.port}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        </div>
        <div className="login-foot">
          <div className="login-tagline">
            浏览器语音客户端 · 网关加密桥接（建议 HTTPS）· 按键/声控 · 降噪
          </div>
          <div className="brand-foot">TeamSpeak Web</div>
        </div>
      </div>
    </div>
  )
}
