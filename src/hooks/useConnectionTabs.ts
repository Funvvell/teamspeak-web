import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_VOICE_PORT,
  type GatewayToClient,
} from '../../shared/types'
import { createGatewayClient } from '../lib/gateway-client'
import { decodeVoiceFrame, encodeClientFrame } from '../lib/voice-pipeline'
import { playNotify } from '../lib/notify'
import {
  LS_FAV,
  desktopNotify,
  saveRecent,
  type LogItem,
  type RecentServer,
} from '../lib/utils'
import {
  MAX_RECONNECT_ATTEMPTS,
  reconnectDelayMs,
} from '../lib/reconnect'
import { emptyTab, type ConnectionTab, type FieldErrors, type ToastKind } from '../views/types'

export interface UseConnectionTabsOptions {
  pushToast: (kind: ToastKind, text: string) => void
  /** Current side tab — used to decide event unread counters. */
  sideTabRef: React.RefObject<'chat' | 'events'>
  desktopNotifyOnRef: React.RefObject<boolean>
  /** Playback sink for decoded downlink frames. */
  pushIncoming: (opus: Uint8Array, clientId: number) => void
  rememberServer: boolean
  setRecent: React.Dispatch<React.SetStateAction<RecentServer[]>>
  setFieldErrors: React.Dispatch<React.SetStateAction<FieldErrors>>
  /** UI reactions when the active tab connects. */
  onActiveConnected?: () => void
  /** Open a new blank login tab. */
  onAddTab?: () => void
}

export function useConnectionTabs(opts: UseConnectionTabsOptions) {
  const {
    pushToast,
    sideTabRef,
    desktopNotifyOnRef,
    pushIncoming,
    rememberServer,
    setRecent,
    setFieldErrors,
    onActiveConnected,
  } = opts

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

  const tabsRef = useRef(tabs)
  const activeIdRef = useRef(activeId)
  const reconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )
  const connectTabRef = useRef<
    (
      id: string,
      o?: { auto?: boolean },
      ov?: { host?: string; port?: string; nickname?: string },
    ) => void
  >(() => {})

  const active = tabs.find((t) => t.id === activeId) || tabs[0]

  useEffect(() => {
    tabsRef.current = tabs
    activeIdRef.current = activeId
  })

  useEffect(() => {
    if (!activeId && tabs[0]) setActiveId(tabs[0].id)
  }, [activeId, tabs])

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

  const scheduleReconnect = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId)
      if (!tab || tab.manualDisconnect || !tab.wasConnected) return
      if (tab.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return
      if (reconnectTimers.current.has(tabId)) return
      const attempt = tab.reconnectAttempts + 1
      patchTab(tabId, { reconnectAttempts: attempt })
      const timer = setTimeout(() => {
        reconnectTimers.current.delete(tabId)
        const t = tabsRef.current.find((x) => x.id === tabId)
        if (!t || t.manualDisconnect) return
        connectTabRef.current(tabId, { auto: true })
      }, reconnectDelayMs(attempt))
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
              onActiveConnected?.()
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
        case 'error':
          patchTab(tabId, { lastError: `${msg.code}: ${msg.message}` })
          if (isActive()) pushToast('err', `${msg.code}: ${msg.message}`)
          break
      }
    },
    [
      patchTab,
      scheduleReconnect,
      pushToast,
      sideTabRef,
      desktopNotifyOnRef,
      onActiveConnected,
    ],
  )

  const onAudioFrameFor = useCallback(
    (tabId: string) => (data: ArrayBuffer) => {
      if (tabId !== activeIdRef.current) return
      const parsed = decodeVoiceFrame(data)
      if (!parsed || !parsed.opus.length) return
      pushIncoming(parsed.opus, parsed.clientId)
    },
    [pushIncoming],
  )

  const connectTab = useCallback(
    (
      id: string,
      o?: { auto?: boolean },
      ov?: { host?: string; port?: string; nickname?: string },
    ) => {
      const tab = tabsRef.current.find((t) => t.id === id)
      const host = (ov?.host ?? tab?.host ?? '').trim()
      const nick = (ov?.nickname ?? tab?.nickname ?? '').trim()
      const port = ov?.port ?? tab?.port ?? String(DEFAULT_VOICE_PORT)
      if (!tab || !host || !nick) {
        if (!o?.auto) {
          setFieldErrors({
            host: !host ? '请填写服务器地址' : undefined,
            nickname: !nick ? '请填写昵称' : undefined,
          })
        }
        return
      }
      setFieldErrors({})
      if (tab.connState === 'connecting') return
      if (o?.auto && tab.connState === 'connected') return
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
          JSON.stringify({ host, port, nickname: nick }),
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
      client.send({
        type: 'connect',
        host,
        port: Number(port) || DEFAULT_VOICE_PORT,
        nickname: nick,
        password: tab.password || undefined,
      })
    },
    [
      onMessage,
      patchTab,
      scheduleReconnect,
      onAudioFrameFor,
      rememberServer,
      setRecent,
      setFieldErrors,
    ],
  )

  useEffect(() => {
    connectTabRef.current = connectTab
  }, [connectTab])

  const disconnectTab = useCallback(
    (id: string) => {
      const timer = reconnectTimers.current.get(id)
      if (timer) {
        clearTimeout(timer)
        reconnectTimers.current.delete(id)
      }
      patchTab(id, { manualDisconnect: true, reconnectAttempts: 0 })
      const tab = tabsRef.current.find((t) => t.id === id)
      tab?.client?.send({ type: 'disconnect' })
    },
    [patchTab],
  )

  const cancelReconnect = useCallback(
    (id: string) => {
      const timer = reconnectTimers.current.get(id)
      if (timer) {
        clearTimeout(timer)
        reconnectTimers.current.delete(id)
      }
      patchTab(id, { manualDisconnect: true, reconnectAttempts: 0 })
    },
    [patchTab],
  )

  const retryReconnect = useCallback(
    (id: string) => {
      patchTab(id, { reconnectAttempts: 0, manualDisconnect: false })
      connectTab(id)
    },
    [patchTab, connectTab],
  )

  const closeTab = useCallback(
    (id: string) => {
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
      if (wasActive) setActiveId('')
    },
    [],
  )

  const addTab = useCallback(() => {
    const t = emptyTab()
    setTabs((list) => [...list, t])
    setActiveId(t.id)
    return t.id
  }, [])

  /** Send uplink opus from mic → active tab socket. */
  const sendUplink = useCallback((opus: Uint8Array) => {
    const tab = tabsRef.current.find((t) => t.id === activeIdRef.current)
    tab?.client?.sendAudio(encodeClientFrame(opus))
  }, [])

  const activeChannelId = useMemo(() => {
    if (!active) return null
    const me = active.clients.find((c) => c.id === active.selfId)
    return me?.channelId ?? null
  }, [active])

  return {
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
    addTab,
    sendUplink,
    activeChannelId,
  }
}
