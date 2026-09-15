import net from 'node:net'
import type {
  AuditEntry,
  ChannelInspector,
  ChannelNode,
  ChannelPatch,
  PermChange,
  PermGroupNode,
  PermItem,
  PermissionSnapshot,
  SecurityTier,
} from '../../shared/types'

export interface ServerQueryPort {
  connect(opts: {
    host: string
    queryPort: number
    username: string
    password: string
    serverId?: number
  }): Promise<{ serverVersion: string }>
  disconnect(): Promise<void>
  isConnected(): boolean
  getSnapshot(channels: ChannelNode[]): Promise<PermissionSnapshot>
  applyTierChanges(tierId: string, changes: PermChange[]): Promise<number>
  updateChannel(channelId: number, patch: ChannelPatch): Promise<void>
  pushAudit(entry: Omit<AuditEntry, 'ts'> & { ts?: number }): void
}

export const PERMISSION_KEYS = {
  global: [
    'b_client_kick_from_server',
    'b_client_ban_create',
    'b_client_remoteaddress_view',
  ],
  channel: [
    'b_channel_create_permanent',
    'b_channel_delete_flag_force',
    'i_channel_maxclients',
    'i_channel_create_modify_codec_max_quality',
  ],
  talk: [
    'i_client_talk_power',
    'i_client_grant_talk_power',
    'b_client_is_priority_speaker',
    'b_client_whisper_list_target',
  ],
} as const

const PERM_DESC: Record<string, string> = {
  b_client_kick_from_server: '允许踢出低层级连接',
  b_client_ban_create: '创建持久硬件/IP 封禁哈希',
  b_client_remoteaddress_view: '查看原始 WAN IPv4/IPv6 节点',
  b_channel_create_permanent: '创建持久磁盘存储频道',
  b_channel_delete_flag_force: '强制删除非空频道节点',
  i_channel_maxclients: '频道容量上限覆盖',
  i_channel_create_modify_codec_max_quality: 'Opus 超宽带（最高 128 kbps）',
  i_client_talk_power: '自然传输优先级',
  i_client_grant_talk_power: '向被静音者授予临时发言权',
  b_client_is_priority_speaker: '将背景语音压低约 -20dB',
  b_client_whisper_list_target: '跨频道广播注入',
}

const TIERS: SecurityTier[] = [
  { id: '100', name: '服务器管理员', gid: 100, talkPower: 100, icon: 'shield' },
  { id: '201', name: '普通成员', gid: 201, talkPower: 40, icon: 'person' },
  { id: '305', name: '频道管理员', gid: 305, talkPower: 75, icon: 'badge' },
  { id: '402', name: '操作员', gid: 402, talkPower: 60, icon: 'token' },
  { id: '508', name: '语音 / 已验证', gid: 508, talkPower: 50, icon: 'mic' },
  { id: '999', name: '访客', gid: 999, talkPower: 0, icon: 'group' },
]

function escapeTs(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\//g, '\\/')
    .replace(/\p/g, '\\p')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/ /g, '\\s')
}

function unescapeTs(v: string): string {
  return v.replace(/\\([\\|/pnrt\s])/g, (_, c: string) => (c === 's' ? ' ' : c))
}

function parseLine(line: string): Record<string, string> {
  const out: Record<string, string> = {}
  const parts = line.match(/(?:\\.|[^\s])+/g) ?? []
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq <= 0) continue
    out[p.slice(0, eq)] = unescapeTs(p.slice(eq + 1))
  }
  return out
}

function mockValueFor(key: string, tierGid: number): string {
  const scale =
    tierGid <= 100 ? 100 : tierGid <= 305 ? 75 : tierGid <= 402 ? 50 : 0
  if (key.startsWith('b_')) return scale >= 40 ? '1' : '0'
  if (key === 'i_channel_maxclients') return scale >= 75 ? '-1' : '50'
  if (key === 'i_channel_create_modify_codec_max_quality') {
    return scale >= 75 ? '128' : '64'
  }
  return String(Math.min(scale, 100))
}

