import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_VOICE_PORT,
  type ChannelNode,
  type ClientInfo,
  type ConnectionState,
  type GatewayToClient,
} from '../shared/types'
import { createGatewayClient, type WsStatus } from './lib/gateway-client'
import { useMicrophone } from './lib/mic'
import { decodeVoiceFrame, encodeVoiceFrame } from './lib/voice-pipeline'
import {
  applySinkId,
  getSoundsEnabled,
  getStoredSinkId,
  playNotify,
  setSoundsEnabled,
} from './lib/notify'
import { getGatewayToken, setGatewayToken } from './lib/gateway-client'
import {
  LS_AEC,
  LS_AGC,
  LS_DESKTOP,
  LS_FAV,
  LS_RNN,
  LOG_ICON,
  desktopNotify,
  formatTime,
  loadCollapsed,
  loadRecent,
  loadVolumes,
  parseHostPort,
  saveCollapsed,
  saveRecent,
  saveVolumes,
  type LogItem,
  type RecentServer,
} from './lib/utils'
import { BellIcon, HeadphoneIcon, LockIcon, MicIcon, MusicIcon, PersonIcon, SparklesIcon, WaveBars, ZapIcon } from './components/icons'
import { Segmented, SettingRow, Switch } from './components/controls'
import { ChannelListView } from './components/ChannelListView'
import { BlinkingSquares } from './components/BlinkingSquares'
import { Button } from '@shared/components/ui/button'
import { Card } from '@shared/components/ui/card'
import { Input } from '@shared/components/ui/input'
import { Switch as BrutalSwitch } from '@shared/components/ui/switch'
import { Slider as BrutalSlider } from '@shared/components/ui/slider'

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
  logs: LogItem[]
  whisperClients: number[]
  whisperChannels: number[]
  lastError: string | null
  chatTarget: 'channel' | 'server' | 'pm'
  pmTarget: number | null
  client: ReturnType<typeof createGatewayClient> | null
  /** unread counters */
  unread: number
  unreadMention: boolean
  eventsUnread: number
  /** auto-reconnect bookkeeping */
  wasConnected: boolean
  reconnectAttempts: number
  manualDisconnect: boolean
  prevClientIds: Set<number>
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
    logs: [],
    whisperClients: [],
    whisperChannels: [],
    lastError: null,
    chatTarget: 'channel',
    pmTarget: null,
    client: null,
    unread: 0,
    unreadMention: false,
    eventsUnread: 0,
    wasConnected: false,
    reconnectAttempts: 0,
    manualDisconnect: false,
    prevClientIds: new Set(),
    ...partial,
  }
}

type AppView = 'login' | 'main' | 'settings'
type SettingsNav = 'account' | 'audio' | 'activation' | 'notify' | 'theme' | 'network'

