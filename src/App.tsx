import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_VOICE_PORT,
  type ChannelNode,
  type ClientInfo,
  type ConnectionState,
  type GatewayToClient,
  type WhisperTarget,
} from '../shared/types'
import { createGatewayClient, type WsStatus } from './lib/gateway-client'
import { useMicrophone } from './lib/mic'
import { decodeVoiceFrame, encodeVoiceFrame } from './lib/voice-pipeline'

interface ChatMsg {
  from: string
  fromId: number
  target: string
  text: string
  ts: number
  whisper?: boolean
}

interface ConnectionTab {
  id: string
  host: string
  port: string
  nickname: string
  password: string
  connState: ConnectionState
  wsStatus: WsStatus
  serverName: string | null
  selfId: number | null
  channels: ChannelNode[]
  clients: ClientInfo[]
  messages: ChatMsg[]
  whisperClients: number[]
  whisperChannels: number[]
  lastError: string | null
  chatTarget: 'channel' | 'server' | 'pm'
  pmTarget: number | null
  client: ReturnType<typeof createGatewayClient> | null
}

const LS_FAV = 'tsweb:favorites'
const LS_VOL = 'tsweb:volumes'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function loadVolumes(host: string): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(LS_VOL) || '{}')
    return all[host] || {}
  } catch {
    return {}
  }
}

