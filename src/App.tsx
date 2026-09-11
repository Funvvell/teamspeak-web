import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_VOICE_PORT,
  type ChannelNode,
  type ClientInfo,
  type ConnectionState,
  type GatewayToClient,
} from '../shared/types'
import { createGatewayClient, type WsStatus } from './lib/gateway-client'
import { useMicrophone } from './lib/mic'

interface ChatMsg {
  from: string
  fromId: number
  target: string
  text: string
  ts: number
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusBadge(state: ConnectionState) {
  if (state === 'connected') return 'badge ok'
  if (state === 'connecting') return 'badge connecting'
  if (state === 'error') return 'badge err'
  return 'badge'
}

function ChannelListView({
  channels,
  selfId,
  activeChannelId,
  onJoin,
}: {
  channels: ChannelNode[]
  selfId: number | null
  activeChannelId: number | null
  onJoin: (id: number) => void
}) {
  if (!channels.length) {
    return <div className="empty">连接后显示频道树</div>
  }

  const byParent = new Map<number | null, ChannelNode[]>()
  for (const ch of channels) {
    const key = ch.parentId
    const list = byParent.get(key) ?? []
    list.push(ch)
    byParent.set(key, list)
  }

  function render(parentId: number | null, depth = 0): ReactNode {
    const list = (byParent.get(parentId) ?? []).slice().sort((a, b) => a.id - b.id)
    return list.map((ch) => (
      <li key={ch.id} style={{ marginLeft: depth * 8 }}>
        <div className={`channel${activeChannelId === ch.id ? ' active' : ''}`}>
          <button
            type="button"
            className="channel-head"
            onClick={() => onJoin(ch.id)}
          >
            <span className="channel-name">
              {ch.isDefault ? '⌂ ' : '# '}
              {ch.name}
            </span>
            <span className="channel-meta">
              {ch.clients.length}/{ch.maxClients === 0 ? '∞' : ch.maxClients}
            </span>
          </button>
          {ch.clients.length > 0 && (
            <div className="clients">
              {ch.clients.map((c) => (
                <div key={c.id} className={`client${c.id === selfId ? ' me' : ''}`}>
                  <span className={`dot${c.isTalking ? ' talking' : ''}`} />
                  <span>{c.nickname}</span>
                  {c.isMuted && <span className="channel-meta"> 🔇</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <ul className="tree">{render(ch.id, depth + 1)}</ul>
      </li>
    ))
  }

  return <ul className="tree">{render(null)}</ul>
}

export default function App() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState(String(DEFAULT_VOICE_PORT))
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')

  const [wsStatus, setWsStatus] = useState<WsStatus>('idle')
  const [connState, setConnState] = useState<ConnectionState>('idle')
  const [connMessage, setConnMessage] = useState<string | null>(null)
  const [serverName, setServerName] = useState<string | null>(null)
  const [selfId, setSelfId] = useState<number | null>(null)
  const [channels, setChannels] = useState<ChannelNode[]>([])
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [chatTarget, setChatTarget] = useState<'channel' | 'server'>('channel')
  const [draft, setDraft] = useState('')
  const [lastError, setLastError] = useState<string | null>(null)

  const mic = useMicrophone()
  const clientRef = useRef<ReturnType<typeof createGatewayClient> | null>(null)

  const activeChannelId = useMemo(() => {
    const me = clients.find((c) => c.id === selfId)
    return me?.channelId ?? null
  }, [clients, selfId])

  const onMessage = useCallback((msg: GatewayToClient) => {
    switch (msg.type) {
      case 'status':
        setConnState(msg.state)
        setConnMessage(msg.message ?? null)
        if (msg.state === 'connected' || msg.state === 'connecting') {
          setLastError(null)
        }
        if (msg.state === 'error' && msg.message) {
          setLastError(msg.message)
        }
        break
      case 'server_info':
        setServerName(msg.name)
        setSelfId(msg.selfId)
        break
      case 'channel_tree':
        setChannels(msg.channels)
        break
      case 'client_list':
        setClients(msg.clients)
        break
      case 'message':
        setMessages((m) => [...m.slice(-200), msg])
        break
      case 'error':
        setLastError(`${msg.code}: ${msg.message}`)
        break
    }
  }, [])

  useEffect(() => {
    const client = createGatewayClient({
      onMessage,
      onSocketStatus: (s) => setWsStatus(s),
    })
    clientRef.current = client
    client.start()
    return () => {
      client.close()
      clientRef.current = null
    }
  }, [onMessage])

  useEffect(() => {
    void mic.refreshDevices()
  }, [mic])

  const connected = connState === 'connected'

  function handleConnect() {
    if (!host.trim() || !nickname.trim()) {
      setLastError('请填写服务器地址和昵称')
      return
    }
    setLastError(null)
    setMessages([])
    clientRef.current?.send({
      type: 'connect',
      host: host.trim(),
      port: Number(port) || DEFAULT_VOICE_PORT,
      nickname: nickname.trim(),
      password: password || undefined,
    })
  }

  function handleDisconnect() {
    clientRef.current?.send({ type: 'disconnect' })
    mic.stopMic()
  }

  function handleJoin(channelId: number) {
    if (!connected) return
    clientRef.current?.send({ type: 'join_channel', channelId })
  }

  function handleSend() {
    const text = draft.trim()
    if (!text || !connected) return
    clientRef.current?.send({ type: 'send_message', target: chatTarget, text })
    setDraft('')
  }

  async function toggleMic() {
    if (mic.state.micOn) {
      mic.stopMic()
      clientRef.current?.send({ type: 'mic', enabled: false })
    } else {
      await mic.requestMic(mic.state.selectedId || undefined)
      if (mic.state.permission !== 'denied') {
        // permission state updates async; send after request settles via effect-like check
      }
      clientRef.current?.send({ type: 'mic', enabled: true })
    }
  }

  const stateLabel: Record<ConnectionState, string> = {
    idle: '未连接',
    connecting: '连接中',
    connected: '已连接',
    disconnected: '已断开',
    error: '错误',
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>TeamSpeak Web</h1>
        <span className={statusBadge(connState)}>
          {stateLabel[connState]}
          {serverName ? ` · ${serverName}` : ''}
        </span>
        <span className="badge">
          WS: {wsStatus === 'open' ? '在线' : wsStatus === 'connecting' ? '握手中' : wsStatus}
        </span>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          TS3 协议网关 · 连接任意可达服务器
        </span>
      </header>

      <div className="main">
        <aside className="panel">
          <h2>连接</h2>
          <div className="body">
            <div className="form-grid">
              <label>
                服务器地址
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="ts.example.com"
                  disabled={connected || connState === 'connecting'}
                />
              </label>
              <label>
                端口
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  inputMode="numeric"
                  disabled={connected || connState === 'connecting'}
                />
              </label>
              <label>
                昵称
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Your name"
                  disabled={connected || connState === 'connecting'}
                />
              </label>
              <label>
                服务器密码（可选）
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={connected || connState === 'connecting'}
                />
              </label>
              <div className="row">
                {connected || connState === 'connecting' ? (
                  <button type="button" className="danger" onClick={handleDisconnect}>
                    断开
                  </button>
                ) : (
                  <button type="button" className="primary" onClick={handleConnect}>
                    连接
                  </button>
                )}
              </div>
              {lastError && <div className="error-box">{lastError}</div>}
              {connMessage && !lastError && (
                <div className="hint">{connMessage}</div>
              )}
              <p className="hint">
                浏览器无法直接使用 TS 的 UDP 语音协议。本项目通过本地网关桥接：
                Web ↔ WebSocket ↔ Gateway ↔ TS3（真实协议栈）。
              </p>
            </div>
          </div>

          <h2>音频</h2>
          <div className="body">
            <div className="form-grid">
              <label>
                麦克风
                <select
                  value={mic.state.selectedId}
                  onChange={async (e) => {
                    const id = e.target.value
                    mic.setState((s) => ({ ...s, selectedId: id }))
                    if (mic.state.micOn) await mic.requestMic(id)
                  }}
                >
                  {mic.state.devices.length === 0 && <option value="">未检测到设备</option>}
                  {mic.state.devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="meter" title="输入电平">
                <span style={{ width: `${Math.round(mic.state.level * 100)}%` }} />
              </div>
              <div className="row">
                <button type="button" onClick={() => void toggleMic()}>
                  {mic.state.micOn ? '关闭麦克风' : '开启麦克风'}
                </button>
              </div>
              {mic.state.permission === 'denied' && (
                <div className="error-box">麦克风权限被拒绝，请在浏览器设置中允许。</div>
              )}
              {mic.state.error && mic.state.permission !== 'denied' && (
                <div className="error-box">{mic.state.error}</div>
              )}
            </div>
          </div>
        </aside>

        <section className="panel">
          <h2>频道树</h2>
          <div className="body">
            <ChannelListView
              channels={channels}
              selfId={selfId}
              activeChannelId={activeChannelId}
              onJoin={handleJoin}
            />
          </div>
        </section>

        <section className="panel">
          <h2>聊天</h2>
          <div className="chat-log">
            {messages.length === 0 && (
              <div className="empty">连接后显示消息</div>
            )}
            {messages.map((m, i) => (
              <div key={`${m.ts}-${i}`} className="msg">
                <span className="from">{m.from}</span>
                <span>{m.text}</span>
                <span className="time">{formatTime(m.ts)}</span>
                {m.target !== 'channel' && m.target !== 'server' && (
                  <span className="time"> · {m.target}</span>
                )}
              </div>
            ))}
          </div>
          <div className="chat-input">
            <select
              value={chatTarget}
              onChange={(e) =>
                setChatTarget(e.target.value as 'channel' | 'server')
              }
              disabled={!connected}
            >
              <option value="channel">当前频道</option>
              <option value="server">服务器消息</option>
            </select>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={connected ? '输入消息…' : '请先连接服务器'}
              disabled={!connected}
            />
            <button type="button" className="primary" onClick={handleSend} disabled={!connected}>
              发送
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
