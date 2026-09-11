import type {
  ChannelNode,
  ClientInfo,
  GatewayToClient,
} from '../../../shared/types'

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
  ): void
  getChannelTree(): ChannelNode[]
  getClients(): ClientInfo[]
}

export type AdapterFactory = (
  emit: (msg: GatewayToClient) => void,
) => TsProtocolAdapter