function saveVolumes(host: string, v: Record<string, number>) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_VOL) || '{}')
    all[host] = v
    localStorage.setItem(LS_VOL, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

function ChannelListView({
  channels,
  selfId,
  activeChannelId,
  onJoin,
  onClientMenu,
}: {
  channels: ChannelNode[]
  selfId: number | null
  activeChannelId: number | null
  onJoin: (id: number) => void
  onClientMenu: (client: ClientInfo, e: React.MouseEvent) => void
}) {
  if (!channels.length) {
    return <div className="empty">连接服务器后显示频道树</div>
  }

  const byParent = new Map<number | null, ChannelNode[]>()
  for (const ch of channels) {
    const list = byParent.get(ch.parentId) ?? []
    list.push(ch)
    byParent.set(ch.parentId, list)
  }

  function render(parentId: number | null, depth = 0): ReactNode {
    const list = (byParent.get(parentId) ?? []).slice().sort((a, b) => a.id - b.id)
    return list.map((ch) => (
      <li key={ch.id} style={{ marginLeft: depth ? depth * 10 : 0 }}>
        <div className={`channel${activeChannelId === ch.id ? ' active' : ''}`}>
          <button type="button" className="channel-head" onClick={() => onJoin(ch.id)}>
            <span className="channel-name">
              <span className="channel-icon">{ch.isDefault ? '⌂' : '#'}</span>
              {ch.name}
            </span>
            <span className="channel-meta">
              {ch.clients.length}/{ch.maxClients === 0 ? '∞' : ch.maxClients}
            </span>
          </button>
          {ch.clients.length > 0 && (
            <div className="clients">
              {ch.clients.map((c) => (
                <div
                  key={c.id}
                  className={`client${c.id === selfId ? ' me' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onClientMenu(c, e)
                  }}
                >
                  <span className={`dot${c.isTalking ? ' talking' : ''}`} />
                  {c.isCommander && <span title="频道指挥官">★</span>}
                  <span>{c.nickname}</span>
                  {c.id === selfId && <span className="channel-meta">（我）</span>}
                  {c.isMuted && <span className="channel-meta">🔇</span>}
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

function emptyTab(partial?: Partial<ConnectionTab>): ConnectionTab {
  return {
    id: Math.random().toString(36).slice(2, 9),
    host: '',
    port: String(DEFAULT_VOICE_PORT),
    nickname: '',
    password: '',
    connState: 'idle',
    wsStatus: 'idle',
    serverName: null,
    selfId: null,
    channels: [],
    clients: [],
    messages: [],
    whisperClients: [],
    whisperChannels: [],
    lastError: null,
    chatTarget: 'channel',
    pmTarget: null,
    client: null,
    ...partial,
  }
}

export default function App() {
  const [tabs, setTabs] = useState<ConnectionTab[]>(() => {
    try {
      const fav = JSON.parse(localStorage.getItem(LS_FAV) || 'null')
      if (fav?.host) {
        return [
          emptyTab({
            host: fav.host,
            port: String(fav.port || DEFAULT_VOICE_PORT),
            nickname: fav.nickname || '',
          }),
        ]
      }
    } catch {
      /* ignore */
    }
    return [emptyTab()]
  })
  const [activeId, setActiveId] = useState(() => '')
  const [draft, setDraft] = useState('')
  const [muted, setMuted] = useState(false)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    client: ClientInfo
  } | null>(null)
  const [volumes, setVolumes] = useState<Record<string, number>>({})

  const mic = useMicrophone((opus) => {
    const tab = tabsRef.current.find((t) => t.id === activeIdRef.current)
    tab?.client?.sendAudio(encodeVoiceFrame(opus))
  })

  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const micRef = useRef(mic)
  micRef.current = mic

  const active = tabs.find((t) => t.id === activeId) || tabs[0]

  useEffect(() => {
    if (!activeId && tabs[0]) setActiveId(tabs[0].id)
  }, [activeId, tabs])

  useEffect(() => {
    if (active?.host) setVolumes(loadVolumes(active.host))
  }, [active?.host])

  const patchTab = useCallback((id: string, patch: Partial<ConnectionTab>) => {
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const onMessage = useCallback(
    (tabId: string) => (msg: GatewayToClient) => {
      switch (msg.type) {
        case 'status':
          patchTab(tabId, {
            connState: msg.state,
            lastError: msg.state === 'error' ? msg.message || '连接错误' : null,
          })
          break
        case 'server_info':
          patchTab(tabId, {
            serverName: msg.name,
            selfId: msg.selfId,
          })
          break
        case 'channel_tree':
          patchTab(tabId, { channels: msg.channels })
          break
        case 'client_list':
          patchTab(tabId, { clients: msg.clients })
          break
        case 'message':
          setTabs((list) =>
            list.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    messages: [...t.messages.slice(-200), { ...msg }],
                  }
                : t,
            ),
          )
          break
        case 'error':
          patchTab(tabId, { lastError: `${msg.code}: ${msg.message}` })
          break
      }
    },
    [patchTab],
  )

  const onAudioFrame = useCallback((data: ArrayBuffer) => {
    const parsed = decodeVoiceFrame(data)
    if (!parsed || !parsed.opus.length) return
    micRef.current.pushIncoming(parsed.opus, parsed.clientId)
  }, [])

  const connectTab = (id: string) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab || !tab.host.trim() || !tab.nickname.trim()) {
      patchTab(id, { lastError: '请填写服务器地址和昵称' })
      return
    }
    tab.client?.close()
    const client = createGatewayClient({
      onMessage: onMessage(id),
      onSocketStatus: (s) => patchTab(id, { wsStatus: s }),
      onAudioFrame,
    })
    client.start()
    patchTab(id, {
      client,
      lastError: null,
      messages: [],
      whisperClients: [],
      whisperChannels: [],
    })
    localStorage.setItem(
      LS_FAV,
      JSON.stringify({
        host: tab.host.trim(),
        port: tab.port,
        nickname: tab.nickname.trim(),
      }),
    )
    // WS open is async — send after short delay or queue (client queues)
    setTimeout(() => {
      client.send({
        type: 'connect',
        host: tab.host.trim(),
        port: Number(tab.port) || DEFAULT_VOICE_PORT,
        nickname: tab.nickname.trim(),
        password: tab.password || undefined,
      })
    }, 50)
  }

  const disconnectTab = (id: string) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    tab?.client?.send({ type: 'disconnect' })
  }

  const closeTab = (id: string) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    tab?.client?.send({ type: 'disconnect' })
    setTimeout(() => tab?.client?.close(), 200)
    setTabs((list) => {
      const next = list.filter((t) => t.id !== id)
      if (next.length === 0) return [emptyTab()]
      if (activeIdRef.current === id) setActiveId(next[0].id)
      return next
    })
  }

  const addTab = () => {
    const t = emptyTab()
    setTabs((list) => [...list, t])
    setActiveId(t.id)
  }

  const activeChannelId = useMemo(() => {
    if (!active) return null
    const me = active.clients.find((c) => c.id === active.selfId)
    return me?.channelId ?? null
  }, [active])

  const whisperActive =
    !!active &&
    (active.whisperClients.length > 0 || active.whisperChannels.length > 0)

  function handleSend() {
    if (!active || !draft.trim()) return
    if (active.chatTarget === 'pm' && active.pmTarget != null) {
      active.client?.send({
        type: 'send_message',
        target: { client: active.pmTarget },
        text: draft.trim(),
      })
    } else {
      active.client?.send({
        type: 'send_message',
        target: active.chatTarget === 'pm' ? 'channel' : active.chatTarget,
        text: draft.trim(),
      })
    }
    setDraft('')
  }

  function handleJoin(channelId: number) {
    active?.client?.send({ type: 'join_channel', channelId })
  }

  function openMenu(client: ClientInfo, e: React.MouseEvent) {
    const x = Math.min(e.clientX, window.innerWidth - 200)
    const y = Math.min(e.clientY, window.innerHeight - 220)
    setMenu({ x, y, client })
  }

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  function setClientVol(nick: string, id: number, v: number) {
    if (!active) return
    mic.setClientVolume(id, v)
    const next = { ...volumes, [`${id}:${nick}`]: v }
    setVolumes(next)
    saveVolumes(active.host, next)
  }

  const connected = active?.connState === 'connected'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">TS</div>
          <span>TeamSpeak Web</span>
        </div>
        <div className="tabbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab${t.id === active?.id ? ' active' : ''}`}
              onClick={() => setActiveId(t.id)}
              title={`${t.host}:${t.port}`}
            >
              <span
                className={`dot${
                  t.connState === 'connected' ? ' talking' : ''
                }`}
              />
              {t.serverName || t.host || '新连接'}
              {tabs.length > 1 && (
                <span
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.id)
                  }}
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <button type="button" className="tab add" onClick={addTab} title="新建连接">
            +
          </button>
        </div>
        <span className="spacer" />
        {whisperActive && (
          <span className="badge connecting">
            耳语中 ({active.whisperClients.length + active.whisperChannels.length})
          </span>
        )}
        <span className="badge">{mic.state.micOn ? (muted ? '麦静音' : '麦开') : '麦关'}</span>
      </header>

      <div className="main">
        <aside className="panel">
          <h2>连接</h2>
          <div className="body">
            <div className="form-grid">
              <label>
                服务器地址
                <input
                  value={active?.host || ''}
                  onChange={(e) =>
                    active && patchTab(active.id, { host: e.target.value })
                  }
                  placeholder="ts.example.com"
                  disabled={connected || active?.connState === 'connecting'}
                />
              </label>
              <label>
                端口
                <input
                  value={active?.port || ''}
                  onChange={(e) =>
                    active && patchTab(active.id, { port: e.target.value })
                  }
                  disabled={connected || active?.connState === 'connecting'}
                />
              </label>
              <label>
                昵称
                <input
                  value={active?.nickname || ''}
                  onChange={(e) =>
                    active && patchTab(active.id, { nickname: e.target.value })
                  }
                  disabled={connected || active?.connState === 'connecting'}
                />
              </label>
              <label>
                密码（可选）
                <input
                  type="password"
                  value={active?.password || ''}
                  onChange={(e) =>
                    active && patchTab(active.id, { password: e.target.value })
                  }
                  disabled={connected || active?.connState === 'connecting'}
                />
              </label>
              <div className="row">
                {connected || active?.connState === 'connecting' ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => active && disconnectTab(active.id)}
                  >
                    断开
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => active && connectTab(active.id)}
                  >
                    连接
                  </button>
                )}
              </div>
              {active?.connState === 'connecting' && (
                <div className="ok-box">连接中，请稍候…</div>
              )}
              {active?.lastError && (
                <div className="error-box">{active.lastError}</div>
              )}
            </div>
          </div>

          <div className="section-gap" />
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
                  {mic.state.devices.length === 0 && (
                    <option value="">识别中…</option>
                  )}
                  {mic.state.devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 6)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="meter">
                <span
                  style={{
                    width: `${Math.round((muted ? 0 : mic.state.level) * 100)}%`,
                  }}
                />
              </div>
              <div className="row">
                <button
                  type="button"
                  onClick={() => {
                    const n = !muted
                    setMuted(n)
                    mic.setMuted(n)
                  }}
                >
                  {muted ? '取消静音' : '静音'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (mic.state.micOn) mic.stopMic()
                    else void mic.requestMic(mic.state.selectedId || undefined)
                  }}
                >
                  {mic.state.micOn ? '关麦' : '开麦'}
                </button>
              </div>
              <label>
                总音量 {Math.round(mic.state.outputVolume * 100)}%
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={Math.round(mic.state.outputVolume * 100)}
                  onChange={(e) =>
                    mic.setOutputVolume(Number(e.target.value) / 100)
                  }
                />
              </label>
              {whisperActive && (
                <button
                  type="button"
                  onClick={() => {
                    active?.client?.send({ type: 'whisper_clear' })
                    if (active)
                      patchTab(active.id, {
                        whisperClients: [],
                        whisperChannels: [],
                      })
                  }}
                >
                  清空耳语目标
                </button>
              )}
            </div>
          </div>
        </aside>

        <section className="panel">
          <h2>频道（右键成员：私聊/Poke/耳语/音量）</h2>
          <div className="body">
            <ChannelListView
              channels={active?.channels || []}
              selfId={active?.selfId ?? null}
              activeChannelId={activeChannelId}
              onJoin={handleJoin}
              onClientMenu={openMenu}
            />
          </div>
        </section>

        <section className="panel chat-panel">
          <h2>聊天</h2>
          <div className="chat-log">
            {!active?.messages.length && <div className="empty">连接后显示消息</div>}
            {active?.messages.map((m, i) => (
              <div key={`${m.ts}-${i}`} className="msg">
                <span className="from">{m.from}</span>
                {m.whisper && <span className="badge connecting">耳语</span>}{' '}
                <span>{m.text}</span>
                <span className="time">{formatTime(m.ts)}</span>
              </div>
            ))}
          </div>
          <div className="chat-input">
            <select
              value={active?.chatTarget || 'channel'}
              onChange={(e) => {
                if (!active) return
                const v = e.target.value as 'channel' | 'server' | 'pm'
                patchTab(active.id, { chatTarget: v })
              }}
              disabled={!connected}
            >
              <option value="channel">当前频道</option>
              <option value="server">服务器消息</option>
              <option value="pm">私聊</option>
            </select>
            {active?.chatTarget === 'pm' && (
              <select
                value={active.pmTarget ?? ''}
                onChange={(e) => {
                  if (!active) return
                  patchTab(active.id, {
                    pmTarget: e.target.value ? Number(e.target.value) : null,
                  })
                }}
                disabled={!connected}
              >
                <option value="">选择对象</option>
                {active.clients
                  .filter((c) => c.id !== active.selfId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nickname}
                    </option>
                  ))}
              </select>
            )}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={connected ? '输入消息，Enter 发送' : '请先连接'}
              disabled={!connected}
            />
            <button
              type="button"
              className="primary"
              onClick={handleSend}
              disabled={!connected}
            >
              发送
            </button>
          </div>
        </section>
      </div>

      {menu && active && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-title">{menu.client.nickname}</div>
          <button
            type="button"
            onClick={() => {
              patchTab(active.id, {
                chatTarget: 'pm',
                pmTarget: menu.client.id,
              })
              setMenu(null)
            }}
          >
            私聊
          </button>
          <button
            type="button"
            onClick={() => {
              active.client?.send({
                type: 'poke',
                targetId: menu.client.id,
                message: '来自网页客户端',
              })
              setMenu(null)
            }}
          >
            Poke
          </button>
          <button
            type="button"
            onClick={() => {
              active.client?.send({
                type: 'whisper_add',
                target: { kind: 'client', id: menu.client.id },
              })
              patchTab(active.id, {
                whisperClients: [
                  ...new Set([...active.whisperClients, menu.client.id]),
                ],
              })
              setMenu(null)
            }}
          >
            加入耳语目标
          </button>
          <button
            type="button"
            onClick={() => {
              const cid = menu.client.channelId
              active.client?.send({
                type: 'whisper_add',
                target: { kind: 'channel', id: cid },
              })
              patchTab(active.id, {
                whisperChannels: [
                  ...new Set([...active.whisperChannels, cid]),
                ],
              })
              setMenu(null)
            }}
          >
            耳语其所在频道
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(menu.client.nickname)
              setMenu(null)
            }}
          >
            复制昵称
          </button>
          <div className="context-vol">
            <span>音量</span>
            {[0, 50, 100, 150].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setClientVol(menu.client.nickname, menu.client.id, pct / 100)
                  setMenu(null)
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