function labelFor(key: string, raw: string): string {
  if (key === 'i_channel_maxclients') return raw === '-1' ? '无限制' : raw
  if (key === 'i_channel_create_modify_codec_max_quality') return `${raw} KBPS`
  if (key === 'i_client_talk_power' || key === 'i_client_grant_talk_power') {
    return `${raw} 权限`
  }
  if (
    key === 'b_client_is_priority_speaker' ||
    key === 'b_client_whisper_list_target'
  ) {
    return raw === '1' ? '激活' : '关闭'
  }
  if (key.startsWith('b_')) return raw === '1' ? 'i_val: 100' : 'i_val: 0'
  return raw
}

function itemFor(key: string, raw: string): PermItem {
  const isBool = key.startsWith('b_')
  const enabled = isBool ? raw === '1' : raw !== '0' && raw !== ''
  return {
    key,
    desc: PERM_DESC[key] ?? key,
    valueLabel: labelFor(key, raw),
    enabled,
    editable: true,
  }
}

function buildTree(
  state: Map<string, string>,
  tiers: SecurityTier[],
): PermGroupNode[] {
  void tiers
  const get = (key: string) => state.get(key) ?? mockValueFor(key, 100)
  return [
    {
      id: 'global',
      title: '全局 / 管理',
      items: PERMISSION_KEYS.global.map((k) => itemFor(k, get(k))),
    },
    {
      id: 'channel',
      title: '频道管理',
      items: PERMISSION_KEYS.channel.map((k) => itemFor(k, get(k))),
    },
    {
      id: 'talk',
      title: '说话权限与语音',
      items: PERMISSION_KEYS.talk.map((k) => itemFor(k, get(k))),
    },
  ]
}

function buildInspector(
  ch: ChannelNode | undefined,
  fallbackId: number,
): ChannelInspector {
  const maxClients = ch?.maxClients ?? 0
  const permanent = ch?.isPermanent ?? true
  return {
    channelId: ch?.id ?? fallbackId,
    name: ch?.name ?? '未选择频道',
    topic: ch?.topic ?? '',
    description: ch?.description ?? '',
    maxClients: maxClients || 0,
    permanent,
    semiPermanent: false,
    temporary: !permanent,
    codecQuality: ch?.codecQuality ?? 6,
    passwordEnabled: Boolean(ch?.isPasswordProtected),
  }
}

