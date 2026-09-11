export interface ChannelNode {
  id: number
  name: string
  parentId: number | null
  maxClients: number
  isDefault: boolean
  clients: ClientInfo[]
}

export interface ClientInfo {
  id: number
  nickname: string
  channelId: number
  isTalking: boolean
  isMuted: boolean
  isCommander?: boolean
  isAway?: boolean
  isInputMuted?: boolean
  isOutputMuted?: boolean
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export type WhisperTarget =
  | { kind: 'client'; id: number }
  | { kind: 'channel'; id: number }

export type MessageTarget =
  | 'channel'
  | 'server'
  | { client: number }

export type ClientToGateway =
  | {
      type: 'connect'
      host: string
      port: number
      nickname: string
      password?: string
    }
  | { type: 'disconnect' }
  | { type: 'join_channel'; channelId: number }
  | {
      type: 'send_message'
      target: MessageTarget
      text: string
    }
  | { type: 'mic'; enabled: boolean }
  | { type: 'whisper_add'; target: WhisperTarget }
  | { type: 'whisper_clear' }
  | { type: 'poke'; targetId: number; message?: string }

export type GatewayToClient =
  | {
      type: 'status'
      state: ConnectionState
      message?: string
    }
  | {
      type: 'server_info'
      name: string
      welcome: string
      selfId: number
    }
  | { type: 'channel_tree'; channels: ChannelNode[] }
  | { type: 'client_list'; clients: ClientInfo[] }
  | {
      type: 'message'
      from: string
      fromId: number
      target: string
      text: string
      ts: number
      /** true when delivered via whisper targeting */
      whisper?: boolean
    }
  | { type: 'error'; code: string; message: string }

export const DEFAULT_VOICE_PORT = 9987
