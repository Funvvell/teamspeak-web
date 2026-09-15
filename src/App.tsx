import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_VOICE_PORT,
  type ChannelNode,
  type ClientInfo,
  type GatewayToClient,
} from '../shared/types'
import { createGatewayClient } from './lib/gateway-client'
import { useMicrophone } from './lib/mic'
import { decodeVoiceFrame, encodeClientFrame } from './lib/voice-pipeline'
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
  desktopNotify,
  loadCollapsed,
  loadRecent,
  loadVolumes,
  parseHostPort,
  saveRecent,
  saveVolumes,
  type LogItem,
  type RecentServer,
} from './lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@shared/components/ui/dropdown-menu'
import { ChevronRight, Copy, MessageSquare, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog'
import { Button } from '@shared/components/ui/button'
import { Slider as BrutalSlider } from '@shared/components/ui/slider'
import { LoginView } from './views/LoginView'
import { ServerBrowserView } from './views/ServerBrowserView'
import { SettingsView } from './views/SettingsView'
import { PermissionsView } from './views/PermissionsView'
import { MainShell, type StatusKind } from './views/MainShell'
import { AppChrome, type NavKey } from './components/AppChrome'
import {
  emptyTab,
  type AppView,
  type ConnectionTab,
  type FieldErrors,
  type SettingsNav,
  type ToastKind,
} from './views/types'
import type {
  CatalogPayload,
  PermChange,
  PermissionSnapshot,
  ChannelPatch,
} from '../shared/types'

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
  const [nav, setNav] = useState<NavKey>('browser')
  const [catalog, setCatalog] = useState<CatalogPayload>({ bookmarks: [], recent: [] })
  const [permSnapshot, setPermSnapshot] = useState<PermissionSnapshot | null>(null)
  const [sqStatus, setSqStatus] = useState<{ connected: boolean; error?: string; serverVersion?: string }>({
    connected: false,
  })
  const [musicBotUrl, setMusicBotUrl] = useState('')
  const [settingsNav, setSettingsNav] = useState<SettingsNav>('audio')
  const [draft, setDraft] = useState('')
  const [muted, setMuted] = useState(false)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    client: ClientInfo
  } | null>(null)
  const [volumes, setVolumes] = useState<Record<string, number>>({})
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [sinkId, setSinkId] = useState(() => getStoredSinkId())
  const [soundsOn, setSoundsOn] = useState(() => getSoundsEnabled())
  const [collapsed, setCollapsed] = useState(() => loadCollapsed())
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [sideTab, setSideTab] = useState<'chat' | 'events'>('chat')
  const [gatewayToken, setGatewayTokenState] = useState(() => getGatewayToken())
  const [authRequired, setAuthRequired] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
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
    { id: number; kind: ToastKind; text: string }[]
  >([])
  const toastIdRef = useRef(0)
  const chatLogRef = useRef<HTMLDivElement>(null)
  const chatPinned = useRef(true)
  const prevMsgRef = useRef({ tab: '', count: 0 })
  const [newMsgCount, setNewMsgCount] = useState(0)
  const treeBodyRef = useRef<HTMLDivElement>(null)
  const [myChanDir, setMyChanDir] = useState<'up' | 'down' | null>(null)
  const [chatAnimBase, setChatAnimBase] = useState(0)
  const toastTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  )
  const pttCaptureRef = useRef<((e: KeyboardEvent) => void) | null>(null)
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
    tab?.client?.sendAudio(encodeClientFrame(opus))
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
    if (!active?.host) return
    setAddressInput((cur) => {
      if (cur && cur !== `${active.host}:${active.port}` && !cur.includes(active.host)) return cur
      return cur ? cur : `${active.host}:${active.port}`
    })
  }, [active?.host, active?.port])

  useEffect(() => {
    if (!activeId && tabs[0]) setActiveId(tabs[0].id)
  }, [activeId, tabs])

  // Load catalog when gateway client is ready
  useEffect(() => {
    const t = tabs.find((x) => x.id === activeId)
    if (t?.client) {
      t.client.send({ type: 'catalog_list' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.client, active?.connState])

  // Load per-server volumes and re-apply to playback so UI matches audio
  useEffect(() => {
    if (!active?.host) return
    const vols = loadVolumes(active.host)
    setVolumes(vols)
    for (const [id, v] of Object.entries(vols)) {
      micRef.current.setClientVolume(Number(id), v)
    }
  }, [active?.host])

  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) => {
        setOutputDevices(list.filter((d) => d.kind === 'audiooutput'))
      })
      .catch(() => {})
  }, [])

  // Single /config fetch: music bot URL, auth flag, and default host/port/nick
  useEffect(() => {
    void fetch('/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: {
        defaultHost?: string
        defaultPort?: string
        defaultNickname?: string
        authRequired?: boolean
        musicBotUrl?: string
      } | null) => {
        if (!cfg) return
        if (cfg.musicBotUrl) setMusicBotUrl(cfg.musicBotUrl)
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
    const toastTimers = toastTimersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      for (const t of toastTimers.values()) clearTimeout(t)
      toastTimers.clear()
      if (pttCaptureRef.current) {
        window.removeEventListener('keydown', pttCaptureRef.current, true)
        pttCaptureRef.current = null
      }
    }
  }, [])

  const patchTab = useCallback((id: string, patch: Partial<ConnectionTab>) => {
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const pushToast = useCallback(
    (kind: ToastKind, text: string) => {
      const id = ++toastIdRef.current
      setToasts((list) => [...list.slice(-2), { id, kind, text }])
      const timer = setTimeout(() => {
        toastTimersRef.current.delete(id)
        setToasts((list) => list.filter((t) => t.id !== id))
      }, 6000)
      toastTimersRef.current.set(id, timer)
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
              setNav('channels')
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
                      !isActive() || sideTabRef.current !== 'events'
                        ? t.eventsUnread + 1
                        : t.eventsUnread,
                  }
                : t,
            ),
          )
          break
        case 'catalog':
          setCatalog(msg.catalog)
          break
        case 'serverquery_status':
          setSqStatus({
            connected: msg.connected,
            error: msg.error,
            serverVersion: msg.serverVersion,
          })
          break
        case 'permission_snapshot':
          setPermSnapshot(msg.snapshot)
          break
        case 'permission_apply_ok':
          pushToast('success', `已应用 ${msg.applied} 项权限变更`)
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
    const rawHost = (overrides?.host ?? tab?.host ?? '').trim()
    const nick = (overrides?.nickname ?? tab?.nickname ?? '').trim()
    const portOverride = String(
      overrides?.port ?? tab?.port ?? DEFAULT_VOICE_PORT,
    )
    const peeled = parseHostPort(rawHost)
    const host = peeled.host || rawHost
    const port =
      String(Number(portOverride) || 0) !== '0' && portOverride
        ? portOverride
        : peeled.port
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
      host,
      port,
    })
    if (rememberServer) {
      localStorage.setItem(
        LS_FAV,
        JSON.stringify({
          host,
          port,
          nickname: nick,
        }),
      )
    }
    setRecent((prev) => {
      const next = [
        { host, port, label: host, ts: Date.now() },
        ...prev.filter((r) => !(r.host === host && r.port === port)),
      ].slice(0, 3)
      saveRecent(next)
      return next
    })
    // gateway-client queues messages until WS opens — send immediately
    client.send({
      type: 'connect',
      host,
      port: Number(port) || DEFAULT_VOICE_PORT,
      nickname: nick,
      password: tab.password || undefined,
    })
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
    const wasActive = activeIdRef.current === id
    setTabs((list) => {
      const next = list.filter((t) => t.id !== id)
      if (next.length === 0) return [emptyTab()]
      return next
    })
    // Side effect of setActiveId must not run inside the setTabs updater
    if (wasActive) setActiveId('')
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
        // Settings (or login) has no filter input — jump to main when connected
        // so the shortcut is never a no-op.
        const cur = tabsRef.current.find((t) => t.id === activeIdRef.current)
        if (cur?.connState === 'connected') {
          setView('main')
          requestAnimationFrame(() => filterInputRef.current?.focus())
        }
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
      // History already shown — don't replay enter animation on tab switch
      setChatAnimBase(count)
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

  function setClientVol(id: number, v: number) {
    if (!active) return
    mic.setClientVolume(id, v)
    const next = { ...volumes, [String(id)]: v }
    setVolumes(next)
    saveVolumes(active.host, next)
  }

  function toggleMute() {
    const n = !muted
    setMuted(n)
    mic.setMuted(n)
  }

  function toggleDeafen() {
    const next = !deafened
    setDeafened(next)
    if (next) {
      // 闭听只关输出，不强制静音麦克风
      deafenPrevVol.current = mic.state.outputVolume
      mic.setOutputVolume(0)
    } else {
      mic.setOutputVolume(deafenPrevVol.current || 1)
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

  function statusFor(c: ClientInfo): { text: string; kind: StatusKind } {
    const isSelf = c.id === active?.selfId
    if (isSelf) {
      if (deafened) return { text: '已闭听', kind: 'listen' }
      if (muted) return { text: '已静音', kind: 'muted' }
      if (!mic.state.micOn) return { text: '麦克风未开启', kind: 'idle' }
      if (uplink) return { text: '正在说话', kind: 'talking' }
      return { text: `在线 · ${lat(c)} ms`, kind: 'idle' }
    }
    if (c.isTalking) return { text: '正在说话', kind: 'talking' }
    if (c.isInputMuted) return { text: `已静音 · ${lat(c)} ms`, kind: 'muted' }
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
      case 'connect': return `${who} 已连接${l.detail ? ` · ${l.detail}` : ''}`
      case 'disconnect': return `${who} 断开连接`
      case 'poke': return `${who} 收到了 Poke`
    }
  }

  const channelDesc = `${channelName}：语音频道`

  const serverMemberCount = active?.clients.length ?? 0

  // ---------- 登录页操作 ----------

  const connectFromLogin = (overrides?: { address?: string; nickname?: string; password?: string }) => {
    if (!active) return
    const addr = overrides?.address ?? addressInput
    const nick = (overrides?.nickname ?? active.nickname).trim()
    const { host, port } = parseHostPort(addr)
    if (overrides?.password !== undefined) {
      patchTab(active.id, { password: overrides.password })
    }
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
      .then(() => pushToast('success', '共享链接已复制'))
      .catch(() => pushToast('err', '复制失败，请手动复制服务器地址'))
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
    pushToast('success', '设置已存储')
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

  const toggleSounds = () => {
    setSoundsOn((v) => {
      setSoundsEnabled(!v)
      return !v
    })
  }

  const openSettings = (navItem: SettingsNav) => {
    setSettingsNav(navItem)
    setView('settings')
    setNav('audio')
  }

  const dismissHttpsBar = () => {
    sessionStorage.setItem('tsweb:https-dismissed', '1')
    setHttpsDismissed(true)
  }

  const setNickname = (v: string) => {
    if (active) patchTab(active.id, { nickname: v })
  }

  const setPassword = (v: string) => {
    if (active) patchTab(active.id, { password: v })
  }

  const onGatewayTokenChange = (v: string) => {
    setGatewayTokenState(v)
    setGatewayToken(v)
  }

  const layout: 'full' | 'solo' =
    view === 'main' && nav === 'channels' ? 'full' : 'solo'
  const chromeConnected = connected
  const activeNickname = active?.nickname || ''
  const activeServerName = active?.serverName
  const activeHost = active?.host || ''
  const activeLatency = selfLatency

  const handleNav = (n: NavKey) => {
    setNav(n)
    if (n === 'channels') {
      if (chromeConnected) setView('main')
      else setView('login')
    } else if (n === 'audio') {
      setView('settings')
      setSettingsNav('audio')
    } else if (n === 'browser') {
      setView('browser')
      active?.client?.send({ type: 'catalog_list' })
      void fetch('/api/catalog')
        .then((r) => (r.ok ? r.json() : null))
        .then((cat) => {
          if (cat?.bookmarks) setCatalog(cat)
        })
        .catch(() => {})
    } else if (n === 'permissions') {
      setView('permissions')
      active?.client?.send({ type: 'permission_snapshot' })
      active?.client?.send({ type: 'catalog_list' })
    }
  }

  const requestPermissionSnapshot = () => {
    active?.client?.send({ type: 'permission_snapshot' })
  }

  const applyPermissionChanges = (tierId: string, changes: PermChange[]) => {
    active?.client?.send({ type: 'permission_apply', tierId, changes })
  }

  const updateChannel = (channelId: number, patch: ChannelPatch) => {
    active?.client?.send({ type: 'channel_update', channelId, patch })
  }

  const addBookmark = (name: string, host: string, port: number, nickname?: string) => {
    active?.client?.send({ type: 'catalog_add_bookmark', name, host, port, nickname })
  }

  const removeBookmark = (id: string) => {
    active?.client?.send({ type: 'catalog_remove_bookmark', id })
  }

  const syncWhisper = (clients: number[], channels: number[]) => {
    active?.client?.send({ type: 'whisper_sync', clients, channels })
  }

  return (
    <>
    <AppChrome
      connected={chromeConnected}
      nickname={activeNickname}
      serverName={activeServerName}
      host={activeHost}
      selfLatency={activeLatency}
      muted={muted}
      deafened={deafened}
      soundsOn={soundsOn}
      musicBotUrl={musicBotUrl}
      nav={nav}
      layout={layout}
      setNav={handleNav}
      onGoLogin={() => {
        setNav('browser')
        setView('login')
      }}
      openSettings={openSettings}
      toggleSounds={toggleSounds}
      toggleMute={toggleMute}
      toggleDeafen={toggleDeafen}
    >
      {view === 'permissions' ? (
        <PermissionsView
          snapshot={permSnapshot}
          sqStatus={sqStatus}
          onRequestSnapshot={requestPermissionSnapshot}
          onApply={applyPermissionChanges}
          onUpdateChannel={updateChannel}
          onConnectSq={(host, queryPort, username, password) =>
            active?.client?.send({
              type: 'serverquery_connect',
              host,
              queryPort,
              username,
              password,
            })
          }
          onDisconnectSq={() => active?.client?.send({ type: 'serverquery_disconnect' })}
          whisperClients={active?.whisperClients ?? []}
          whisperChannels={active?.whisperChannels ?? []}
          onSyncWhisper={syncWhisper}
        />
      ) : view === 'browser' ? (
        <ServerBrowserView
          catalog={catalog}
          connected={chromeConnected}
          currentHost={active?.host}
          currentPort={active?.port}
          onRefresh={() => active?.client?.send({ type: 'catalog_list' })}
          onJoin={(host, port) => {
            setAddressInput(`${host}:${port}`)
            if (!active) return
            patchTab(active.id, { host, port: String(port) })
            if (chromeConnected) {
              disconnectTab(active.id)
            }
            // reconnect after disconnect settles
            setTimeout(() => {
              connectFromLogin({
                address: `${host}:${port}`,
                nickname: active?.nickname || 'Commander_Kael',
              })
            }, 350)
          }}
          onAddBookmark={addBookmark}
          onRemoveBookmark={removeBookmark}
        />
      ) : view === 'settings' ? (
        <SettingsView
          nickname={active?.nickname || ''}
          setNickname={setNickname}
          onBack={() => setView(connected ? 'main' : 'login')}
          leaveServer={leaveServer}
          settingsNav={settingsNav}
          setSettingsNav={setSettingsNav}
          mic={mic}
          muted={muted}
          inputDb={inputDb}
          voxPct={voxPct}
          rnnoiseOn={rnnoiseOn}
          toggleRnnoise={toggleRnnoise}
          aecOn={aecOn}
          toggleAec={toggleAec}
          agcOn={agcOn}
          toggleAgc={toggleAgc}
          outputDevices={outputDevices}
          sinkId={sinkId}
          setSinkId={setSinkId}
          applySinkId={applySinkId}
          soundsOn={soundsOn}
          toggleSounds={toggleSounds}
          desktopNotifyOn={desktopNotifyOn}
          toggleDesktopNotify={toggleDesktopNotify}
          authRequired={authRequired}
          gatewayToken={gatewayToken}
          onGatewayTokenChange={onGatewayTokenChange}
          resetSettings={resetSettings}
          saveSettings={saveSettings}
          catalog={catalog}
          addBookmark={addBookmark}
          removeBookmark={removeBookmark}
          syncWhisper={syncWhisper}
          whisperClients={active?.whisperClients ?? []}
          whisperChannels={active?.whisperChannels ?? []}
        />
      ) : view === 'main' && chromeConnected && active ? (
        <MainShell
          active={active}
          tabs={tabs}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
          serverMemberCount={serverMemberCount}
          filterText={filterText}
          setFilterText={setFilterText}
          filterInputRef={filterInputRef}
          treeCollapsed={treeCollapsed}
          setTreeCollapsed={setTreeCollapsed}
          treeBodyRef={treeBodyRef}
          updateMyChanVisibility={updateMyChanVisibility}
          activeChannelId={activeChannelId}
          selectedChannelId={selectedChannelId}
          setSelectedChannelId={setSelectedChannelId}
          handleJoin={handleJoin}
          openMenu={openMenu}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          myChanDir={myChanDir}
          setActiveId={setActiveId}
          patchTab={patchTab}
          closeTab={closeTab}
          addTab={addTab}
          channelName={channelName}
          channelPath={channelPath}
          whisperActive={whisperActive}
          soundsOn={soundsOn}
          toggleSounds={toggleSounds}
          musicBotUrl={musicBotUrl}
          openSettings={openSettings}
          inviteCopy={inviteCopy}
          insecureContext={insecureContext}
          httpsDismissed={httpsDismissed}
          dismissHttpsBar={dismissHttpsBar}
          reconnecting={reconnecting}
          reconnectFailed={!!reconnectFailed}
          cancelReconnect={cancelReconnect}
          retryReconnect={retryReconnect}
          selfLatency={selfLatency}
          focusMember={focusMember}
          statusFor={statusFor}
          channelMembers={channelMembers}
          talkingCount={talkingCount}
          meterLevel={meterLevel}
          muted={muted}
          deafened={deafened}
          uplink={uplink}
          volumes={volumes}
          setClientVol={setClientVol}
          lat={lat}
          sideTab={sideTab}
          setSideTab={setSideTab}
          chatLogRef={chatLogRef}
          chatPinned={chatPinned}
          chatAnimBase={chatAnimBase}
          newMsgCount={newMsgCount}
          setNewMsgCount={setNewMsgCount}
          draft={draft}
          setDraft={setDraft}
          handleSend={handleSend}
          connected={connected}
          recentLogs={recentLogs}
          logText={logText}
          channelDesc={channelDesc}
          channelById={channelById}
          userStateCls={userStateCls}
          mic={mic}
          voxPct={voxPct}
          speakers={speakers}
          toggleMute={toggleMute}
          toggleDeafen={toggleDeafen}
          disconnect={() => {
            if (active) {
              disconnectTab(active.id)
            }
            setView('login')
            setNav('browser')
          }}
        />
      ) : (
        <LoginView
          addressInput={addressInput}
          setAddressInput={setAddressInput}
          fieldErrors={fieldErrors}
          setFieldErrors={setFieldErrors}
          host={active?.host || ''}
          port={active?.port || ''}
          nickname={active?.nickname || ''}
          password={active?.password || ''}
          lastError={active?.lastError ?? null}
          connecting={active?.connState === 'connecting'}
          setNickname={setNickname}
          setPassword={setPassword}
          connectFromLogin={connectFromLogin}
          connectAsGuest={connectAsGuest}
          disconnect={() => {
            if (active) disconnectTab(active.id)
          }}
          recent={recent}
          pickRecent={pickRecent}
          clearRecent={clearRecent}
          rememberServer={rememberServer}
          setRememberServer={setRememberServer}
          micOk={micOk}
          micDeviceName={micDeviceName}
          micPermission={mic.state.permission}
          requestMic={() => void mic.requestMic(mic.state.selectedId || undefined)}
          setHelpOpen={setHelpOpen}
          catalog={catalog}
          addBookmark={addBookmark}
          removeBookmark={removeBookmark}
          openSettings={() => {
            setNav('audio')
            setView('settings')
            setSettingsNav('audio')
          }}
          openPermissions={() => {
            setNav('permissions')
            setView('permissions')
            active?.client?.send({ type: 'permission_snapshot' })
          }}
          openBrowser={() => {
            setNav('browser')
            setView('browser')
            active?.client?.send({ type: 'catalog_list' })
          }}
        />
      )}
    </AppChrome>

      {helpOpen && (
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>帮助</DialogTitle>
            </DialogHeader>
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
            <DialogFooter>
              <Button variant="primary" size="sm" onClick={() => setHelpOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showShortcuts && (
        <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>键盘快捷键</DialogTitle>
            </DialogHeader>
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
            <DialogFooter>
              <Button variant="primary" size="sm" onClick={() => setShowShortcuts(false)}>
                关闭（Esc）
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role="alert">
            <span className="toast-dot" aria-hidden="true" />
            <span className="toast-text">{t.text}</span>
          </div>
        ))}
      </div>

      {menu && active && (
        <DropdownMenu
          open
          onOpenChange={(o) => {
            if (!o) setMenu(null)
          }}
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <span
              style={{
                position: 'fixed',
                left: menu.x,
                top: menu.y,
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            className="z-[140] min-w-[210px]"
          >
            <DropdownMenuLabel className="border-b-3 border-brutal font-black">
              {menu.client.nickname}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                patchTab(active.id, {
                  chatTarget: 'pm',
                  pmTarget: menu.client.id,
                })
              }}
            >
              <MessageSquare size={14} /> 私聊
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                active.client?.send({
                  type: 'poke',
                  targetId: menu.client.id,
                  message: '来自网页客户端',
                })
              }}
            >
              <Zap size={14} /> Poke
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                耳语 <ChevronRight size={14} className="ml-auto" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[150]">
                <DropdownMenuItem
                  onSelect={() => {
                    active.client?.send({
                      type: 'whisper_add',
                      target: { kind: 'client', id: menu.client.id },
                    })
                    patchTab(active.id, {
                      whisperClients: [
                        ...new Set([...active.whisperClients, menu.client.id]),
                      ],
                    })
                  }}
                >
                  加入耳语目标
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
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
                  }}
                >
                  耳语其所在频道
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(menu.client.nickname)
              }}
            >
              <Copy size={14} /> 复制昵称
            </DropdownMenuItem>
            <div className="border-t-3 border-brutal px-3 py-2.5">
              <div className="mb-1.5 text-xs font-bold">
                音量{' '}
                {Math.round((volumes[String(menu.client.id)] ?? 1) * 100)}
                %
              </div>
              <BrutalSlider
                min={0}
                max={150}
                value={[Math.round((volumes[String(menu.client.id)] ?? 1) * 100)]}
                onValueChange={(v) =>
                  setClientVol(menu.client.id, (v[0] ?? 0) / 100)
                }
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
