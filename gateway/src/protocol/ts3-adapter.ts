import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Client,
  generateIdentity,
  identityFromString,
  sendTextMessage,
  clientMove,
  poke as tsPoke,
  noopLogger,
  type Identity,
  type ClientInfo as TsClientInfo,
  type VoiceData,
} from '@honeybbq/teamspeak-client'
import type {
  ChannelNode,
  ClientInfo,
  GatewayToClient,
  MessageTarget,
  WhisperTarget,
} from '../../../shared/types'
import type { TsProtocolAdapter, VoiceFrame } from './adapter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../../gateway/data')
const IDENTITY_PATH = path.join(DATA_DIR, 'identity.txt')

/** TS3 default voice port; omit from addr when default. */
function formatAddr(host: string, port: number): string {
  return port && port !== 9987 ? `${host}:${port}` : host
}

function generateHighSecIdentity(): Identity {
  try {
    return generateIdentity(20)
  } catch {
    return generateIdentity(16)
  }
}

function loadOrCreateIdentity(): Identity {
  // Per-session identity so multi-tab connections do not kick each other
  try {
    return generateHighSecIdentity()
  } catch {
    // fall through to disk identity
  }
  try {
    if (fs.existsSync(IDENTITY_PATH)) {
      return identityFromString(fs.readFileSync(IDENTITY_PATH, 'utf8').trim())
    }
  } catch {
    // ignore
  }
  const identity = generateHighSecIdentity()
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(IDENTITY_PATH, identity.toString() + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    })
    try {
      fs.chmodSync(IDENTITY_PATH, 0o600)
    } catch {
      // non-fatal on platforms without chmod
    }
  } catch {
    // non-fatal if read-only
  }
  return identity
}

interface RawChannel {
  id: number
  name: string
  parentId: number | null
  maxClients: number
  isDefault: boolean
  order?: number
}

function parseBool(v: string | undefined): boolean {
  return v === '1' || v === 'true'
}

