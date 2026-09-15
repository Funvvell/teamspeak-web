import type { Dispatch, SetStateAction } from 'react'
import {
  DEFAULT_VOICE_PORT,
  type ChannelNode,
  type ClientInfo,
  type ConnectionState,
} from '../../shared/types'
import { createGatewayClient, type WsStatus } from '../lib/gateway-client'
import type { DeviceState, VoxSettings } from '../lib/mic'
import type { LogItem, RecentServer } from '../lib/utils'

export interface ChatMsg {
  from: string
  fromId: number
  target: string
  text: string
  ts: number
  whisper?: boolean
}

export interface ConnectionTab {
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

export function emptyTab(partial?: Partial<ConnectionTab>): ConnectionTab {
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

export type AppView = 'login' | 'main' | 'settings' | 'permissions'
export type SettingsNav = 'account' | 'audio' | 'activation' | 'notify' | 'theme' | 'network'
export type FieldErrors = { host?: string; nickname?: string }
export type ToastKind = 'success' | 'info' | 'warn' | 'err'

/** Structural type matching `useMicrophone`'s return value. */
export interface MicrophoneController {
  state: DeviceState
  requestMic: (deviceId?: string) => Promise<void>
  stopMic: () => void
  refreshDevices: () => Promise<void>
  setState: Dispatch<SetStateAction<DeviceState>>
  pushIncoming: (opus: Uint8Array, clientId?: number) => void
  setOutputVolume: (v: number) => void
  setOutputDevice: (deviceId: string) => Promise<void>
  setClientVolume: (clientId: number, v: number) => void
  getClientVolume: (clientId: number) => number
  setMuted: (m: boolean) => void
  setAudioFx: (fx: { aec: boolean; agc: boolean; noise?: boolean }) => void
  setVox: (patch: Partial<VoxSettings>) => void
  getVad: () => number
  keyLabel: (code: string) => string
}

export type { RecentServer }