export function createMockServerQuery(): ServerQueryPort {
  let connected = false
  const audit: AuditEntry[] = []
  const state = new Map<string, Map<string, string>>()
  const channelOverrides = new Map<number, Partial<ChannelNode>>()
  const port: ServerQueryPort = {
    async connect() {
      connected = true
      port.pushAudit({
        tag: 'sq_connect',
        detail: 'Mock ServerQuery 已连接',
        status: 'ok',
        statusText: 'OK',
      })
      return { serverVersion: '3.13.7-mock' }
    },
    async disconnect() {
      connected = false
    },
    isConnected() {
      return connected
    },
    pushAudit(entry) {
      audit.unshift({
        ts: entry.ts ?? Date.now(),
        tag: entry.tag,
        detail: entry.detail,
        status: entry.status,
        statusText: entry.statusText,
      })
      if (audit.length > 50) audit.length = 50
    },
    async getSnapshot(channels: ChannelNode[]) {
      if (!state.has('100')) {
        for (const t of TIERS) {
          const m = new Map<string, string>()
          for (const key of [
            ...PERMISSION_KEYS.global,
            ...PERMISSION_KEYS.channel,
            ...PERMISSION_KEYS.talk,
          ]) {
            m.set(key, mockValueFor(key, t.gid))
          }
          state.set(t.id, m)
        }
      }
      const active = state.get('100') ?? new Map<string, string>()
      const merged: ChannelNode[] = channels.map((c) => {
        const ov = channelOverrides.get(c.id)
        return ov ? { ...c, ...ov } : c
      })
      const ch = merged[0]
      return {
        tiers: TIERS,
        tree: buildTree(active, TIERS),
        inspector: buildInspector(ch, ch?.id ?? 1),
        audit: audit.slice(0, 20),
      }
    },
    async applyTierChanges(tierId, changes) {
      if (!connected) throw new Error('ServerQuery 未连接')
      const m = state.get(tierId) ?? new Map<string, string>()
      let n = 0
      for (const c of changes) {
        if ('enabled' in c) m.set(c.key, c.enabled ? '1' : '0')
        else m.set(c.key, String(c.value))
        n++
      }
      state.set(tierId, m)
      port.pushAudit({
        tag: 'perm_edit',
        detail: `Mock 应用 ${n} 项权限到组 ${tierId}`,
        status: 'ok',
        statusText: `SUCCESS (${n})`,
      })
      return n
    },
    async updateChannel(channelId, patch) {
      if (!connected) throw new Error('ServerQuery 未连接')
      const prev = channelOverrides.get(channelId) ?? {}
      const next: Partial<ChannelNode> = { ...prev }
      if (patch.name !== undefined) next.name = patch.name
      if (patch.topic !== undefined) next.topic = patch.topic
      if (patch.description !== undefined) next.description = patch.description
      if (patch.maxClients !== undefined) next.maxClients = patch.maxClients
      if (patch.permanent !== undefined) next.isPermanent = patch.permanent
      if (patch.codecQuality !== undefined) next.codecQuality = patch.codecQuality
      if (patch.password !== undefined) {
        next.isPasswordProtected = Boolean(patch.password)
      }
      channelOverrides.set(channelId, next)
      port.pushAudit({
        tag: 'chan_mod',
        detail: `Mock 更新频道 CID ${channelId}`,
        status: 'ok',
        statusText: 'COMMITTED',
      })
    },
  }
  return port
}

