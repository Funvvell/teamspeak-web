import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Client,
  generateIdentity,
  identityFromString,
  listClients,
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

function loadOrCreateIdentity(): Identity {
  // Per-session identity so multi-tab connections do not kick each other
  try {
    return generateIdentity(8)
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
  const identity = generateIdentity(8)
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(IDENTITY_PATH, identity.toString() + '\n', 'utf8')
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
  let talkingTimers = new Map<number, ReturnType<typeof setTimeout>>()
  let voiceHandlers = new Set<(f: VoiceFrame) => void>()
  const whisperClients = new Set<number>()
  const whisperChannels = new Set<number>()
  let nicknameForWhisper = 'Guest'

  function rebuildTree(): ChannelNode[] {
    return channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      parentId: ch.parentId,
      maxClients: ch.maxClients,
      isDefault: ch.isDefault,
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
    }
  }

  function upsertClient(c: TsClientInfo) {
    const mapped = mapClient(c)
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

  async function refreshFromServer(c: Client) {
    // --- channels ---
    let loadedChannels = false
    try {
      const rawChannels = await c.execCommandWithResponse('channellist -flags')
      channels = rawChannels.map((row) => {
        const pid = toNumber(row.cpid ?? row.pid, 0)
        const id = toNumber(row.cid ?? row.channel_id)
        return {
          id,
          name: row.channel_name ?? '',
          parentId: pid > 0 ? pid : null,
          maxClients: parseMaxClients(row.channel_maxclients),
          isDefault: parseBool(row.channel_flag_default),
        }
      })
      loadedChannels = channels.length > 0
    } catch {
      // Restricted servers deny channellist (or flood-protect it)
    }

    // Rate-limited probe — many servers ban floods (error 524)
    if (!loadedChannels) {
      const maxScan = Number(process.env.TS_CHANNEL_SCAN_MAX || 25)
      const delayMs = Number(process.env.TS_CHANNEL_SCAN_DELAY_MS || 200)
      const stopAfterMiss = Number(process.env.TS_CHANNEL_SCAN_MISS || 10)
      const found: RawChannel[] = []
      let miss = 0
      for (let id = 1; id <= maxScan && miss < stopAfterMiss; id++) {
        await sleep(delayMs)
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

    if (channels.length > 0 && !channels.some((ch) => ch.isDefault)) {
      const lobby = channels.find((ch) => ch.id === 1) ?? channels[0]
      if (lobby) lobby.isDefault = true
    }

    // --- clients ---
    await sleep(80)
    try {
      const rawClients = await listClients(c)
      const mapped = rawClients
        .filter((cl) => cl.type === 0 || cl.id === selfId)
        .map(mapClient)
      if (mapped.length > 0) {
        for (const m of mapped) {
          const idx = clients.findIndex((x) => x.id === m.id)
          if (idx >= 0) clients[idx] = { ...clients[idx], ...m }
          else clients.push(m)
        }
      }
    } catch {
      // keep event-driven clients
    }

    // --- self via whoami ---
    await sleep(80)
    try {
      const who = await c.execCommandWithResponse('whoami')
      const row = who[0]
      if (row) {
        if (row.client_id) selfId = toNumber(row.client_id, selfId)
        if (row.client_channel_id) {
          selfChannelId = toNumber(row.client_channel_id, selfChannelId)
        }
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

    // Probe a few clients for channel commander / away / mute flags (optional, rate-limited)
    const probeIds = clients.filter((x) => x.id !== selfId).slice(0, 8).map((x) => x.id)
    if (selfId) probeIds.unshift(selfId)
    for (const id of probeIds) {
      await sleep(80)
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
          if (row.client_away === '1' || row.client_away_message !== undefined && row.client_away === '1') {
            cl.isAway = true
          }
          if (row.client_input_muted === '1' || row.client_input_hardware === '0') {
            cl.isInputMuted = true
            cl.isMuted = true
          }
          if (row.client_output_muted === '1' || row.client_output_hardware === '0') {
            cl.isOutputMuted = true
          }
        }
      } catch {
        // restricted servers
      }
    }

    // Ensure we know at least the channel we are in
    if (selfChannelId > 0 && !channels.some((ch) => ch.id === selfChannelId)) {
      await sleep(80)
      try {
        const rows = await c.execCommandWithResponse(
          `channelinfo cid=${selfChannelId}`,
          3000,
        )
        const row = rows[0]
        if (row?.channel_name) {
          const pid = toNumber(row.pid, 0)
          channels.push({
            id: selfChannelId,
            name: row.channel_name,
            parentId: pid > 0 ? pid : null,
            maxClients: parseMaxClients(row.channel_maxclients),
            isDefault: false,
          })
        }
      } catch {
        // ignore
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
      upsertClient(info)
      emitState()
    })

    c.on('clientLeave', (ev) => {
      removeClient(ev.id)
      emitState()
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
          )
        }
        throw err
      }

      selfId = client.clientID()
      selfChannelId = Number(client.channelID()) || 0

      // Welcome notifications + flood window: give the server a moment
      await sleep(Number(process.env.TS_WELCOME_WAIT_MS || 1500))
      await refreshFromServer(client)
      emitState()

      let serverName = addr
      let welcome = 'Connected via real TeamSpeak 3 protocol'
      try {
        const info = await client.execCommandWithResponse('whoami')
        const row = info[0]
        // whoami is more reliable than serverinfo on restricted servers
        if (row?.virtualserver_name) serverName = row.virtualserver_name
      } catch {
        // optional
      }
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
      await clientMove(client, selfId, BigInt(channelId))
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
      client?.sendVoice(data, codec)
    },

    onVoice(handler: (frame: VoiceFrame) => void) {
      voiceHandlers.add(handler)
      return () => voiceHandlers.delete(handler)
    },
  }
}
