import type { WebSocket } from 'ws'
import type {
  ClientToGateway,
  ConnectionState,
  GatewayToClient,
} from '../../shared/types'
import type { AdapterFactory } from './protocol/adapter'

const OPCODE_AUDIO = 1

export class Session {
  private adapter: ReturnType<AdapterFactory> | null = null
  private connecting = false
  private connectGen = 0

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

  handleRaw(data: string | Buffer | ArrayBuffer | Buffer[]) {
    // Binary frames: [opcode:u8=1][codec:u8][opus payload...] or [1][codec][id u16][opus]
    if (typeof data !== 'string') {
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer)
      if (buf[0] !== OPCODE_AUDIO) {
        console.warn(
          '[session] unknown binary opcode:',
          buf[0],
          'len=' + buf.length,
        )
        return
      }
      if (buf.length < 3) {
        // 帧头至少 opcode+codec+1 字节载荷，空帧直接丢弃
        console.warn('[session] dropped empty audio frame, len=' + buf.length)
        return
      }
      if (this.adapter?.sendVoice) {
        try {
          const codec = buf[1]
          this.adapter.sendVoice(buf.subarray(2), codec)
        } catch (err) {
          console.warn(
            '[session] sendVoice frame error:',
            err instanceof Error ? err.message : err,
          )
        }
      }
      return
    }

    let msg: ClientToGateway
    try {
      msg = JSON.parse(data) as ClientToGateway
    } catch {
      this.send({ type: 'error', code: 'bad_json', message: 'Invalid JSON' })
      return
    }
    void this.handle(msg).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      // Benign: user already in target channel
      if (/already member of channel/i.test(message)) {
        console.warn('[session]', message)
        return
      }
      console.error('[session]', message)
      this.send({ type: 'error', code: 'handler', message })
      this.status('error', message)
    })
  }

  private async handle(msg: ClientToGateway) {
    switch (msg.type) {
      case 'connect': {
        // Ignore duplicate connect while one is in flight (auto-reconnect storms)
        if (this.connecting) {
          console.warn('[session] connect ignored — already connecting')
          this.status('connecting', '已有连接进行中，请稍候')
          return
        }
        this.connecting = true
        const gen = ++this.connectGen
        try {
          await this.teardownAdapter()
          console.log(
            `[session] connect ${msg.host}:${msg.port} as ${msg.nickname}`,
          )
          this.status('connecting', `Connecting to ${msg.host}:${msg.port}`)
          this.adapter = this.createAdapter((m) => this.send(m))
          if (this.adapter.onVoice) {
            this.adapter.onVoice((frame) => {
              if (this.ws.readyState !== this.ws.OPEN) return
              if (gen !== this.connectGen) return
              const header = Buffer.alloc(4)
              header[0] = OPCODE_AUDIO
              header[1] = frame.codec & 0xff
              header.writeUInt16BE(frame.clientId & 0xffff, 2)
              this.ws.send(Buffer.concat([header, Buffer.from(frame.data)]))
            })
          }
          const info = await this.adapter.connect({
            host: msg.host,
            port: msg.port,
            nickname: msg.nickname,
            password: msg.password,
          })
          if (gen !== this.connectGen) {
            // Superseded by a newer connect/teardown
            return
          }
          console.log(
            `[session] connected ${msg.host}:${msg.port} name=${info.name} selfId=${info.selfId}`,
          )
          this.send({
            type: 'server_info',
            name: info.name,
            welcome: info.welcome,
            selfId: info.selfId,
          })
          this.status('connected')
          this.send({
            type: 'event_log',
            event: 'connect',
            nickname: msg.nickname,
            ts: Date.now(),
          })
        } finally {
          if (gen === this.connectGen) this.connecting = false
        }
        return
      }
      case 'disconnect': {
        await this.teardownAdapter()
        this.status('disconnected')
        this.send({
          type: 'event_log',
          event: 'disconnect',
          ts: Date.now(),
        })
        return
      }
      case 'join_channel': {
        if (!this.adapter) throw new Error('Not connected')
        await this.adapter.joinChannel(msg.channelId)
        return
      }
      case 'send_message': {
        if (!this.adapter) throw new Error('Not connected')
        await this.adapter.sendText(msg.target, msg.text)
        return
      }
      case 'whisper_add': {
        if (!this.adapter) throw new Error('Not connected')
        this.adapter.addWhisperTarget?.(msg.target)
        return
      }
      case 'whisper_clear': {
        if (!this.adapter) throw new Error('Not connected')
        this.adapter.clearWhisperTargets?.()
        return
      }
      case 'poke': {
        if (!this.adapter) throw new Error('Not connected')
        await this.adapter.poke?.(msg.targetId, msg.message)
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
