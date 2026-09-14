import type { WebSocket } from 'ws'
import net from 'node:net'
import type {
  ClientToGateway,
  ConnectionState,
  GatewayToClient,
} from '../../shared/types'
import type { AdapterFactory } from './protocol/adapter'

const OPCODE_AUDIO = 1
const PROTOCOL = (process.env.PROTOCOL || 'ts3').toLowerCase()
const ALLOW_PRIVATE_HOSTS =
  process.env.ALLOW_PRIVATE_HOSTS === '1' || process.env.ALLOW_PRIVATE === '1'
const ALLOWED_HOSTS = (
  process.env.ALLOWED_HOSTS ||
  process.env.ALLOW_HOSTS ||
  ''
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
const CONNECT_MIN_INTERVAL_MS = 2000
const MAX_TEXT_LEN = 2000

function isPrivateOrLocalHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true
  if (/\.local$/.test(h) || /\.internal$/.test(h)) return true

  const v4 = net.isIPv4(h)
  const v6 = net.isIPv6(h)
  if (!v4 && !v6) {
    // hostname: only allowlist can gate; private-looking names handled above
    return false
  }
  if (v4) {
    const parts = h.split('.').map(Number)
    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 0) return true
    return false
  }
  // IPv6 ULA / link-local / metadata-ish
  if (h.startsWith('fc') || h.startsWith('fd')) return true
  if (h.startsWith('fe80')) return true
  return false
}

function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  const h = host.trim().toLowerCase()
  for (const entry of allowlist) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1) // ".example.com"
      if (h.length > suffix.length && h.endsWith(suffix)) return true
    } else if (h === entry) {
      return true
    }
  }
  return false
}

function assertHostAllowed(host: string) {
  const h = host.trim().toLowerCase()
  if (!h) {
    throw new Error('Host 不能为空')
  }
  // Always block cloud metadata / link-local even if allowlisted by mistake
  if (h === '169.254.169.254') {
    throw new Error('拒绝连接云元数据地址')
  }
  if (ALLOWED_HOSTS.length > 0) {
    if (!hostMatchesAllowlist(h, ALLOWED_HOSTS)) {
      throw new Error(`Host 不在 ALLOWED_HOSTS 白名单: ${host}`)
    }
    return
  }
  if (!ALLOW_PRIVATE_HOSTS && isPrivateOrLocalHost(host)) {
    throw new Error(
      `拒绝连接私网/本机地址 ${host}。内网部署请设置 ALLOW_PRIVATE_HOSTS=1 或 ALLOWED_HOSTS 白名单。`,
    )
  }
}

function asString(v: unknown, max: number): string {
  if (typeof v !== 'string') throw new Error('Expected string')
  const s = v.trim()
  if (!s || s.length > max) throw new Error('Invalid string length')
  return s
}

function asPort(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error('Invalid port')
  }
  return n
}

export class Session {
  private adapter: ReturnType<AdapterFactory> | null = null
  private connecting = false
  private connectGen = 0
  private lastConnectAt = 0

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
    // Uplink (browser → gateway): [opcode=1][codec][opus...] — always 2-byte header.
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
        console.warn('[session] dropped empty audio frame, len=' + buf.length)
        return
      }
      if (this.adapter?.sendVoice) {
        try {
          const codec = buf[1]
          const opus = buf.subarray(2)
          this.adapter.sendVoice(opus, codec)
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
        if (this.connecting) {
          console.warn('[session] connect ignored — already connecting')
          this.status('connecting', '已有连接进行中，请稍候')
          return
        }
        const now = Date.now()
        if (
          this.lastConnectAt &&
          now - this.lastConnectAt < CONNECT_MIN_INTERVAL_MS
        ) {
          this.send({
            type: 'error',
            code: 'rate_limited',
            message: '连接过于频繁，请稍候再试',
          })
          return
        }
        this.lastConnectAt = now

        const host = asString(msg.host, 253)
        const port = asPort(msg.port)
        const nickname = asString(msg.nickname, 64)
        const password =
          msg.password == null || msg.password === ''
            ? undefined
            : asString(msg.password, 256)
        if (PROTOCOL !== 'mock') {
          assertHostAllowed(host)
        }

        this.connecting = true
        const gen = ++this.connectGen
        try {
          await this.teardownAdapter()
          console.log(`[session] connect ${host}:${port} as ${nickname}`)
          this.status('connecting', `Connecting to ${host}:${port}`)
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
            host,
            port,
            nickname,
            password,
          })
          if (gen !== this.connectGen || !this.adapter) {
            return
          }
          console.log(
            `[session] connected ${host}:${port} name=${info.name} selfId=${info.selfId}`,
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
            nickname,
            ts: Date.now(),
          })
        } finally {
          if (gen === this.connectGen) this.connecting = false
        }
        return
      }
      case 'disconnect': {
        // Invalidate in-flight connect so a late success cannot report connected
        this.connectGen += 1
        this.connecting = false
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
        const text = asString(msg.text, MAX_TEXT_LEN)
        await this.adapter.sendText(msg.target, text)
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
        const message =
          msg.message == null || msg.message === ''
            ? undefined
            : asString(msg.message, MAX_TEXT_LEN)
        await this.adapter.poke?.(msg.targetId, message)
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
    this.connectGen += 1
    this.connecting = false
    await this.teardownAdapter()
  }
}