// 模块级小组件：避免在 App 内部定义导致每次渲染重挂载（输入框失焦）
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
  const [view, setView] = useState<AppView>('login')
  const [musicBotUrl, setMusicBotUrl] = useState('')
  const [settingsNav, setSettingsNav] = useState<SettingsNav>('audio')
  const [draft, setDraft] = useState('')
  const [muted, setMuted] = useState(false)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    client: ClientInfo
  } | null>(null)
  const [menuSub, setMenuSub] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [volumes, setVolumes] = useState<Record<string, number>>({})
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [sinkId, setSinkId] = useState(() => getStoredSinkId())
  const [soundsOn, setSoundsOn] = useState(() => getSoundsEnabled())
  const [collapsed, setCollapsed] = useState(() => loadCollapsed())
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [usersCollapsed, setUsersCollapsed] = useState(false)
  const [sideTab, setSideTab] = useState<'chat' | 'events'>('chat')
  const [gatewayToken, setGatewayTokenState] = useState(() => getGatewayToken())
  const [authRequired, setAuthRequired] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    host?: string
    nickname?: string
  }>({})
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  const [deafened, setDeafened] = useState(false)
  // 移动端底部导航当前页签（桌面端不参与布局）
  const [mobileTab, setMobileTab] = useState<'tree' | 'voice' | 'chat'>('voice')
  const [httpsDismissed, setHttpsDismissed] = useState(
    () => sessionStorage.getItem('tsweb:https-dismissed') === '1',
  )
  const [filterText, setFilterText] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)
  const [toasts, setToasts] = useState<
    { id: number; kind: 'success' | 'info' | 'warn' | 'err'; text: string }[]
  >([])
  const toastIdRef = useRef(0)
  const chatLogRef = useRef<HTMLDivElement>(null)
  const chatPinned = useRef(true)
  const prevMsgRef = useRef({ tab: '', count: 0 })
  const [newMsgCount, setNewMsgCount] = useState(0)
  const treeBodyRef = useRef<HTMLDivElement>(null)
  const infoCardRef = useRef<HTMLDivElement>(null)
  const [myChanDir, setMyChanDir] = useState<'up' | 'down' | null>(null)
  const deafenPrevVol = useRef(1)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const insecureContext =
    typeof window !== 'undefined' && !window.isSecureContext

  // 登录页 / 设置页状态
  const [addressInput, setAddressInput] = useState('')
  const [rememberServer, setRememberServer] = useState(true)
  const [recent, setRecent] = useState<RecentServer[]>(() => loadRecent())
  const [rnnoiseOn, setRnnoiseOn] = useState(
    () => localStorage.getItem(LS_RNN) !== '0',
  )
  const [aecOn, setAecOn] = useState(
    () => localStorage.getItem(LS_AEC) !== '0',
  )
  const [agcOn, setAgcOn] = useState(
    () => localStorage.getItem(LS_AGC) !== '0',
  )
  const [desktopNotifyOn, setDesktopNotifyOn] = useState(
    () => localStorage.getItem(LS_DESKTOP) !== '0',
  )
  const [helpOpen, setHelpOpen] = useState(false)
  const desktopNotifyOnRef = useRef(desktopNotifyOn)

  const mic = useMicrophone((opus) => {
    const tab = tabsRef.current.find((t) => t.id === activeIdRef.current)
    tab?.client?.sendAudio(encodeVoiceFrame(opus))
  })

  const tabsRef = useRef(tabs)
  const activeIdRef = useRef(activeId)
  const sideTabRef = useRef(sideTab)
  const micRef = useRef(mic)
  const toggleMuteRef = useRef(toggleMute)
  const toggleDeafenRef = useRef(toggleDeafen)
  const reconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )
  const connectTabRef = useRef<
    (
      id: string,
      opts?: { auto?: boolean },
      overrides?: { host?: string; port?: string; nickname?: string },
    ) => void
  >(() => {})

  const active = tabs.find((t) => t.id === activeId) || tabs[0]

  // 登录页地址输入框与 active 配置同步（config 启动填充后自动带上）
  useEffect(() => {
    fetch('/config')
      .then((r) => r.json())
      .then((c) => setMusicBotUrl((c as { musicBotUrl?: string }).musicBotUrl || ''))
      .catch(() => undefined)
  }, [])



  useEffect(() => {
    if (!active?.host) return
    setAddressInput((cur) => {
      if (cur && cur !== `${active.host}:${active.port}` && !cur.includes(active.host)) return cur
      return cur ? cur : `${active.host}:${active.port}`
    })
  }, [active?.host, active?.port])

  useEffect(() => {
    if (!activeId && tabs[0]) setActiveId(tabs[0].id)
  }, [activeId, tabs])

  useEffect(() => {
    if (active?.host) setVolumes(loadVolumes(active.host))
  }, [active?.host])

  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) => {
        setOutputDevices(list.filter((d) => d.kind === 'audiooutput'))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    void fetch('/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: {
        defaultHost?: string
        defaultPort?: string
        defaultNickname?: string
        authRequired?: boolean
      } | null) => {
        if (!cfg) return
        if (cfg.authRequired) setAuthRequired(true)
        setTabs((list) =>
          list.map((t, i) =>
            i === 0 && !t.host && cfg.defaultHost
              ? {
                  ...t,
                  host: cfg.defaultHost || t.host,
                  port: cfg.defaultPort || t.port,
                  nickname: cfg.defaultNickname || t.nickname,
                }
              : t,
          ),
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timers = reconnectTimers.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  const patchTab = useCallback((id: string, patch: Partial<ConnectionTab>) => {
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const pushToast = useCallback(
    (kind: 'success' | 'info' | 'warn' | 'err', text: string) => {
      const id = ++toastIdRef.current
      setToasts((list) => [...list.slice(-2), { id, kind, text }])
      setTimeout(
        () => setToasts((list) => list.filter((t) => t.id !== id)),
        4000,
      )
    },
    [],
  )

  const scheduleReconnect = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId)
      if (!tab || tab.manualDisconnect || !tab.wasConnected) return
      if (tab.reconnectAttempts >= 5) return
      if (reconnectTimers.current.has(tabId)) return
      const attempt = tab.reconnectAttempts + 1
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000)
      patchTab(tabId, { reconnectAttempts: attempt })
      const timer = setTimeout(() => {
        reconnectTimers.current.delete(tabId)
        const t = tabsRef.current.find((x) => x.id === tabId)
        if (!t || t.manualDisconnect) return
        connectTabRef.current(tabId, { auto: true })
      }, delay)
      reconnectTimers.current.set(tabId, timer)
    },
    [patchTab],
  )

  const onMessage = useCallback(
    (tabId: string) => (msg: GatewayToClient) => {
      const isActive = () => tabId === activeIdRef.current
      switch (msg.type) {
        case 'status':
          patchTab(tabId, {
            connState: msg.state,
            lastError: msg.state === 'error' ? msg.message || '连接错误' : null,
          })
          if (msg.state === 'connected') {
            patchTab(tabId, {
              wasConnected: true,
              reconnectAttempts: 0,
              manualDisconnect: false,
            })
            if (isActive()) {
              playNotify('connect')
              pushToast('success', '已连接')
              setSelectedChannelId(null)
              setView('main')
            }
          }
          if (msg.state === 'disconnected' || msg.state === 'error') {
            if (isActive()) {
              playNotify('disconnect')
              const t = tabsRef.current.find((x) => x.id === tabId)
              if (msg.state === 'error') {
                pushToast('err', msg.message || '连接错误')
              } else if (t?.wasConnected && !t.manualDisconnect) {
                pushToast('warn', '连接断开，正在自动重连…')
              }
            }
            scheduleReconnect(tabId)
          }
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
        case 'client_list': {
          setTabs((list) =>
            list.map((t) => {
              if (t.id !== tabId) return t
              const prev = t.prevClientIds
              const nextIds = new Set(msg.clients.map((c) => c.id))
              if (prev.size > 0 && isActive()) {
                for (const c of msg.clients) {
                  if (!prev.has(c.id) && c.id !== t.selfId) playNotify('join')
                }
                for (const id of prev) {
                  if (!nextIds.has(id) && id !== t.selfId) playNotify('leave')
                }
              }
              return { ...t, clients: msg.clients, prevClientIds: nextIds }
            }),
          )
          break
        }
        case 'message': {
          const mention =
            /\*poke\*/i.test(msg.text) || msg.target.startsWith('client:')
          const active0 = isActive()
          setTabs((list) =>
            list.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    messages: [...t.messages.slice(-200), { ...msg }],
                    unread: active0 ? t.unread : t.unread + 1,
                    unreadMention: active0
                      ? t.unreadMention
                      : t.unreadMention || mention,
                  }
                : t,
            ),
          )
          if (isActive()) {
            if (/\*poke\*/i.test(msg.text)) playNotify('poke')
            else if (msg.target.startsWith('client:')) playNotify('pm')
          }
          if (mention) {
            if (
              'Notification' in window &&
              Notification.permission === 'default'
            ) {
              void Notification.requestPermission()
            }
            desktopNotify(
              msg.target.startsWith('client:')
                ? `私聊 · ${msg.from}`
                : `Poke · ${msg.from}`,
              msg.text,
              desktopNotifyOnRef.current,
            )
          }
          break
        }
        case 'event_log':
          setTabs((list) =>
            list.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    logs: [...t.logs.slice(-199), { ...msg } as LogItem],
                    eventsUnread:
                      isActive() && sideTabRef.current !== 'events'
                        ? t.eventsUnread + 1
                        : t.eventsUnread,
                  }
                : t,
            ),
          )
          break
        case 'error':
          patchTab(tabId, { lastError: `${msg.code}: ${msg.message}` })
          if (isActive()) pushToast('err', `${msg.code}: ${msg.message}`)
          break
      }
    },
    [patchTab, scheduleReconnect, pushToast],
  )

  const onAudioFrameFor = useCallback(
    (tabId: string) => (data: ArrayBuffer) => {
      // Only the active tab plays voice
      if (tabId !== activeIdRef.current) return
      const parsed = decodeVoiceFrame(data)
      if (!parsed || !parsed.opus.length) return
      micRef.current.pushIncoming(parsed.opus, parsed.clientId)
    },
    [],
  )

  const connectTab = (
    id: string,
    opts?: { auto?: boolean },
    overrides?: { host?: string; port?: string; nickname?: string },
  ) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    const host = (overrides?.host ?? tab?.host ?? '').trim()
    const nick = (overrides?.nickname ?? tab?.nickname ?? '').trim()
    const port = overrides?.port ?? tab?.port ?? String(DEFAULT_VOICE_PORT)
    if (!tab || !host || !nick) {
      if (!opts?.auto) {
        setFieldErrors({
          host: !host ? '请填写服务器地址' : undefined,
          nickname: !nick ? '请填写昵称' : undefined,
        })
      }
      return
    }
    setFieldErrors({})
    // Avoid connect storms (manual spam or auto-reconnect while handshake running)
    if (tab.connState === 'connecting') return
    if (opts?.auto && tab.connState === 'connected') return
    // Tear down previous socket without waiting
    try {
      tab.client?.close()
    } catch {
      /* ignore */
    }
    const client = createGatewayClient({
      onMessage: onMessage(id),
      onSocketStatus: (s) => {
        patchTab(id, { wsStatus: s })
        if (s === 'closed' || s === 'error') scheduleReconnect(id)
      },
      onAudioFrame: onAudioFrameFor(id),
    })
    client.start()
    patchTab(id, {
      client,
      lastError: null,
      messages: [],
      whisperClients: [],
      whisperChannels: [],
    })
    if (rememberServer) {
      localStorage.setItem(
        LS_FAV,
        JSON.stringify({
          host: host,
          port,
          nickname: nick,
        }),
      )
    }
    setRecent((prev) => {
      const next = [
        { host, port, label: host, ts: Date.now() },
        ...prev.filter((r) => !(r.host === host && r.port === port)),
      ].slice(0, 5)
      saveRecent(next)
      return next
    })
    // WS open is async — send after short delay or queue (client queues)
    setTimeout(() => {
      client.send({
        type: 'connect',
        host,
        port: Number(port) || DEFAULT_VOICE_PORT,
        nickname: nick,
        password: tab.password || undefined,
      })
    }, 50)
  }

  const disconnectTab = (id: string) => {
    const timer = reconnectTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.current.delete(id)
    }
    patchTab(id, { manualDisconnect: true, reconnectAttempts: 0 })
    const tab = tabsRef.current.find((t) => t.id === id)
    tab?.client?.send({ type: 'disconnect' })
  }

  const cancelReconnect = (id: string) => {
    const timer = reconnectTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.current.delete(id)
    }
    patchTab(id, { manualDisconnect: true, reconnectAttempts: 0 })
  }

  const retryReconnect = (id: string) => {
    patchTab(id, { reconnectAttempts: 0, manualDisconnect: false })
    connectTab(id)
  }

  const closeTab = (id: string) => {
    const timer = reconnectTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.current.delete(id)
    }
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
    setView('login')
  }

  const activeChannelId = useMemo(() => {
    if (!active) return null
    const me = active.clients.find((c) => c.id === active.selfId)
    return me?.channelId ?? null
  }, [active])

  // Track whether my channel row is scrolled out of view
  const updateMyChanVisibility = useCallback(() => {
    const el = treeBodyRef.current
    if (!el || activeChannelId == null) {
      setMyChanDir(null)
      return
    }
    const row = el.querySelector(`[data-channel-id="${activeChannelId}"]`)
    if (!row) {
      setMyChanDir(null)
      return
    }
    const r = row.getBoundingClientRect()
    const c = el.getBoundingClientRect()
    if (r.bottom < c.top) setMyChanDir('up')
    else if (r.top > c.bottom) setMyChanDir('down')
    else setMyChanDir(null)
  }, [activeChannelId])

  useEffect(() => {
    updateMyChanVisibility()
  }, [updateMyChanVisibility, active?.channels, filterText])

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
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 260)
    setMenu({ x, y, client })
  }

  // Focus first menu item on open; reset submenu
  useEffect(() => {
    if (menu) {
      setMenuSub(false)
      setTimeout(
        () => menuRef.current?.querySelector('button')?.focus(),
        0,
      )
    }
  }, [menu])

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setMenu(null)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll('button') ?? [],
    ) as HTMLButtonElement[]
    if (!items.length) return
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'ArrowDown'
        ? items[(idx + 1 + items.length) % items.length]
        : items[(idx - 1 + items.length) % items.length]
    next?.focus()
  }

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      const t = el as HTMLElement | null
      if (!t) return false
      const tag = t.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable
      )
    }
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'k') {
        e.preventDefault()
        setView((v) => (v === 'settings' ? v : v))
        filterInputRef.current?.focus()
        return
      }
      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const t = tabsRef.current[Number(e.key) - 1]
        if (t) {
          setActiveId(t.id)
          patchTab(t.id, { unread: 0, unreadMention: false })
        }
        return
      }
      if (mod && key === 'w') {
        e.preventDefault()
        const t = tabsRef.current.find((x) => x.id === activeIdRef.current)
        if (!t) return
        if (
          t.connState === 'connected' &&
          !window.confirm('仍在连接中，确定关闭该标签？')
        )
          return
        closeTab(t.id)
        return
      }
      if (mod && key === 'm') {
        e.preventDefault()
        if (e.shiftKey) toggleDeafenRef.current()
        else toggleMuteRef.current()
        return
      }
      if (e.key === '?' && !isTypingTarget(e.target)) {
        setShowShortcuts((s) => !s)
        return
      }
      if (e.key === 'Escape') setShowShortcuts(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [patchTab])

  // Chat scroll pinning: follow only when pinned to bottom
  const activeMsgCount = active?.messages.length ?? 0
  useEffect(() => {
    const el = chatLogRef.current
    if (!el || !active) return
    const prev = prevMsgRef.current
    const count = active.messages.length
    if (prev.tab !== active.id) {
      chatPinned.current = true
      setNewMsgCount(0)
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    } else if (count > prev.count) {
      if (chatPinned.current) el.scrollTop = el.scrollHeight
      else setNewMsgCount((n) => n + (count - prev.count))
    }
    prevMsgRef.current = { tab: active.id, count }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, activeMsgCount])

  function setClientVol(nick: string, id: number, v: number) {
    if (!active) return
    mic.setClientVolume(id, v)
    const next = { ...volumes, [`${id}:${nick}`]: v }
    setVolumes(next)
    saveVolumes(active.host, next)
  }

  function toggleMute() {
    if (deafened) return
    const n = !muted
    setMuted(n)
    mic.setMuted(n)
  }

  function toggleDeafen() {
    const next = !deafened
    setDeafened(next)
    if (next) {
      deafenPrevVol.current = mic.state.outputVolume
      setMuted(true)
      mic.setMuted(true)
      mic.setOutputVolume(0)
    } else {
      setMuted(false)
      mic.setMuted(false)
      mic.setOutputVolume(deafenPrevVol.current)
    }
  }


  const connected = active?.connState === 'connected'
  const rawUplink = mic.state.micOn && !muted && mic.state.gateOpen
  /**
   * Hysteresis: switch ON instantly, but only switch OFF after a short dwell,
   * so the bar doesn't strobe when the VOX gate flaps around the threshold.
   */
  const [uplink, setUplink] = useState(false)
  useEffect(() => {
    if (rawUplink) {
      setUplink(true)
      return
    }
    const t = setTimeout(() => setUplink(false), 400)
    return () => clearTimeout(t)
  }, [rawUplink])

  // Smoothed meter value — 20fps raw level + low-pass filter = no jitter
  const levelSmoothRef = useRef(0)
  const meterLevel = levelSmoothRef.current

  // 渲染后统一同步 ref（React 19 禁止在 render 期间写入 ref；语义与原 render 同步等价）
  useEffect(() => {
    desktopNotifyOnRef.current = desktopNotifyOn
    tabsRef.current = tabs
    activeIdRef.current = activeId
    sideTabRef.current = sideTab
    micRef.current = mic
    connectTabRef.current = connectTab
    toggleMuteRef.current = toggleMute
    toggleDeafenRef.current = toggleDeafen
    levelSmoothRef.current =
      levelSmoothRef.current * 0.72 + (muted ? 0 : mic.state.level) * 0.28
  })

  const speakers =
    active?.clients.filter((c) => c.isTalking && c.id !== active.selfId) ?? []
  const reconnecting =
    !!active &&
    active.connState === 'disconnected' &&
    active.wasConnected &&
    !active.manualDisconnect
  const reconnectFailed = reconnecting && active.reconnectAttempts >= 5

  // ---------- 派生值（设计稿视图） ----------

  /** 上行速率估算（kbps，用于 UI 展示）*/
  const talkKbps = Math.round(12 + meterLevel * 20)
  const peerKbps = (id: number) => 12 + ((id * 7) % 16)

  const lat = (c: ClientInfo) => (c.latency != null ? c.latency : '—')

  const selfClient = active?.clients.find((c) => c.id === active.selfId) ?? null
  const selfLatency = selfClient?.latency ?? null

  const channelById = useMemo(() => {
    const m = new Map<number, ChannelNode>()
    for (const ch of active?.channels ?? []) m.set(ch.id, ch)
    return m
  }, [active?.channels])

  const activeChannelNode = activeChannelId != null
    ? channelById.get(activeChannelId) ?? null
    : null

  const channelPath = useMemo(() => {
    const names: string[] = []
    let cur = activeChannelNode
    let guard = 0
    while (cur && guard++ < 10) {
      names.unshift(cur.name)
      cur = cur.parentId != null ? channelById.get(cur.parentId) ?? null : null
    }
    return names
  }, [activeChannelNode, channelById])

  const channelName = activeChannelNode?.name ?? '语音频道'

  const channelMembers = useMemo(() => {
    if (!active || activeChannelId == null) return []
    return active.clients.filter((c) => c.channelId === activeChannelId)
  }, [active, activeChannelId])

  const talkingCount = channelMembers.filter(
    (c) => c.isTalking || (c.id === active?.selfId && uplink),
  ).length

  const focusMember = useMemo(() => {
    const peerTalker = channelMembers.find(
      (c) => c.isTalking && c.id !== active?.selfId,
    )
    if (peerTalker) return peerTalker
    if (selfClient && (uplink || channelMembers.some((c) => c.id === selfClient.id)))
      return selfClient
    return channelMembers[0] ?? null
  }, [channelMembers, selfClient, uplink, active?.selfId])

  const userStateCls = (c: ClientInfo) => {
    if (c.isTalking) return 'talking'
    if (c.isInputMuted || c.isMuted) return 'muted'
    if (c.isOutputMuted) return 'listen'
    return 'idle'
  }

  function statusFor(c: ClientInfo): { text: string; kind: 'talking' | 'muted' | 'listen' | 'idle' } {    const isSelf = c.id === active?.selfId
    if (isSelf) {
      if (deafened) return { text: '已闭麦', kind: 'muted' }
      if (muted) return { text: '已闭麦', kind: 'muted' }
      if (!mic.state.micOn) return { text: '麦克风未开启', kind: 'idle' }
      if (uplink) return { text: `正在说话·上行 ${talkKbps} kbps`, kind: 'talking' }
      return { text: `在线 · ${lat(c)} ms`, kind: 'idle' }
    }
    if (c.isTalking) return { text: `正在说话·上行 ${peerKbps(c.id)} kbps`, kind: 'talking' }
    if (c.isInputMuted) return { text: `已闭麦 · ${lat(c)} ms`, kind: 'muted' }
    if (c.isOutputMuted) return { text: `仅收听 · ${lat(c)} ms`, kind: 'listen' }
    return { text: `在线 · ${lat(c)} ms`, kind: 'idle' }
  }

  const micOk =
    mic.state.permission === 'granted' && mic.state.micOn
  const micDeviceName =
    mic.state.devices.find((d) => d.deviceId === mic.state.selectedId)?.label ??
    ''
  const inputDb = mic.state.level > 0.001
    ? Math.max(-60, Math.round(20 * Math.log10(mic.state.level)))
    : -60
  const voxPct = Math.round(mic.state.vox.threshold * 100)

  const recentLogs = useMemo(() => {
    const logs = active?.logs
    if (!logs) return []
    return [...logs].reverse().slice(0, 4)
  }, [active?.logs])

  function logText(l: LogItem) {
    const who = l.nickname || `#${l.clientId ?? '?'}`
    switch (l.event) {
      case 'join': return `${who} 加入了频道`
      case 'leave': return `${who} 离开了频道`
      case 'move': {
        const chName = l.detail || (l.channelId != null ? channelById.get(l.channelId)?.name : null)
        return `${who} 移动到「${chName || '其他频道'}」`
      }
      case 'connect': return `${who} 连接成功${l.detail ? ` · ${l.detail}` : ''}`
      case 'disconnect': return `${who} 断开连接`
      case 'poke': return `${who} 收到了 Poke`
    }
  }

  const channelDesc = `${channelName}：团队日常语音协作频道。发言前请确认麦克风状态；推荐使用声控（VOX）模式，需要专注时可闭听。`

  const serverMemberCount = active?.clients.length ?? 0

  // ---------- 登录页操作 ----------

  const connectFromLogin = () => {
    if (!active) return
    const { host, port } = parseHostPort(addressInput)
    const nick = active.nickname.trim()
    if (!host || !nick) {
      setFieldErrors({
        host: !host ? '请填写服务器地址' : undefined,
        nickname: !nick ? '请填写昵称' : undefined,
      })
      return
    }
    // 服务器要求昵称至少 3 个字符（中文按字符数），不足则直接提示，避免 45s 超时
    if (Array.from(nick).length < 3) {
      setFieldErrors({
        host: undefined,
        nickname: '昵称至少 3 个字符（当前 ' + Array.from(nick).length + ' 个）',
      })
      return
    }
    setFieldErrors({})
    patchTab(active.id, { host, port })
    connectTab(active.id, undefined, { host, port, nickname: nick })
  }

  const connectAsGuest = () => {
    if (!active) return
    const { host, port } = parseHostPort(addressInput)
    if (!host) {
      setFieldErrors({ host: '请填写服务器地址', nickname: undefined })
      return
    }
    const nick =
      active.nickname.trim() ||
      `游客-${Math.floor(1000 + Math.random() * 9000)}`
    patchTab(active.id, { nickname: nick })
    setFieldErrors({})
    connectTab(active.id, undefined, { host, port, nickname: nick })
  }

  const clearRecent = () => {
    setRecent([])
    saveRecent([])
  }

  const pickRecent = (r: RecentServer) => {
    if (!active) return
    patchTab(active.id, { host: r.host, port: r.port })
    setAddressInput(`${r.host}:${r.port}`)
    setFieldErrors({})
  }

  const inviteCopy = () => {
    if (!active) return
    const url = `ts3server://${active.host}?port=${active.port || DEFAULT_VOICE_PORT}`
    void navigator.clipboard
      .writeText(url)
      .then(() => pushToast('success', '邀请链接已复制'))
      .catch(() => pushToast('err', '复制失败，请手动复制服务器地址'))
  }

  const focusInfoCard = () => {
    infoCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    infoCardRef.current?.classList.add('flash')
    setTimeout(
      () => infoCardRef.current?.classList.remove('flash'),
      1200,
    )
  }

  const resetSettings = () => {
    mic.setVox({ mode: 'vox', threshold: 0.08, pttKey: 'Space' })
    mic.setOutputVolume(1)
    setSoundsOn(true)
    setSoundsEnabled(true)
    setRnnoiseOn(true)
    setAecOn(true)
    setAgcOn(true)
    setDesktopNotifyOn(true)
    localStorage.setItem(LS_RNN, '1')
    localStorage.setItem(LS_AEC, '1')
    localStorage.setItem(LS_AGC, '1')
    localStorage.setItem(LS_DESKTOP, '1')
    mic.setAudioFx({ aec: true, agc: true, noise: true })
    setSinkId('')
    applySinkId('')
    void mic.setOutputDevice('')
    pushToast('success', '已恢复默认设置')
  }

  const saveSettings = () => {
    pushToast('success', '设置已保存 · 改动即时生效')
  }

  const leaveServer = () => {
    if (active) disconnectTab(active.id)
    setView('login')
  }

  const toggleDesktopNotify = () => {
    setDesktopNotifyOn((v) => {
      const next = !v
      localStorage.setItem(LS_DESKTOP, next ? '1' : '0')
      if (next && 'Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission()
      }
      return next
    })
  }

  const toggleRnnoise = () => {
    setRnnoiseOn((v) => {
      const next = !v
      localStorage.setItem(LS_RNN, next ? '1' : '0')
      mic.setAudioFx({ aec: aecOn, agc: agcOn, noise: next })
      return next
    })
  }

  const toggleAec = () => {
    setAecOn((v) => {
      const next = !v
      localStorage.setItem(LS_AEC, next ? '1' : '0')
      mic.setAudioFx({ aec: next, agc: agcOn })
      return next
    })
  }

  const toggleAgc = () => {
    setAgcOn((v) => {
      const next = !v
      localStorage.setItem(LS_AGC, next ? '1' : '0')
      mic.setAudioFx({ aec: aecOn, agc: next })
      return next
    })
  }

  // ---------- 通用小组件（Switch/Segmented/SettingRow 见模块级定义） ----------

  const renderActivationControls = () => (
    <>
      <SettingRow
        label="发送方式"
        right={<span className="setting-status">当前：{mic.state.vox.mode === 'open' ? '常开' : mic.state.vox.mode === 'vox' ? '声控 VOX' : '按键 PTT'}</span>}
      >
        <Segmented
          value={mic.state.vox.mode}
          options={[
            { value: 'open', label: '常开' },
            { value: 'vox', label: '声控 VOX' },
            { value: 'ptt', label: '按键 PTT' },
          ]}
          onChange={(v) => mic.setVox({ mode: v as 'open' | 'vox' | 'ptt' })}
        />
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

  // ---------- 登录视图 ----------

  const renderLogin = () => {
    const connecting = active?.connState === 'connecting'
    const lastFailed = !!active?.lastError && !connecting
    const dnsLike =
      lastFailed &&
      /解析|dns|resolve|enotfound|not found/i.test(active?.lastError || '')
    const hostError = fieldErrors.host
    const nickError = fieldErrors.nickname

    const features = [
      { icon: <LockIcon />, title: '端到端加密', desc: '全程加密，偷听没门' },
      { icon: <WaveBars active />, title: '声控 VOX · 按键 PTT', desc: '声控说话，键盘声不掺和' },
      { icon: <SparklesIcon />, title: 'AI 降噪', desc: '风扇嗡嗡，它替你挡' },
      { icon: <ZapIcon />, title: '低延迟语音', desc: 'Opus 编码，延迟压到最低' },
    ]

    return (
      <div className="login-page">
        <BlinkingSquares />
        <div className="login-center">
          <div className="login-hero">
            <div className="brand login-brand-top">
              <div className="brand-mark">TS</div>
              <span>TeamSpeak Web</span>
            </div>
            <h1 className="hero-h1">TeamSpeak Web</h1>
            <p className="hero-sub">打开浏览器就能聊，不用装</p>
            <div className="hero-features">
              {features.map((f) => (
                <div
                  className="feature-brutal border-3 shadow-brutal-sm rounded-brutal bg-brutal-bg"
                  key={f.title}
                >
                  <span className="feature-icon">{f.icon}</span>
                  <span className="feature-text">
                    <span className="feature-title">{f.title}</span>
                    <span className="feature-desc">{f.desc}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="hero-note">手机电脑通用 · 一键接音乐机器人</p>
          </div>
          <Card className="login-card-brutal border-3 shadow-brutal rounded-brutal bg-brutal-bg">
            <h2>登录</h2>
            <p className="login-sub">
              {connecting
                ? `正在连接 ${active?.host || ''}:${active?.port || ''}`
                : '填个地址就开聊，三秒上线。'}
            </p>

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
                    : active?.lastError}
                </span>
              )}
            </label>

            <label className={`field${nickError ? ' invalid' : ''}`}>
              <span className="field-label">昵称</span>
              <Input
                value={active?.nickname || ''}
                onChange={(e) => {
                  if (active) patchTab(active.id, { nickname: e.target.value })
                  if (fieldErrors.nickname)
                    setFieldErrors((f) => ({ ...f, nickname: undefined }))
                }}
                placeholder="你的昵称"
                disabled={connecting}
                className="h-11"
              />
              {nickError && <span className="field-error">{nickError}</span>}
            </label>

            <div className="mic-check">
              <span className={`mic-check-state${micOk ? ' ok' : ''}`}>
                <MicIcon off={!micOk} />
                {lastFailed
                  ? '上次连接失败 · 请检查地址后重试'
                  : micOk
                    ? `麦克风自检通过 · ${micDeviceName || '已连接'}`
                    : mic.state.permission === 'denied'
                      ? '麦克风未授权 · 请在浏览器地址栏允许'
                      : '麦克风自检中…'}
              </span>
              {lastFailed ? (
                <button type="button" className="link-btn" onClick={() => setHelpOpen(true)}>
                  帮助
                </button>
              ) : (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    void mic.requestMic(mic.state.selectedId || undefined)
                  }
                >
                  重测
                </button>
              )}
            </div>

            {connecting && (
              <div className="encrypt-row">
                <span className="encrypt-track"><i /></span>
                <span className="encrypt-text">正在建立加密通道…</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => active && disconnectTab(active.id)}
                >
                  取消
                </button>
              </div>
            )}

            <div className="remember-row">
              <span>记住这台服务器</span>
              <BrutalSwitch
                checked={rememberServer}
                onCheckedChange={(v) => setRememberServer(!!v)}
                aria-label="记住这台服务器"
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
              {connecting ? '正在连…' : lastFailed ? '再试一次 →' : '开聊 →'}
            </Button>

            <div className="login-or"><span>或</span></div>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={connecting}
              onClick={connectAsGuest}
            >
              不注册，直接进
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
                <div className="recent-empty">暂无最近连接</div>
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
          </Card>
          <div className="login-foot">
            <div className="login-tagline">加密 · 声控 · 降噪，一个不少</div>
            <div className="brand-foot">TeamSpeak Web · 浏览器里的语音房</div>
          </div>
        </div>
      </div>
    )
  }