function createTcpServerQuery(log = console.log): ServerQueryPort {
  let socket: net.Socket | null = null
  let buffer = ''
  let connected = false
  const audit: AuditEntry[] = []
  let respBuf: string[] = []
  let pending: {
    resolve: (lines: string[]) => void
    reject: (err: Error) => void
  } | null = null

  const port: ServerQueryPort = {
    async connect({ host, queryPort, username, password, serverId = 0 }) {
      await new Promise<void>((resolve) => {
        socket = net.createConnection({ host, port: queryPort }, () => resolve())
        const s = socket!
        s.setEncoding('utf8')
        s.on('error', (err) => {
          connected = false
          if (pending) {
            const p = pending
            pending = null
            p.reject(err)
          }
        })
        s.on('data', (chunk: string) => {
          buffer += chunk
          let idx: number
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).replace(/\r$/, '')
            buffer = buffer.slice(idx + 1)
            if (line.startsWith('TS3')) continue
            if (line.startsWith('error id=')) {
              const id = Number(/id=(\d+)/.exec(line)?.[1] ?? '0')
              const lines = respBuf
              respBuf = []
              if (pending) {
                const p = pending
                pending = null
                if (id === 0) p.resolve(lines)
                else p.reject(new Error(`ServerQuery error id=${id}: ${line}`))
              }
              continue
            }
            if (pending) respBuf.push(line)
          }
        })
        s.on('close', () => {
          connected = false
        })
      })

      const send = (cmd: string, timeoutMs = 8000): Promise<string[]> => {
        if (!socket || !connected) {
          // allow login before connected=true
          if (!socket) return Promise.reject(new Error('ServerQuery 未连接'))
        }
        if (pending) return Promise.reject(new Error('ServerQuery 忙碌'))
        respBuf = []
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending = null
            reject(new Error(`ServerQuery 超时: ${cmd}`))
          }, timeoutMs)
          pending = {
            resolve: (lines) => {
              clearTimeout(timer)
              resolve(lines)
            },
            reject: (err) => {
              clearTimeout(timer)
              reject(err)
            },
          }
          log(`[sq] > ${cmd}`)
          socket!.write(cmd + '\n')
        })
      }

      await send(
        `login client_login_name=${escapeTs(username)} client_login_password=${escapeTs(password)}`,
      )
      if (serverId !== 0) await send(`use sid=${serverId}`)
      const info = await send('serverinfo')
      const parsed = parseLine(info[0] ?? '')
      const serverVersion =
        parsed.virtualserver_version || parsed.version || 'unknown'
      connected = true
      port.pushAudit({
        tag: 'sq_connect',
        detail: `ServerQuery 已连接 ${host}:${queryPort}`,
        status: 'ok',
        statusText: 'OK',
      })
      return { serverVersion }
    },
    async disconnect() {
      try {
        if (connected && socket) socket.write('quit\n')
      } catch {
        /* ignore */
      }
      socket?.destroy()
      socket = null
      connected = false
    },
    isConnected() {
      return connected
    },
    pushAudit(entry) {
      audit.unshift({
        ts: entry.ts ?? Date.now(),
        tag: entry.tag,
        detail: entry.detail,
        status: entry.status,
        statusText: entry.statusText,
      })
      if (audit.length > 50) audit.length = 50
    },
    async getSnapshot(channels: ChannelNode[]) {
      if (!connected) throw new Error('ServerQuery 未连接')
      const send = async (cmd: string) => {
        // reuse connect-time send via a private helper stored on socket write
        // simplified: throw if we cannot issue — store sendFn
        return sendRef!(cmd)
      }
      const allKeys = [
        ...PERMISSION_KEYS.global,
        ...PERMISSION_KEYS.channel,
        ...PERMISSION_KEYS.talk,
      ]
      const values = new Map<string, string>()
      for (const key of allKeys) {
        try {
          const lines = await send(`permget permname=${key}`)
          values.set(key, parseLine(lines[0] ?? '').permvalue ?? '0')
        } catch {
          values.set(key, key.startsWith('b_') ? '0' : '0')
        }
      }
      let tiers = TIERS
      try {
        const lines = await send('servergrouplist')
        const parsedTiers: SecurityTier[] = []
        for (const line of lines) {
          const p = parseLine(line)
          const gid = Number(p.sgid)
          if (!Number.isFinite(gid) || !gid) continue
          parsedTiers.push({
            id: String(gid),
            name: p.name || `Group ${gid}`,
            gid,
            talkPower: Number(p.negotiated_subscribe_power || 0),
            icon: gid <= 10 ? 'shield' : gid <= 100 ? 'person' : 'group',
          })
        }
        if (parsedTiers.length) tiers = parsedTiers
      } catch {
        /* defaults */
      }
      const ch = channels[0]
      let inspector = buildInspector(ch, ch?.id ?? 1)
      if (ch) {
        try {
          const lines = await send(`channelinfo cid=${ch.id}`)
          const info = parseLine(lines[0] ?? '')
          inspector = {
            channelId: ch.id,
            name: info.channel_name || ch.name,
            topic: info.channel_topic || '',
            description: info.channel_description || '',
            maxClients:
              Number(info.channel_maxclients) < 0
                ? 0
                : Number(info.channel_maxclients || ch.maxClients || 0),
            permanent: info.channel_flag_permanent === '1',
            semiPermanent: info.channel_flag_semi_permanent === '1',
            temporary: info.channel_flag_temporary === '1',
            codecQuality: Number(info.channel_codec_quality || 6),
            passwordEnabled: Boolean(info.channel_password),
          }
        } catch {
          /* fallback */
        }
      }
      return {
        tiers,
        tree: buildTree(values, TIERS),
        inspector,
        audit: audit.slice(0, 20),
      }
    },
    async applyTierChanges(tierId, changes) {
      if (!connected) throw new Error('ServerQuery 未连接')
      let n = 0
      for (const c of changes) {
        if ('enabled' in c) {
          await sendRef!(
            `set client permname=${c.key} permvalue=${c.enabled ? 1 : 0} permsid=0`,
          ).catch(async () => {
            await sendRef!(
              `permadd permname=${c.key} permvalue=${c.enabled ? 1 : 0}`,
            )
          })
        } else {
          const val =
            typeof c.value === 'number' ? c.value : escapeTs(String(c.value))
          await sendRef!(
            `set client permname=${c.key} permvalue=${val} permsid=0`,
          )
        }
        n++
      }
      port.pushAudit({
        tag: 'perm_edit',
        detail: `应用 ${n} 项权限变更到组 ${tierId}`,
        status: 'ok',
        statusText: `SUCCESS (${n})`,
      })
      return n
    },
    async updateChannel(channelId, patch) {
      if (!connected) throw new Error('ServerQuery 未连接')
      const parts: string[] = [`cid=${channelId}`]
      if (patch.name !== undefined) parts.push(`channel_name=${escapeTs(patch.name)}`)
      if (patch.topic !== undefined) parts.push(`channel_topic=${escapeTs(patch.topic)}`)
      if (patch.description !== undefined) {
        parts.push(`channel_description=${escapeTs(patch.description)}`)
      }
      if (patch.maxClients !== undefined) {
        parts.push(`channel_maxclients=${patch.maxClients || -1}`)
      }
      if (patch.permanent !== undefined) {
        parts.push(`channel_flag_permanent=${patch.permanent ? 1 : 0}`)
      }
      if (patch.codecQuality !== undefined) {
        parts.push(`channel_codec_quality=${patch.codecQuality}`)
      }
      await sendRef!(`channelupdate ${parts.join(' ')}`)
      port.pushAudit({
        tag: 'chan_mod',
        detail: `更新频道 CID ${channelId}`,
        status: 'ok',
        statusText: 'COMMITTED',
      })
    },
  }

  // attach send helper after connect builds it
  let sendRef: ((cmd: string) => Promise<string[]>) | null = null
  const baseConnect = port.connect.bind(port)
  port.connect = async (opts) => {
    const result = await baseConnect(opts)
    const s = socket
    sendRef = (cmd: string, timeoutMs = 8000) => {
      if (!s || s.destroyed) return Promise.reject(new Error('ServerQuery 未连接'))
      if (pending) return Promise.reject(new Error('ServerQuery 忙碌'))
      respBuf = []
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending = null
          reject(new Error(`ServerQuery 超时: ${cmd}`))
        }, timeoutMs)
        pending = {
          resolve: (lines) => {
            clearTimeout(timer)
            resolve(lines)
          },
          reject: (err) => {
            clearTimeout(timer)
            reject(err)
          },
        }
        s.write(cmd + '\n')
      })
    }
    return result
  }
  return port
}

export function createDisabledServerQuery(): ServerQueryPort {
  return {
    async connect() {
      throw new Error(
        '未配置 SQ_USERNAME/SQ_PASSWORD，ServerQuery 管理功能不可用',
      )
    },
    async disconnect() {},
    isConnected() {
      return false
    },
    async getSnapshot(channels) {
      return {
        tiers: TIERS,
        tree: buildTree(new Map(), TIERS),
        inspector: buildInspector(channels[0], channels[0]?.id ?? 1),
        audit: [],
      }
    },
    async applyTierChanges() {
      throw new Error('ServerQuery 未配置')
    },
    async updateChannel() {
      throw new Error('ServerQuery 未配置')
    },
    pushAudit() {},
  }
}

export function createServerQueryFromEnv(
  log: (msg: string) => void = console.log,
): ServerQueryPort {
  if ((process.env.PROTOCOL || 'ts3').toLowerCase() === 'mock') {
    return createMockServerQuery()
  }
  if (process.env.PERMISSIONS_ENABLED === '0') {
    return createDisabledServerQuery()
  }
  if (!process.env.SQ_USERNAME || !process.env.SQ_PASSWORD) {
    return createDisabledServerQuery()
  }
  return createTcpServerQuery(log)
}
