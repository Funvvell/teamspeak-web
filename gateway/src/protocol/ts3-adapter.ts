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
  noopLogger,
  type Identity,
  type ClientInfo as TsClientInfo,
  type VoiceData,
} from '@honeybbq/teamspeak-client'
import type {
  ChannelNode,
  ClientInfo,
  GatewayToClient,
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
  try {
    if (fs.existsSync(IDENTITY_PATH)) {
      return identityFromString(fs.readFileSync(IDENTITY_PATH, 'utf8').trim())
    }
  } catch {
    // fall through to generate
  }
  // Level 8 is widely required; upgrade is CPU-bound once and cached on disk.
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
    const rawChannels = await c.execCommandWithResponse('channellist -flags')
    const rawClients = await listClients(c)

    // Field names from TS3 channellist: cid, cpid, channel_name, channel_maxclients
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

    if (channels.length > 0 && !channels.some((ch) => ch.isDefault)) {
      const lobby = channels.find((ch) => ch.id === 1) ?? channels[0]
      if (lobby) lobby.isDefault = true
    }

    clients = rawClients
      .filter((cl) => cl.type === 0 || cl.id === selfId) // skip server queries
      .map(mapClient)

    if (selfId) {
      const me = rawClients.find((cl) => cl.id === selfId)
      if (me) selfChannelId = Number(me.channelID)
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
      const addr = formatAddr(host.trim(), port || 9987)

      client = new Client(identity, addr, nickname, {
        logger: noopLogger,
        serverPassword: password || undefined,
      })
      wireEvents(client)

      await client.connect()
      // High security levels may require wait; 20s covers RSA puzzle + upgrade
      await client.waitConnected(AbortSignal.timeout(20_000))

      selfId = client.clientID()
      selfChannelId = Number(client.channelID())

      await refreshFromServer(client)
      emitState()

      let serverName = addr
      let welcome = 'Connected via real TeamSpeak 3 protocol'
      try {
        const info = await client.execCommandWithResponse('serverinfo')
        const row = info[0]
        if (row?.virtualserver_name) serverName = row.virtualserver_name
        if (row?.virtualserver_welcomemessage) {
          welcome = row.virtualserver_welcomemessage.replace(/\\s/g, ' ')
        }
      } catch {
        // optional
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

    async sendText(target, text) {
      if (!client) throw new Error('Not connected')
      if (target === 'channel') {
        await sendTextMessage(client, 2, BigInt(selfChannelId), text)
      } else if (target === 'server') {
        await sendTextMessage(client, 3, BigInt(0), text)
      } else {
        await sendTextMessage(client, 1, BigInt(target.client), text)
      }
    },

    getChannelTree: () => rebuildTree(),
    getClients: () => clients,

    sendVoice(data, codec = 4) {
      client?.sendVoice(data, codec)
    },

    onVoice(handler) {
      voiceHandlers.add(handler)
      return () => voiceHandlers.delete(handler)
    },
  }
}
