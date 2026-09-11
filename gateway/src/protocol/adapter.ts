import type {
  ChannelNode,
  ClientInfo,
  GatewayToClient,
} from '../../../shared/types'

export interface VoiceFrame {
  clientId: number
  codec: number
  data: Uint8Array
}

export interface TsProtocolAdapter {
  connect(opts: {
    host: string
    port: number
    nickname: string
    password?: string
  }): Promise<{ name: string; welcome: string; selfId: number }>
  disconnect(): Promise<void>
  joinChannel(channelId: number): Promise<void>
  sendText(
    target: 'channel' | 'server' | { client: number },
    text: string,
  ): void | Promise<void>
  getChannelTree(): ChannelNode[]
  getClients(): ClientInfo[]
  /** Optional real-voice path */
  sendVoice?(data: Uint8Array, codec?: number): void
  onVoice?(handler: (frame: VoiceFrame) => void): () => void
}

export type AdapterFactory = (
  emit: (msg: GatewayToClient) => void,
) => TsProtocolAdapter
