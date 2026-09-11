import type { WebSocket } from 'ws'
import type {
  ClientToGateway,
  ConnectionState,
  GatewayToClient,
} from '../../shared/types'
import type { AdapterFactory } from './protocol/adapter'

export class Session {
  private adapter: ReturnType<AdapterFactory> | null = null

  constructor(
    private readonly ws: WebSocket,
    private readonly createAdapter: AdapterFactory,
  ) {}

  private send(msg: GatewayToClient) {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private status(state: ConnectionState, message?: string) {
    this.send({ type: 'status', state, message })
  }

  handleRaw(data: string) {
    let msg: ClientToGateway
    try {
      msg = JSON.parse(data) as ClientToGateway
    } catch {
      this.send({ type: 'error', code: 'bad_json', message: 'Invalid JSON' })
      return
    }
    void this.handle(msg).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.send({ type: 'error', code: 'handler', message })
      this.status('error', message)
    })
  }

  private async handle(msg: ClientToGateway) {
    switch (msg.type) {
      case 'connect': {
        await this.teardownAdapter()
        this.status('connecting', `Connecting to ${msg.host}:${msg.port}`)
        this.adapter = this.createAdapter((m) => this.send(m))
        const info = await this.adapter.connect({
          host: msg.host,
          port: msg.port,
          nickname: msg.nickname,
          password: msg.password,
        })
        this.send({
          type: 'server_info',
          name: info.name,
          welcome: info.welcome,
          selfId: info.selfId,
        })
        this.status('connected')
        return
      }
      case 'disconnect': {
        await this.teardownAdapter()
        this.status('disconnected')
        return
      }
      case 'join_channel': {
        if (!this.adapter) throw new Error('Not connected')
        await this.adapter.joinChannel(msg.channelId)
        return
      }
      case 'send_message': {
        if (!this.adapter) throw new Error('Not connected')
        this.adapter.sendText(msg.target, msg.text)
        return
      }
      case 'mic': {
        this.send({
          type: 'status',
          state: 'connected',
          message: msg.enabled ? 'Mic on' : 'Mic off',
        })
        return
      }
      default: {
        this.send({
          type: 'error',
          code: 'unknown',
          message: 'Unknown message type',
        })
      }
    }
  }

  private async teardownAdapter() {
    if (this.adapter) {
      await this.adapter.disconnect()
      this.adapter = null
    }
  }

  async dispose() {
    await this.teardownAdapter()
  }
}
