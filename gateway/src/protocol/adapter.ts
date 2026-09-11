import type {
  ChannelNode,
  ClientInfo,
  GatewayToClient,
  MessageTarget,
  WhisperTarget,
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
  sendText(target: MessageTarget, text: string): void | Promise<void>
  poke?(targetId: number, message?: string): void | Promise<void>
  addWhisperTarget?(target: WhisperTarget): void
  clearWhisperTargets?(): void
  getChannelTree(): ChannelNode[]
  getClients(): ClientInfo[]
  sendVoice?(data: Uint8Array, codec?: number): void
  onVoice?(handler: (frame: VoiceFrame) => void): () => void
}

export type AdapterFactory = (
  emit: (msg: GatewayToClient) => void,
) => TsProtocolAdapter
