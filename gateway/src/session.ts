import type { WebSocket } from 'ws'
import net from 'node:net'
import dns from 'node:dns/promises'
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

export interface HostPolicy {
  allowPrivate: boolean
  allowlist: string[]
}

function defaultHostPolicy(): HostPolicy {
  return { allowPrivate: ALLOW_PRIVATE_HOSTS, allowlist: ALLOWED_HOSTS }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, '')
}

/** IPv4 loopback / RFC1918 / link-local / 0.0.0.0 */
function isPrivateIPv4(h: string): boolean {
  const parts = h.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  return false
}

/**
 * Extract embedded IPv4 from IPv4-mapped / IPv4-compatible IPv6 forms:
 *   ::ffff:127.0.0.1  |  ::ffff:7f00:1  |  ::127.0.0.1
 */
function extractEmbeddedIPv4(h: string): string | null {
  const dotted = h.match(/^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (dotted) return dotted[1]
  const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
  }
  return null
}

export function isPrivateOrLocalHost(host: string): boolean {
  const h = normalizeHost(host)
  if (h === 'localhost' || h === '0.0.0.0') return true
  if (/\.local$/.test(h) || /\.internal$/.test(h)) return true

  if (net.isIPv4(h)) return isPrivateIPv4(h)

  if (net.isIPv6(h)) {
    // Full-form / compressed loopback
    if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true
    // IPv4-mapped must be judged as the embedded IPv4
    const embedded = extractEmbeddedIPv4(h)
    if (embedded) return isPrivateIPv4(embedded)
    // IPv6 ULA / link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return true
    if (h.startsWith('fe80')) return true
    // unspecified
    if (h === '::' || h === '0:0:0:0:0:0:0:0') return true
    return false
  }

  // hostname: only allowlist / DNS resolve can gate private targets
  return false
}

function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  const h = normalizeHost(host)
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

export function assertHostAllowed(host: string, policy: HostPolicy = defaultHostPolicy()) {
  const h = normalizeHost(host)
  if (!h) {
    throw new Error('Host 不能为空')
  }
  // Always block cloud metadata / link-local even if allowlisted by mistake
  if (h === '169.254.169.254') {
    throw new Error('拒绝连接云元数据地址')
  }
  if (policy.allowlist.length > 0) {
    if (!hostMatchesAllowlist(h, policy.allowlist)) {
      throw new Error(`Host 不在 ALLOWED_HOSTS 白名单: ${host}`)
    }
    return
  }
  if (!policy.allowPrivate && isPrivateOrLocalHost(h)) {
    throw new Error(
      `拒绝连接私网/本机地址 ${host}。内网部署请设置 ALLOW_PRIVATE_HOSTS=1 或 ALLOWED_HOSTS 白名单。`,
    )
  }
}

/**
 * Resolve hostnames and reject any A/AAAA that is private (when policy forbids).
 * IP literals skip DNS. Allowlist short-circuits (admin explicitly opted in).
 */
export async function assertHostResolvesSafe(
  host: string,
  policy: HostPolicy = defaultHostPolicy(),
): Promise<void> {
  assertHostAllowed(host, policy)
  if (policy.allowlist.length > 0 || policy.allowPrivate) return
  const h = normalizeHost(host)
  if (net.isIP(h)) return
  let addrs: Array<{ address: string }>
  try {
    addrs = await dns.lookup(h, { all: true })
  } catch {
    throw new Error(`无法解析主机名: ${host}`)
  }
  if (!addrs.length) {
    throw new Error(`无法解析主机名: ${host}`)
  }
  for (const a of addrs) {
    if (normalizeHost(a.address) === '169.254.169.254') {
      throw new Error('拒绝连接云元数据地址')
    }
    if (isPrivateOrLocalHost(a.address)) {
      throw new Error(
        `拒绝连接解析到私网/本机的地址 ${host} → ${a.address}。内网部署请设置 ALLOW_PRIVATE_HOSTS=1 或 ALLOWED_HOSTS 白名单。`,
      )
    }
  }
}

function asString(v: unknown, max: number): string {
  if (typeof v !== 'string') throw new Error('Expected string')
  const s = v.trim()
  if (!s || s.length > max) throw new Error('Invalid string length')
  return s
}

/** Like asString but preserves leading/trailing spaces (server passwords). */
function asRawString(v: unknown, max: number): string {
  if (typeof v !== 'string') throw new Error('Expected string')
  if (!v || v.length > max) throw new Error('Invalid string length')
  return v
}

function asChannelId(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 0x7fffffff) {
    throw new Error('Invalid channelId')
  }
  return n
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
            : asRawString(msg.password, 256)
        if (PROTOCOL !== 'mock') {
          await assertHostResolvesSafe(host)
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
              // Downlink: [opcode][codec][clientId u32 BE][opus...]
              const header = Buffer.alloc(6)
              header[0] = OPCODE_AUDIO
              header[1] = frame.codec & 0xff
              header.writeUInt32BE(frame.clientId >>> 0, 2)
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
            // Superseded mid-connect: drop the half-open adapter.
            await this.teardownAdapter()
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
        } catch (err) {
          // Failed handshake must not leave a half-open TS3 client around.
          if (gen === this.connectGen) {
            await this.teardownAdapter()
          }
          throw err
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
        await this.adapter.joinChannel(asChannelId(msg.channelId))
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
