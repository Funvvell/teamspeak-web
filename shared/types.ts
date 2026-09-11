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
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

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
      target: 'channel' | 'server' | { client: number }
      text: string
    }
  | { type: 'mic'; enabled: boolean }

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
    }
  | { type: 'error'; code: string; message: string }

export const DEFAULT_VOICE_PORT = 9987