const renderMain = () => {
    return (
      <div className="main-view">
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
                onClick={() => {
                  setActiveId(t.id)
                  patchTab(t.id, { unread: 0, unreadMention: false })
                }}
                title={`${t.host}:${t.port}`}
              >
                <span
                  className={`dot${t.connState === 'connected' ? ' talking' : ''}`}
                />
                {t.serverName || t.host || '新连接'}
                {t.connState === 'connected' && ` · ${t.clients.length}人`}
                {t.unread > 0 && t.id !== active?.id && (
                  <span
                    className={`unread-dot${t.unreadMention ? ' mention' : ''}`}
                  />
                )}
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
          <div className="top-search">
            <span className="top-search-icon">⌕</span>
            <input
              ref={filterInputRef}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="搜索频道/成员"
              aria-label="搜索频道/成员"
            />
            <kbd>Ctrl K</kbd>
          </div>
            <Button
              variant="ghost"
              size="icon"
              className={`top-icon${soundsOn ? '' : ' off'}`}
              title={soundsOn ? '通知音效开' : '通知音效关'}
              onClick={() => {
                setSoundsOn((v) => {
                  setSoundsEnabled(!v)
                  return !v
                })
              }}
            >
              <BellIcon />
            </Button>
          {musicBotUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="top-icon music-top"
              title="打开音乐机器人"
              onClick={() => window.open(musicBotUrl, '_blank', 'noopener,noreferrer')}
            >
              <MusicIcon />
            </Button>
          )}
          <button
            type="button"
            className="user-chip"
            onClick={() => {
              setSettingsNav('audio')
              setView('settings')
            }}
            title="设置"
          >
            <span className="avatar avatar-sm">
              <PersonIcon />
            </span>
            {active?.nickname || '未命名'}
          </button>
        </header>

        {insecureContext && !httpsDismissed && (
          <div className="insecure-bar">
            <span>
              当前为非安全上下文（非 HTTPS），语音功能不可用 ·
              请参考部署指南配置 HTTPS
            </span>
            <button
              type="button"
              className="insecure-close"
              onClick={() => {
                sessionStorage.setItem('tsweb:https-dismissed', '1')
                setHttpsDismissed(true)
              }}
            >
              ×
            </button>
          </div>
        )}

        {active && reconnecting && !reconnectFailed && (
          <div
            className="reconnect-bar"
            role="button"
            tabIndex={0}
            title="点击取消自动重连"
            onClick={() => cancelReconnect(active.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') cancelReconnect(active.id)
            }}
          >
            <div className="reconnect-line" />
            <span>
              正在自动重连 {active.reconnectAttempts}/5 · 点击取消
            </span>
          </div>
        )}
        {active && reconnectFailed && (
          <div className="reconnect-bar failed">
            <span>自动重连失败</span>
            <span className="reconnect-actions">
              <button type="button" onClick={() => retryReconnect(active.id)}>
                重试
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => cancelReconnect(active.id)}
              >
                放弃
              </button>
            </span>
          </div>
        )}

        <div className="main">
          <aside className={`panel tree-panel${mobileTab === 'tree' ? ' m-active' : ''}`}>
            <div className="server-head">
              <div className="server-info">
                <div className="server-name">
                  {active?.serverName || active?.host}
                </div>
                <div className="server-meta">
                  {active?.channels.length ?? 0} 个频道 · {serverMemberCount} 位成员                </div>
              </div>
              <button
                type="button"
                className={`icon-btn${filterText ? ' active' : ''}`}
                title="过滤频道 / 成员（Ctrl+K）"
                onClick={() => {
                  if (filterText) setFilterText('')
                  filterInputRef.current?.focus()
                }}
              >
                ⌕
              </button>
            </div>
            <div className="filter-row">
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="过滤频道 / 成员"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setFilterText('')
                }}
              />
            </div>
            <div className="side-section">
              <button
                type="button"
                className={`section-bar${treeCollapsed ? ' collapsed' : ''}`}
                onClick={() => setTreeCollapsed((v) => !v)}
                title={treeCollapsed ? '展开频道树' : '折叠频道树'}
              >
                <span className="section-title">频道</span>
                <span className="section-count">{active?.channels.length ?? 0}</span>
                <i className="section-arrow">{treeCollapsed ? '▸' : '▾'}</i>
              </button>
              {!treeCollapsed && (
                <div className="body" ref={treeBodyRef} onScroll={updateMyChanVisibility}>
                  <ChannelListView
                    channels={active?.channels || []}
                    selfId={active?.selfId ?? null}
                    activeChannelId={activeChannelId}
                    selectedChannelId={selectedChannelId}
                    onSelect={setSelectedChannelId}
                    onJoin={handleJoin}
                    onClientMenu={openMenu}
                    collapsed={collapsed}
                    onToggleCollapse={(id) => {
                      setCollapsed((prev) => {
                        const next = new Set(prev)
                        if (next.has(id)) next.delete(id)
                        else next.add(id)
                        saveCollapsed(next)
                        return next
                      })
                    }}
                    filter={filterText}
                  />
                </div>
              )}
              {myChanDir && !treeCollapsed && (
                <button
                  type="button"
                  className="back-to-my"
                  onClick={() => {
                    const row = treeBodyRef.current?.querySelector(
                      `[data-channel-id="${activeChannelId}"]`,
                    )
                    row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  }}
                >
                  {myChanDir === 'up' ? '↑' : '↓'} 回到我的频道
                </button>
              )}
            </div>
            <div className="side-section users-section">
              <button
                type="button"
                className={`section-bar${usersCollapsed ? ' collapsed' : ''}`}
                onClick={() => setUsersCollapsed((v) => !v)}
                title={usersCollapsed ? '展开在线用户' : '折叠在线用户'}
              >
                <span className="section-title">在线用户</span>
                <span className="section-count">{serverMemberCount}</span>
                <i className="section-arrow">{usersCollapsed ? '▸' : '▾'}</i>
              </button>
              {!usersCollapsed && (
                <div className="body users-body">
                  {(active?.clients ?? []).map((u) => (
                    <div
                      key={u.id}
                      className={`user-row${u.id === active?.selfId ? ' me' : ''}${u.isTalking ? ' talking' : ''}`}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        openMenu(u, e)
                      }}
                    >
                      <span className={`user-state ${userStateCls(u)}`} />
                      <span className="user-nick">
                        {u.nickname}
                        {u.id === active?.selfId && <em>（我）</em>}
                      </span>
                      <span className="user-channel">
                        {channelById.get(u.channelId)?.name ?? ''}
                      </span>
                    </div>
                  ))}
                  {(active?.clients ?? []).length === 0 && (
                    <div className="empty">暂无在线用户</div>
                  )}
                </div>
              )}
            </div>
          </aside>

          <section className={`panel voice-panel${mobileTab === 'voice' ? ' m-active' : ''}`}>
            <div className="voice-toolbar">
              <div className="crumb">
                {channelPath.length > 0 ? channelPath.join(' › ') : '语音频道'}
              </div>
              <div className="toolbar-actions">