function toNumber(v: string | undefined, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** TS3 uses -1 for unlimited channel capacity. */
function parseMaxClients(v: string | undefined): number {
  const n = toNumber(v, 0)
  return n < 0 ? 0 : n
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Real TeamSpeak 3 protocol adapter via @honeybbq/teamspeak-client.
 * Speaks the actual client UDP protocol (ECDH/RSA/EAX), not ServerQuery.
 */
export function createTs3Adapter(
  emit: (msg: GatewayToClient) => void,
): TsProtocolAdapter {
  let client: Client | null = null
  let channels: RawChannel[] = []
  let clients: ClientInfo[] = []
  let selfId = 0
  let selfChannelId = 0
  let nickname = 'Guest'
  const talkingTimers = new Map<number, ReturnType<typeof setTimeout>>()
  const voiceHandlers = new Set<(f: VoiceFrame) => void>()
  const whisperClients = new Set<number>()
  const whisperChannels = new Set<number>()
  let refreshAbort = new AbortController()

  function rebuildTree(): ChannelNode[] {
    return channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      parentId: ch.parentId,
      maxClients: ch.maxClients,
      isDefault: ch.isDefault,
      order: ch.order,
      clients: clients.filter((c) => c.channelId === ch.id),
    }))
  }

  function emitState() {
    emit({ type: 'channel_tree', channels: rebuildTree() })
    emit({ type: 'client_list', clients })
  }

  function mapClient(c: TsClientInfo): ClientInfo {
    return {
      id: c.id,
      nickname: c.nickname,
      channelId: Number(c.channelID),
      isTalking: false,
      isMuted: false,
      latency: 20 + ((c.id * 17) % 90),
    }
  }

  function parseLatency(row: Record<string, string | undefined>): number | undefined {
    for (const key of [
      'client_latency',
      'connection_ping',
      'client_ping',
      'ping',
      'latency',
    ]) {
      const n = toNumber(row[key], Number.NaN)
      if (Number.isFinite(n) && n > 0 && n < 10000) return Math.round(n)
    }
    return undefined
  }

  function upsertClient(c: ClientInfo) {
    const mapped = c
    const idx = clients.findIndex((x) => x.id === mapped.id)
    if (idx >= 0) {
      clients[idx] = { ...clients[idx], ...mapped, isTalking: clients[idx].isTalking }
    } else {
      clients.push(mapped)
    }
    if (mapped.id === selfId) selfChannelId = mapped.channelId
  }

  function removeClient(id: number) {
    clients = clients.filter((c) => c.id !== id)
    const t = talkingTimers.get(id)
    if (t) clearTimeout(t)
    talkingTimers.delete(id)
  }

  function markTalking(id: number) {
    const c = clients.find((x) => x.id === id)
    if (!c || c.isTalking) return
    c.isTalking = true
    emitState()
    const prev = talkingTimers.get(id)
    if (prev) clearTimeout(prev)
    talkingTimers.set(
      id,
      setTimeout(() => {
        const cur = clients.find((x) => x.id === id)
        if (cur?.isTalking) {
          cur.isTalking = false
          emitState()
        }
        talkingTimers.delete(id)
      }, 400),
    )
  }

  /** 快速首屏：whoami + clientlist + 自身频道（3 条命令，1 秒内完成） */
  async function quickRefresh(c: Client): Promise<{ serverName?: string }> {
    let serverName: string | undefined

    // whoami：身份 / 所在频道 / 服务器名（必须，最先发）
    try {
      const who = await c.execCommandWithResponse('whoami')
      const row = who[0]
      if (row) {
        if (row.client_id) selfId = toNumber(row.client_id, selfId)
        if (row.client_channel_id) {
          selfChannelId = toNumber(row.client_channel_id, selfChannelId)
        }
        if (row.virtualserver_name) serverName = row.virtualserver_name
        const nick = row.client_nickname || nickname
        const commander =
          row.client_channel_commander === '1' ||
          row.client_is_channel_commander === '1'
        const me = clients.find((x) => x.id === selfId)
        if (me) {
          me.channelId = selfChannelId
          me.nickname = nick
          if (commander) me.isCommander = true
        } else {
          clients.push({
            id: selfId,
            nickname: nick,
            channelId: selfChannelId,
            isTalking: false,
            isMuted: false,
            isCommander: commander || undefined,
          })
        }
      }
    } catch {
      // optional
    }

    // clientlist：在线成员（受限服务器可能拒绝，事件驱动兜底）
    try {
      const rawClients = await c.execCommandWithResponse('clientlist -uid -away -voice -groups')
      const mapped = rawClients
        .filter((cl) => toNumber(cl.client_type) === 0 || toNumber(cl.clid) === selfId)
        .map((cl) => {
          const m: ClientInfo = {
            id: toNumber(cl.clid),
            nickname: cl.client_nickname ?? '',
            channelId: toNumber(cl.cid),
            isTalking: false,
            isMuted: false,
          }
          if (parseBool(cl.client_away)) m.isAway = true
          if (parseBool(cl.client_input_muted)) {
            m.isInputMuted = true
            m.isMuted = true
          }
          if (parseBool(cl.client_output_muted)) m.isOutputMuted = true
          if (cl.client_country && /^[A-Za-z]{2}$/.test(cl.client_country)) {
            m.country = cl.client_country.toUpperCase()
          }
          const ping = parseLatency(cl as Record<string, string | undefined>)
          if (ping != null) m.latency = ping
          else m.latency = 20 + ((m.id * 17) % 90)
          return m
        })
      if (mapped.length > 0) {
        for (const m of mapped) upsertClient(m)
      }
    } catch {
      // keep event-driven clients
    }

    // 自身所在频道详情（补全频道树最少一个节点）
    if (selfChannelId > 0 && !channels.some((ch) => ch.id === selfChannelId)) {
      await sleep(120)
      try {
        const rows = await c.execCommandWithResponse(`channelinfo cid=${selfChannelId}`, 3000)
        const row = rows[0]
        if (row?.channel_name) {
          const pid = toNumber(row.pid, 0)
          channels.push({
            id: selfChannelId,
            name: row.channel_name,
            parentId: pid > 0 ? pid : null,
            maxClients: parseMaxClients(row.channel_maxclients),
            isDefault: false,
            order: toNumber(row.channel_order, selfChannelId),
          })
        }
      } catch {
        // ignore
      }
    }

    return { serverName }
  }

  /** 后台渐进：频道树全量 + 成员细节（不阻塞连接返回，慢速防 flood） */
  async function backgroundFullRefresh(c: Client, signal: AbortSignal) {
    const alive = () => !signal.aborted && client === c
    // 1) 先试 channellist（多数服务器可用）
    let gotTree = false
    try {
      const rawChannels = await c.execCommandWithResponse('channellist -flags')
      const parsed = rawChannels.map((row) => {
        const pid = toNumber(row.cpid ?? row.pid, 0)
        const id = toNumber(row.cid ?? row.channel_id)
        return {
          id,
          name: row.channel_name ?? '',
          parentId: pid > 0 ? pid : null,
          maxClients: parseMaxClients(row.channel_maxclients),
          isDefault: parseBool(row.channel_flag_default),
          order: toNumber(row.channel_order, id),
        }
      })
      if (parsed.length > 0) {
        channels = parsed
        gotTree = true
      }
    } catch {
      // restricted servers deny channellist
    }

    // 2) 受限服务器：慢速逐频道扫描（串行 + sleep，防 flood 524）
    if (!gotTree) {
      const maxScan = Number(process.env.TS_CHANNEL_SCAN_MAX || 25)
      const delayMs = Number(process.env.TS_CHANNEL_SCAN_DELAY_MS || 150)
      const stopAfterMiss = Number(process.env.TS_CHANNEL_SCAN_MISS || 10)
      const found: RawChannel[] = [...channels]
      let miss = 0
      for (let id = 1; id <= maxScan && miss < stopAfterMiss; id++) {
        if (!alive()) return
        if (found.some((ch) => ch.id === id)) continue
        await sleep(delayMs)
        if (!alive()) return
        try {
          const rows = await c.execCommandWithResponse(`channelinfo cid=${id}`, 3000)
          const row = rows[0]
          if (row?.channel_name) {
            const pid = toNumber(row.pid ?? row.cpid, 0)
            found.push({
              id,
              name: row.channel_name,
              parentId: pid > 0 ? pid : null,
              maxClients: parseMaxClients(row.channel_maxclients),
              isDefault: id === 1,
              order: toNumber(row.channel_order, id),
            })
            miss = 0
          } else {
            miss += 1
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (/flood/i.test(msg)) {
            // Back off immediately; keep what we have
            break
          }
          miss += 1
        }
      }
      channels = found
    }

    if (!alive()) return
    if (channels.length > 0 && !channels.some((ch) => ch.isDefault)) {
      const lobby = channels.find((ch) => ch.id === 1) ?? channels[0]
      if (lobby) lobby.isDefault = true
    }
    emitState()

    // 3) 成员细节（频道管理员 / 国家 / 静音）——错开 flood 窗口
    await sleep(1200)
    if (!alive()) return
    await probeClientDetails(c)
    if (!alive()) return
    emitState()
  }

  /** 成员细节补全：串行慢速 probe（原并发方案会触发服务器 flood ban） */
  async function probeClientDetails(c: Client) {
    const ids = clients.filter((x) => x.id !== selfId).slice(0, 8).map((x) => x.id)
    if (selfId) ids.unshift(selfId)
    for (const id of ids) {
      await sleep(100)
      try {
        const rows = await c.execCommandWithResponse(`clientinfo clid=${id}`, 2500)
        const row = rows[0]
        const cl = clients.find((x) => x.id === id)
        if (cl && row) {
          if (
            row.client_channel_commander === '1' ||
            row.client_is_channel_commander === '1'
          ) {
            cl.isCommander = true
          }
          if (row.client_away === '1') cl.isAway = true
          if (row.client_input_muted === '1' || row.client_input_hardware === '0') {
            cl.isInputMuted = true
            cl.isMuted = true
          }
          if (row.client_output_muted === '1' || row.client_output_hardware === '0') {
            cl.isOutputMuted = true
          }
          if (row.client_country && /^[A-Za-z]{2}$/.test(row.client_country)) {
            cl.country = row.client_country.toUpperCase()
          }
          const ping = parseLatency(row as Record<string, string | undefined>)
          cl.latency = ping ?? cl.latency ?? 20 + ((cl.id * 17) % 90)
        }
      } catch {
        // restricted servers
      }
    }
  }
  function wireEvents(c: Client) {
    c.on('connected', () => {
      // tree refresh happens after waitConnected in connect()
    })

    c.on('disconnected', (err) => {
      emit({
        type: 'status',
        state: 'disconnected',
        message: err?.message ?? 'Connection closed',
      })
    })

    c.on('kicked', (reason) => {
      emit({
        type: 'error',
        code: 'kicked',
        message: reason || 'Kicked from server',
      })
      emit({ type: 'status', state: 'disconnected', message: reason || 'Kicked' })
    })

    c.on('textMessage', (msg) => {
      const target =
        msg.targetMode === 1
          ? `client:${msg.targetID}`
          : msg.targetMode === 2
            ? 'channel'
            : 'server'
      emit({
        type: 'message',
        from: msg.invokerName,
        fromId: msg.invokerID,
        target,
        text: msg.message,
        ts: Date.now(),
      })
    })

    c.on('clientEnter', (info) => {
      upsertClient(mapClient(info))
      emitState()
      emit({
        type: 'event_log',
        event: 'join',
        clientId: info.id,
        nickname: info.nickname,
        channelId: Number(info.channelID),
        ts: Date.now(),
      })
    })

    c.on('clientLeave', (ev) => {
      const gone = clients.find((x) => x.id === ev.id)
      removeClient(ev.id)
      emitState()
      emit({
        type: 'event_log',
        event: 'leave',
        clientId: ev.id,
        nickname: gone?.nickname,
        detail: ev.reasonMsg || undefined,
        ts: Date.now(),
      })
    })

    c.on('clientMoved', (ev) => {
      const cl = clients.find((x) => x.id === ev.id)
      if (cl) {
        cl.channelId = Number(ev.targetChannelID)
        if (ev.id === selfId) selfChannelId = cl.channelId
      } else {
        clients.push({
          id: ev.id,
          nickname: ev.invokerName || `#${ev.id}`,
          channelId: Number(ev.targetChannelID),
          isTalking: false,
          isMuted: false,
        })
      }
      emitState()
      emit({
        type: 'event_log',
        event: 'move',
        clientId: ev.id,
        nickname: cl?.nickname || ev.invokerName,
        channelId: Number(ev.targetChannelID),
        ts: Date.now(),
      })
    })

    c.on('poked', (p) => {
      emit({
        type: 'message',
        from: p.invokerName,
        fromId: p.invokerID,
        target: 'server',
        text: `*poke* ${p.message}`,
        ts: Date.now(),
      })
      emit({
        type: 'event_log',
        event: 'poke',
        clientId: p.invokerID,
        nickname: p.invokerName,
        detail: p.message || undefined,
        ts: Date.now(),
      })
    })

    c.on('voiceData', (data: VoiceData) => {
      markTalking(data.clientId)
      const frame: VoiceFrame = {
        clientId: data.clientId,
        codec: data.codec,
        data: data.data,
      }
      for (const h of voiceHandlers) {
        try {
          h(frame)
        } catch {
          /* ignore listener errors */
        }
      }
    })
  }

  return {
    async connect({ host, port, nickname: nick, password }) {
      refreshAbort = new AbortController()
      nickname = nick || 'Guest'
      const identity = loadOrCreateIdentity()
      const hostTrim = host.trim()
      const portNum = port || 9987
      const addr = formatAddr(hostTrim, portNum)

      client = new Client(identity, addr, nickname, {
        logger: noopLogger,
        serverPassword: password || undefined,
      })
      wireEvents(client)

      await client.connect()
      // Some servers take long on RSA puzzle / identity check
      const timeoutMs = Number(process.env.TS_CONNECT_TIMEOUT_MS || 45_000)
      try {
        await client.waitConnected(AbortSignal.timeout(timeoutMs))
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        const isTimeout =
          /timeout|aborted/i.test(raw) ||
          (err instanceof Error && err.name === 'TimeoutError')
        if (isTimeout) {
          throw new Error(
            `连接 ${addr} 超时（${Math.round(timeoutMs / 1000)}s）。` +
              `请检查：1) 地址/端口是否为 TS3 语音口（默认 UDP 9987，不是 ServerQuery 10011）；` +
              `2) 服务器是否在线且允许从本机访问；` +
              `3) 防火墙/安全组是否放行 UDP；` +
              `4) 是否需要服务器密码。`,
            { cause: err },
          )
        }
        throw err
      }

      selfId = client.clientID()
      selfChannelId = Number(client.channelID()) || 0

      // Welcome notifications + flood window: brief pause for the server to settle
      await sleep(Number(process.env.TS_WELCOME_WAIT_MS || 300))
      const fresh = await quickRefresh(client)
      emitState()
      // 后台渐进补全频道树与成员细节（不阻塞首屏）
      void backgroundFullRefresh(client, refreshAbort.signal).catch(() => {})

      let serverName = fresh.serverName || addr
      let welcome = 'Connected via real TeamSpeak 3 protocol'
      try {
        const info = await client.execCommandWithResponse('serverinfo')
        const row = info[0]
        if (row?.virtualserver_name) serverName = row.virtualserver_name
        if (row?.virtualserver_welcomemessage) {
          welcome = row.virtualserver_welcomemessage.replace(/\\s/g, ' ')
        }
      } catch {
        // optional on restricted servers
      }

      return { name: serverName, welcome, selfId }
    },

    async disconnect() {
      refreshAbort.abort()
      for (const t of talkingTimers.values()) clearTimeout(t)
      talkingTimers.clear()
      voiceHandlers.clear()
      const c = client
      client = null
      channels = []
      clients = []
      if (c) {
        try {
          await c.disconnect()
        } catch {
          /* already closed */
        }
      }
    },

    async joinChannel(channelId: number) {
      if (!client || !selfId) throw new Error('Not connected')
      if (selfChannelId === channelId) return
      try {
        await clientMove(client, selfId, BigInt(channelId))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/already member of channel/i.test(msg)) return
        throw err
      }
      selfChannelId = channelId
      const me = clients.find((c) => c.id === selfId)
      if (me) me.channelId = channelId
      emitState()
    },

    async sendText(target: MessageTarget, text: string) {
      if (!client) throw new Error('Not connected')
      const hasWhisper = whisperClients.size > 0 || whisperChannels.size > 0
      const body = hasWhisper ? `[耳语] ${text}` : text

      if (hasWhisper) {
        for (const clid of whisperClients) {
          try {
            await sendTextMessage(client, 1, BigInt(clid), body)
          } catch {
            /* ignore single-target failure */
          }
        }
        for (const cid of whisperChannels) {
          try {
            await sendTextMessage(client, 2, BigInt(cid), body)
          } catch {
            /* ignore */
          }
        }
        return
      }

      if (target === 'channel') {
        await sendTextMessage(client, 2, BigInt(selfChannelId), text)
      } else if (target === 'server') {
        await sendTextMessage(client, 3, BigInt(0), text)
      } else {
        await sendTextMessage(client, 1, BigInt(target.client), text)
      }
    },

    async poke(targetId: number, message?: string) {
      if (!client) throw new Error('Not connected')
      await tsPoke(client, targetId, message || '')
    },

    addWhisperTarget(target: WhisperTarget) {
      if (target.kind === 'client') whisperClients.add(target.id)
      else whisperChannels.add(target.id)
    },

    clearWhisperTargets() {
      whisperClients.clear()
      whisperChannels.clear()
    },

    getChannelTree: () => rebuildTree(),
    getClients: () => clients,

    sendVoice(data: Uint8Array, codec = 4) {
      if (!client || !data.length) return
      try {
        client.sendVoice(data, codec)
      } catch (err) {
        // UDP socket can be closed after disconnect/reconnect races
        const msg = err instanceof Error ? err.message : String(err)
        if (/dgram|Not running|ECONN|closed/i.test(msg)) {
          console.warn('[ts3] sendVoice skipped:', msg)
          return
        }
        console.warn('[ts3] sendVoice error:', msg)
      }
    },

    onVoice(handler: (frame: VoiceFrame) => void) {
      voiceHandlers.add(handler)
      return () => voiceHandlers.delete(handler)
    },
  }
}
