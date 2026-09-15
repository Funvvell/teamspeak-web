import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type ChannelNode,
  type ClientInfo,
} from '../shared/types'
import { useMicrophone } from './lib/mic'
import { latText } from './lib/client-status'
import {
  applySinkId,
  getSoundsEnabled,
  getStoredSinkId,
  setSoundsEnabled,
} from './lib/notify'
import { getGatewayToken, setGatewayToken } from './lib/gateway-client'
import {
  LS_AEC,
  LS_AGC,
  LS_DESKTOP,
  LS_RNN,
  loadCollapsed,
  loadRecent,
  loadVolumes,
  parseHostPort,
  saveRecent,
  saveVolumes,
  type LogItem,
  type RecentServer,
} from './lib/utils'
import { useToasts } from './hooks/useToasts'
import { useGatewayConfig } from './hooks/useGatewayConfig'
import { useConnectionTabs } from './hooks/useConnectionTabs'
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
import { IcChat, IcChevron, IcCopy, IcPoke } from './components/TacIcons'
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
import { SettingsView } from './views/SettingsView'
import { PermissionsView } from './views/PermissionsView'
import { MainShell, type StatusKind } from './views/MainShell'
import { AppChrome, type NavKey } from './components/AppChrome'
import {
  type AppView,
  type FieldErrors,
  type SettingsNav,
} from './views/types'

// 模块级小组件：避免在 App 内部定义导致每次渲染重挂载（输入框失焦）
export default function App() {
  const [view, setView] = useState<AppView>('login')
  const [nav, setNav] = useState<NavKey>('browser')
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
  const [, setTreeCollapsed] = useState(false)
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
  const chatLogRef = useRef<HTMLDivElement>(null)
  const chatPinned = useRef(true)
  const prevMsgRef = useRef({ tab: '', count: 0 })
  const [newMsgCount, setNewMsgCount] = useState(0)
  const treeBodyRef = useRef<HTMLDivElement>(null)
  const [myChanDir, setMyChanDir] = useState<'up' | 'down' | null>(null)
  const [chatAnimBase, setChatAnimBase] = useState(0)
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
  const sideTabRef = useRef(sideTab)
  const toggleMuteRef = useRef<() => void>(() => {})
  const toggleDeafenRef = useRef<() => void>(() => {})
  /** Stable holder so connection callbacks can reach the latest mic controller. */
  const micRef = useRef<{
    pushIncoming: (opus: Uint8Array, clientId?: number) => void
    setClientVolume: (clientId: number, v: number) => void
  }>({ pushIncoming: () => {}, setClientVolume: () => {} })
  const { toasts, pushToast } = useToasts()

  const {
    tabs,
    setTabs,
    activeId,
    setActiveId,
    active,
    tabsRef,
    activeIdRef,
    patchTab,
    connectTab,
    disconnectTab,
    cancelReconnect,
    retryReconnect,
    closeTab,
    addTab: addRawTab,
    sendUplink,
    activeChannelId,
  } = useConnectionTabs({
    pushToast,
    sideTabRef,
    desktopNotifyOnRef,
    pushIncoming: (opus, clientId) => micRef.current.pushIncoming(opus, clientId),
    rememberServer,
    setRecent,
    setFieldErrors,
    onActiveConnected: () => {
      setSelectedChannelId(null)
      setView('main')
      setNav('channels')
    },
  })

  const mic = useMicrophone(sendUplink)
  useEffect(() => {
    micRef.current = mic
    toggleMuteRef.current = toggleMute
    toggleDeafenRef.current = toggleDeafen
  })

  useGatewayConfig({ setMusicBotUrl, setAuthRequired, setTabs })

  // 登录页地址输入框与 active 配置同步（config 启动填充后自动带上）
  useEffect(() => {
    if (!active?.host) return
    setAddressInput((cur) => {
      if (cur && cur !== `${active.host}:${active.port}` && !cur.includes(active.host)) return cur
      return cur ? cur : `${active.host}:${active.port}`
    })
  }, [active?.host, active?.port])

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

  useEffect(() => {
    return () => {
      if (pttCaptureRef.current) {
        window.removeEventListener('keydown', pttCaptureRef.current, true)
        pttCaptureRef.current = null
      }
    }
  }, [])

  const addTab = () => {
    addRawTab()
    setView('login')
  }

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
  }, [patchTab, closeTab, setActiveId, tabsRef, activeIdRef])

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
    toggleMuteRef.current = toggleMute
    toggleDeafenRef.current = toggleDeafen
    levelSmoothRef.current =
      levelSmoothRef.current * 0.72 + (muted ? 0 : mic.state.level) * 0.28
  })

  const reconnecting =
    !!active &&
    active.connState === 'disconnected' &&
    active.wasConnected &&
    !active.manualDisconnect
  const reconnectFailed = reconnecting && active.reconnectAttempts >= 5

  // ---------- 派生值（设计稿视图） ----------

  const lat = (c: ClientInfo) => latText(c)

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

  const channelName = activeChannelNode?.name ?? '语音频道'

  const channelMembers = useMemo(() => {
    if (!active || activeChannelId == null) return []
    return active.clients.filter((c) => c.channelId === activeChannelId)
  }, [active, activeChannelId])

  const focusMember = useMemo(() => {
    const peerTalker = channelMembers.find(
      (c) => c.isTalking && c.id !== active?.selfId,
    )
    if (peerTalker) return peerTalker
    if (selfClient && (uplink || channelMembers.some((c) => c.id === selfClient.id)))
      return selfClient
    return channelMembers[0] ?? null
  }, [channelMembers, selfClient, uplink, active?.selfId])

  function statusFor(c: ClientInfo): { text: string; kind: StatusKind } {
    const isSelf = c.id === active?.selfId
    if (isSelf) {
      if (deafened) return { text: '已静音', kind: 'muted' }
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

  const resetSettings = () => {
    mic.setVox({ mode: 'vox', threshold: 0.18, pttKey: 'Space' })
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
      setView('login')
    } else if (n === 'permissions') {
      setView('permissions')
    }
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
      openSettings={openSettings}
      toggleSounds={toggleSounds}
      toggleMute={toggleMute}
      toggleDeafen={toggleDeafen}
    >
      {view === 'permissions' ? (
        <PermissionsView />
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
          whisperActive={whisperActive}
          openSettings={openSettings}
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
          mic={mic}
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
              <IcChat size={14} /> 私聊
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
              <IcPoke size={14} /> Poke
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                耳语 <IcChevron size={14} className="ml-auto" />
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
              <IcCopy size={14} /> 复制昵称
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