<Button variant="outline" size="sm" onClick={focusInfoCard}>
                  频道设置
                </Button>
<Button variant="outline" size="sm" onClick={inviteCopy}>
                  邀请成员
                </Button>
              </div>
            </div>
            <div className="voice-body">
              <div className="voice-top">
                <div className="member-area">
                  <div className="voice-title-row">
                    <h2>{channelName}</h2>
                    <span className="voice-sub">
                      {channelMembers.length} 位成员 · 32 kbps Opus · 延迟{' '}
                      {selfLatency != null ? `${selfLatency} ms` : '—'} · 端到端加密                    </span>
                  </div>
                  {focusMember ? (
                    <div className={`focus-card${statusFor(focusMember).kind === 'talking' ? ' talking' : ''}`}>
                      <span className={`avatar avatar-lg kind-${statusFor(focusMember).kind}`}>
                        <PersonIcon />
                      </span>
                      <div className="focus-info">
                        <div className="focus-name">
                          {focusMember.nickname}
                          {focusMember.id === active?.selfId && <em>（我）</em>}
                        </div>
                        <div className="focus-status">{statusFor(focusMember).text}</div>
                      </div>
                      <WaveBars
                        active={statusFor(focusMember).kind === 'talking'}
                      />
                    </div>
                  ) : (
                    <div className="focus-card empty">
                      <span className="focus-name">暂无成员</span>
                    </div>
                  )}
                  <div className="member-list-head">
                    <span>频道成员</span>
                    <span className="member-count">
                      共 {channelMembers.length} 人 · {talkingCount} 人正在说话                    </span>
                  </div>
                  <div className="member-list">
                    {channelMembers.map((c) => {
                      const st = statusFor(c)
                      return (
                        <div
                          key={c.id}
                          className={`member-chip${st.kind === 'talking' ? ' talking' : ''}`}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            openMenu(c, e)
                          }}
                        >
                          <span className={`avatar avatar-md kind-${st.kind}`}>
                            <PersonIcon />
                            {st.kind === 'muted' && (
                              <i className="avatar-mic-off"><MicIcon off /></i>
                            )}
                            {st.kind === 'listen' && (
                              <i className="avatar-listen"><HeadphoneIcon /></i>
                            )}
                          </span>
                          <span className="chip-text">
                            <span className="chip-name">
                              {c.nickname}
                              {c.id === active?.selfId && <em>（我）</em>}
                            </span>
                            <span className={`chip-status kind-${st.kind}`}>
                              {st.text}
                            </span>
                          </span>
                        </div>
                      )
                    })}
                    {channelMembers.length === 0 && (
                      <div className="empty">该频道暂无成员</div>
                    )}
                  </div>
                </div>
                <div className="info-card" ref={infoCardRef}>
                  <h3>频道信息</h3>
                  <div className="kv">
                    <span>频道类型</span>
                    <strong>语音为主</strong>
                  </div>
                  <div className="kv">
                    <span>音频编码</span>
                    <strong>Opus 32 kbps</strong>
                  </div>
                  <div className="kv">
                    <span>传输加密</span>
                    <strong>ECDH + EAX</strong>
                  </div>
                  <div className="kv">
                    <span>服务器地址</span>
                    <strong>{active?.host || '—'}</strong>
                  </div>
                  <div className="kv">
                    <span>我的延迟</span>
                    <strong>{selfLatency != null ? `${selfLatency} ms` : '—'}</strong>
                  </div>
                </div>
              </div>

              <p className="channel-desc">{channelDesc}</p>

              <div className="voice-tags">
                <span className="tag">语音频道</span>
                <span className="tag">Opus 32 kbps</span>
                <span className="tag">端到端加密</span>
              </div>

              <div className="activity">
                <div className="activity-head">
                  <h3>频道动态</h3>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setSideTab('events')}
                  >
                    查看全部
                  </button>
                </div>
                <div className="activity-list">
                  {recentLogs.length === 0 && (
                    <div className="activity-empty">暂无动态</div>
                  )}
                  {recentLogs.map((l, i) => (
                    <div key={`${l.ts}-${i}`} className="activity-item">
                      <span className="activity-icon">{LOG_ICON[l.event]}</span>
                      <span className="activity-text">{logText(l)}</span>
                      <span className="activity-time">{formatTime(l.ts)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className={`panel chat-panel${mobileTab === 'chat' ? ' m-active' : ''}`}>
            <div className="side-tabs">
              <button
                type="button"
                className={`side-tab${sideTab === 'chat' ? ' active' : ''}`}
                onClick={() => setSideTab('chat')}
              >
                聊天
              </button>
              <button
                type="button"
                className={`side-tab${sideTab === 'events' ? ' active' : ''}`}
                onClick={() => {
                  setSideTab('events')
                  if (active) patchTab(active.id, { eventsUnread: 0 })
                }}
              >
                事件
                {active && active.eventsUnread > 0 && sideTab !== 'events' && (
                  <span className="side-badge">{active.eventsUnread}</span>
                )}
              </button>
            </div>
            {sideTab === 'chat' ? (
              <>
                <div className="chat-wrap">
                  <div
                    className="chat-log"
                    ref={chatLogRef}
                    onScroll={(e) => {
                      const el = e.currentTarget
                      chatPinned.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 40
                      if (chatPinned.current) setNewMsgCount(0)
                    }}
                  >
                    {!active?.messages.length && (
                      <div className="empty">还没人说话，你先来一句</div>
                    )}
                    {active?.messages.map((m, i) => (
                      <div
                        key={`${m.ts}-${i}`}
                        className="msg"
                        style={{ animationDelay: `${Math.min(i * 45, 450)}ms` }}
                      >
                        <span className="from">{m.from}</span>
                        {m.whisper && <span className="badge connecting">耳语</span>}{' '}
                        <span>{m.text}</span>
                        <span className="time">{formatTime(m.ts)}</span>
                      </div>
                    ))}
                  </div>
                  {newMsgCount > 0 && (
                    <button
                      type="button"
                      className="new-msg-pill"
                      onClick={() => {
                        const el = chatLogRef.current
                        if (el) el.scrollTop = el.scrollHeight
                        chatPinned.current = true
                        setNewMsgCount(0)
                      }}
                    >
                      共 {newMsgCount} 条新消息
                    </button>
                  )}
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
<Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder={connected ? '说点啥，Enter 发出去' : '先连上再说'}
                    disabled={!connected}
                    className="flex-1 h-10"
                  />
<Button
                    variant="primary"
                    onClick={handleSend}
                    disabled={!connected}
                    className="h-10 px-6"
                  >
                    发送
                  </Button>
                </div>
              </>
            ) : (
              <div className="chat-log">
                {!active?.logs.length && (
                  <div className="empty">连接后显示进出/移动事件</div>
                )}
                {active?.logs.map((e, i) => (
                  <div key={`${e.ts}-${i}`} className="msg">
                    <span className="from">{LOG_ICON[e.event]}</span>
                    <span>{logText(e)}</span>
                    <span className="time">{formatTime(e.ts)}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>

        <footer className={`voice-bar${uplink ? ' uplink' : ''}${mobileTab === 'voice' ? ' m-active' : ''}`}>
          <button
            type="button"
            className={`vb-mic${muted || deafened ? ' off' : ''}`}
            onClick={toggleMute}
            disabled={deafened}
            title={muted ? '取消静音（Ctrl+M）' : '静音麦克风（Ctrl+M）'}
            aria-label={muted ? '取消静音' : '静音麦克风'}
            aria-pressed={muted}
          >
            <span
              className="vb-ring"
              style={{
                background: `conic-gradient(currentColor ${
                  Math.round(Math.min(1, meterLevel) * 360)
                }deg, var(--ring-track) 0deg)`,
              }}
            />
            <span className="vb-mic-icon">
              <MicIcon off={muted || deafened || !mic.state.micOn} />
            </span>
          </button>

          <div className="vb-left">
            <span className="vb-mode">
              {mic.state.vox.mode === 'open' && '常开'}
              {mic.state.vox.mode === 'vox' && '声控 VOX'}
              {mic.state.vox.mode === 'ptt' && '按键 PTT'}
            </span>
            {mic.state.vox.mode === 'vox' && (
              <span className="vb-threshold-label">
                阈值 {voxPct}% · 悬停 250 ms
              </span>
            )}
            <div className="meter vb-meter">
              <span
                className={`vb-fill${uplink ? ' active' : ''}`}
                style={{ width: `${Math.round(meterLevel * 100)}%` }}
              />
              {mic.state.vox.mode === 'vox' && (
                <i
                  className="vb-threshold"
                  style={{
                    left: `${Math.round(mic.state.vox.threshold * 100)}%`,
                  }}
                />
              )}
            </div>
          </div>
          <div className="vb-center">
            {mic.state.micOn && mic.state.vox.mode === 'ptt' && (
              <span className={mic.state.pttHeld && !muted ? 'vb-talking' : ''}>
                {mic.state.pttHeld && !muted
                  ? `说话中（已上行 ${talkKbps} kbps）`
                  : `按住 ${mic.keyLabel(mic.state.vox.pttKey)} 说话`}
              </span>
            )}
            {mic.state.micOn && mic.state.vox.mode === 'vox' && (
              <span className={uplink ? 'vb-talking' : ''}>
                {uplink
                  ? `说话中（已上行 ${talkKbps} kbps）`
                  : '等待声音…'}
              </span>
            )}
            {mic.state.micOn && mic.state.vox.mode === 'open' && (
              <span className={uplink ? 'vb-talking' : ''}>
                {muted ? '已静音' : `常开上行中（${talkKbps} kbps）`}
              </span>
            )}
            {!mic.state.micOn && <span>麦克风未开启</span>}
          </div>
          <div className="vb-speakers" aria-live="polite" aria-atomic="false">
            {speakers.slice(0, 2).map((c) => (
              <span key={c.id} className="vb-speaker">
                <span className="dot talking" />
                {c.nickname}
              </span>
            ))}
            {speakers.length > 2 && (
              <span className="vb-more">+{speakers.length - 2}</span>
            )}
          </div>
          <div className="vb-actions">
<Button
              variant={deafened ? 'primary' : 'outline'}
              onClick={toggleDeafen}
              title="Deafen：闭麦并静音所有输出（Ctrl+Shift+M）"
              aria-pressed={deafened}
              className="vb-btn"
            >
              <HeadphoneIcon off={deafened} />
              <span>{deafened ? 'Deafen 中' : 'Deafen'}</span>
            </Button>
          </div>
        </footer>
        <nav className="mobile-tabbar" aria-label="移动端导航">
          <button
            type="button"
            className={mobileTab === 'tree' ? 'active' : ''}
            onClick={() => setMobileTab('tree')}
            aria-current={mobileTab === 'tree' ? 'page' : undefined}
          >
            频道
          </button>
          <button
            type="button"
            className={mobileTab === 'voice' ? 'active' : ''}
            onClick={() => setMobileTab('voice')}
            aria-current={mobileTab === 'voice' ? 'page' : undefined}
          >
            语音
          </button>
          <button
            type="button"
            className={mobileTab === 'chat' ? 'active' : ''}
            onClick={() => setMobileTab('chat')}
            aria-current={mobileTab === 'chat' ? 'page' : undefined}
          >
            聊天
            {newMsgCount > 0 && (
              <span className="tab-badge">{newMsgCount > 99 ? '99+' : newMsgCount}</span>
            )}
          </button>
        </nav>
      </div>
    )
  }

  // ---------- 设置视图 ----------

  const renderSettings = () => {
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

    const renderContent = () => {
      switch (settingsNav) {
        case 'account':
          return (
            <SettingRow label="昵称">
              <Input
                value={active?.nickname || ''}
                onChange={(e) =>
                  active && patchTab(active.id, { nickname: e.target.value })
                }
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
                    已授权 · 48 kHz · 单声道                  </span>
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
              {renderActivationControls()}
              <SettingRow
                label="输出设备"
                right={
                  <span className="setting-status">
                    {outputDevices.length} 个输出设备可用                  </span>
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
                <Switch
                  on={soundsOn}
                  onToggle={() => {
                    setSoundsOn((v) => {
                      setSoundsEnabled(!v)
                      return !v
                    })
                  }}
                  label="通知音效"
                />
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
          return <>{renderActivationControls()}</>
        case 'notify':
          return (
            <>
              <SettingRow label="通知音效（进出 / 私聊 / Poke）">
                <Switch
                  on={soundsOn}
                  onToggle={() => {
                    setSoundsOn((v) => {
                      setSoundsEnabled(!v)
                      return !v
                    })
                  }}
                  label="通知音效"
                />
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
                    onChange={(e) => {
                      setGatewayTokenState(e.target.value)
                      setGatewayToken(e.target.value)
                    }}
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
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">TS</div>
            <span>TeamSpeak Web</span>
          </div>
          <span className="crumb crumb-settings">设置</span>
          <span className="spacer" />
          <button
            type="button"
            className="back-btn"
            onClick={() => setView(connected ? 'main' : 'login')}
          >
            ‹ 返回
          </button>
          <span className="user-chip static">
            <span className="avatar avatar-sm">
              <PersonIcon />
            </span>
            {active?.nickname || '未命名'}
          </span>
        </header>

        <div className="settings-body">
          <aside className="settings-nav">
            <div className="nav-title">设置</div>
            {navItems.map((n) => (
              <button
                key={n.id}
                type="button"
                className={settingsNav === n.id ? 'active' : ''}
                onClick={() => setSettingsNav(n.id)}
              >
                {n.label}
              </button>
            ))}
            <div className="nav-spacer" />
            <Button variant="danger" size="sm" className="nav-leave w-full" onClick={leaveServer}>
              断开连接
            </Button>
          </aside>
          <section className="settings-content">
            <div className="settings-head">
              <div>
                <h2>{t.title}</h2>
                <p>{t.sub}</p>
              </div>
              <div className="settings-actions">
                <Button variant="outline" size="sm" onClick={resetSettings}>
                  恢复默认
                </Button>
                <Button variant="primary" size="sm" onClick={saveSettings}>
                  保存设置
                </Button>
              </div>
            </div>
            <div className="setting-block">{renderContent()}</div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="noise-overlay" aria-hidden="true" />
      <BlinkingSquares />
      {view === 'settings' ? (
        renderSettings()
      ) : connected ? (
        renderMain()
      ) : (
        renderLogin()
      )}

      {helpOpen && (
        <div className="shortcut-overlay" onClick={() => setHelpOpen(false)}>
          <div
            className="shortcut-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="帮助"
          >
            <h3>帮助</h3>
            <div className="shortcut-list">
              <div className="kv">
                <span>服务器地址格式</span>
                <strong>host 或 host:端口</strong>
              </div>
              <div className="kv">
                <span>默认端口</span>
                <strong>9987</strong>
              </div>
              <div className="kv">
                <span>需要 HTTPS 才能使用麦克风</span>
                <strong>localhost 除外</strong>
              </div>
              <div className="kv">
                <span>无法解析域名</span>
                <strong>检查拼写与 DNS</strong>
              </div>
            </div>
            <button type="button" onClick={() => setHelpOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="shortcut-overlay" onClick={() => setShowShortcuts(false)}>
          <div
            className="shortcut-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="键盘快捷键"
          >
            <h3>键盘快捷键</h3>
            <div className="shortcut-list">
              <div className="kv"><span>过滤频道 / 成员</span><strong>Ctrl/⌘ K</strong></div>
              <div className="kv"><span>切换服务器标签</span><strong>Ctrl/⌘ 1…9</strong></div>
              <div className="kv"><span>关闭当前标签</span><strong>Ctrl/⌘ W</strong></div>
              <div className="kv"><span>静音切换</span><strong>Ctrl/⌘ M</strong></div>
              <div className="kv"><span>Deafen 切换</span><strong>Ctrl/⌘ ⇧ M</strong></div>
              <div className="kv"><span>频道树移动选中（树聚焦时）</span><strong>↑ / ↓</strong></div>
              <div className="kv"><span>加入选中频道（树聚焦时）</span><strong>Enter</strong></div>
              <div className="kv"><span>双击频道加入</span><strong>鼠标双击</strong></div>
              <div className="kv"><span>关闭弹层 / 菜单</span><strong>Esc</strong></div>
              <div className="kv"><span>本页面</span><strong>?</strong></div>
            </div>
            <button type="button" onClick={() => setShowShortcuts(false)}>
              关闭（Esc）
            </button>
          </div>
        </div>
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>

      {menu && active && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onMenuKeyDown}
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
          <div className="context-item">
            <button
              type="button"
              className={menuSub ? 'sub-open' : ''}
              onClick={() => setMenuSub((s) => !s)}
            >
              耳语 <span className="sub-arrow"> › </span>
            </button>
            {menuSub && (
              <div className="context-sub">
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
              </div>
            )}
          </div>
          <div className="context-sep" />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(menu.client.nickname)
              setMenu(null)
            }}
          >
            复制昵称
          </button>
          <div className="context-vol-slider">
            <span>
              音量{' '}
              {Math.round(
                (volumes[`${menu.client.id}:${menu.client.nickname}`] ?? 1) *
                  100,
              )}
              %
            </span>
            <input
              type="range"
              min={0}
              max={150}
              value={Math.round(
                (volumes[`${menu.client.id}:${menu.client.nickname}`] ?? 1) *
                  100,
              )}
              onChange={(e) =>
                setClientVol(
                  menu.client.nickname,
                  menu.client.id,
                  Number(e.target.value) / 100,
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
