export interface ChannelNode {
  id: number
  name: string
  parentId: number | null
  maxClients: number
  isDefault: boolean
  /** Server channel_order for sibling sort; lower first */
  order?: number
  clients: ClientInfo[]
  topic?: string
  description?: string
  codec?: number
  codecQuality?: number
  neededTalkPower?: number
  isPasswordProtected?: boolean
  isPermanent?: boolean
}

export interface ClientInfo {
  id: number
  nickname: string
  channelId: number
  isTalking: boolean
  isMuted: boolean
  isCommander?: boolean
  isAway?: boolean
  isInputMuted?: boolean
  isOutputMuted?: boolean
  /** ISO country code when the server provides it */
  country?: string
  /** Round-trip latency in ms when the server provides it */
  latency?: number
  /** Packet loss ratio 0–1 when available */
  packetLoss?: number
  /** 3D bearing in degrees 0–359 when available */
  positionDeg?: number
  isPrioritySpeaker?: boolean
  groupIds?: number[]
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export type WhisperTarget =
  | { kind: 'client'; id: number }
  | { kind: 'channel'; id: number }

export type MessageTarget =
  | 'channel'
  | 'server'
  | { client: number }

export type PermChange =
  | { key: string; enabled: boolean }
  | { key: string; value: number | string }

export type ChannelPatch = Partial<{
  name: string
  topic: string
  description: string
  maxClients: number
  permanent: boolean
  codec: number
  codecQuality: number
  /** null clears password */
  password: string | null
}>

export interface SecurityTier {
  id: string
  name: string
  gid: number
  talkPower: number
  icon: 'shield' | 'person' | 'badge' | 'token' | 'mic' | 'group'
}

export interface PermItem {
  key: string
  desc: string
  valueLabel: string
  enabled: boolean
  editable: boolean
}

export interface PermGroupNode {
  id: 'global' | 'channel' | 'talk'
  title: string
  items: PermItem[]
}

export interface ChannelInspector {
  channelId: number
  name: string
  topic: string
  description: string
  maxClients: number
  permanent: boolean
  semiPermanent: boolean
  temporary: boolean
  codecQuality: number
  passwordEnabled: boolean
}

export type AuditTag =
  | 'perm_edit'
  | 'chan_mod'
  | 'access_deny'
  | 'whisper_sync'
  | 'sq_connect'

export interface AuditEntry {
  ts: number
  tag: AuditTag
  detail: string
  status: 'ok' | 'warn' | 'err'
  statusText: string
}

export interface PermissionSnapshot {
  tiers: SecurityTier[]
  tree: PermGroupNode[]
  inspector: ChannelInspector
  audit: AuditEntry[]
}

export interface Bookmark {
  id: string
  name: string
  host: string
  port: number
  nickname?: string
  note?: string
  autoJoin?: boolean
  gameTag?: string
}

export interface RecentEntry {
  host: string
  port: number
  nickname?: string
  ts: number
}

export interface CatalogPayload {
  bookmarks: Bookmark[]
  recent: RecentEntry[]
}

export type ClientToGateway =
  | {
      type: 'connect'
      host: string
      port: number
      nickname: string
      password?: string
    }
  | { type: 'disconnect' }
  | { type: 'join_channel'; channelId: number }
  | {
      type: 'send_message'
      target: MessageTarget
      text: string
    }
  | { type: 'mic'; enabled: boolean }
  | { type: 'whisper_add'; target: WhisperTarget }
  | { type: 'whisper_clear' }
  | { type: 'poke'; targetId: number; message?: string }
  | {
      type: 'serverquery_connect'
      host: string
      queryPort: number
      username: string
      password: string
      serverId?: number
    }
  | { type: 'serverquery_disconnect' }
  | { type: 'permission_snapshot'; channelId?: number }
  | {
      type: 'permission_apply'
      tierId: string
      changes: PermChange[]
    }
  | { type: 'channel_update'; channelId: number; patch: ChannelPatch }
  | { type: 'catalog_list' }
  | {
      type: 'catalog_add_bookmark'
      name: string
      host: string
      port: number
      nickname?: string
      gameTag?: string
    }
  | { type: 'catalog_remove_bookmark'; id: string }
  | {
      type: 'whisper_sync'
      clients: number[]
      channels: number[]
    }

export type LogEventKind =
  | 'join'
  | 'leave'
  | 'move'
  | 'connect'
  | 'disconnect'
  | 'poke'

export type GatewayToClient =
  | {
      type: 'status'
      state: ConnectionState
      message?: string
    }
  | {
      type: 'server_info'
      name: string
      welcome: string
      selfId: number
    }
  | { type: 'channel_tree'; channels: ChannelNode[] }
  | { type: 'client_list'; clients: ClientInfo[] }
  | {
      type: 'message'
      from: string
      fromId: number
      target: string
      text: string
      ts: number
      whisper?: boolean
    }
  | {
      type: 'event_log'
      event: LogEventKind
      clientId?: number
      nickname?: string
      channelId?: number
      detail?: string
      ts: number
    }
  | { type: 'error'; code: string; message: string }
  | {
      type: 'serverquery_status'
      connected: boolean
      serverVersion?: string
      error?: string
    }
  | { type: 'permission_snapshot'; snapshot: PermissionSnapshot }
  | {
      type: 'permission_apply_ok'
      tierId: string
      applied: number
    }
  | {
      type: 'catalog'
      catalog: CatalogPayload
    }

export const DEFAULT_VOICE_PORT = 9987
export const DEFAULT_QUERY_PORT = 10011

/** Canonical permission keys mirrored by the tactical permissions UI. */
export const PERMISSION_KEY_WHITELIST = [
  'b_client_kick_from_server',
  'b_client_ban_create',
  'b_client_remoteaddress_view',
  'b_channel_create_permanent',
  'b_channel_delete_flag_force',
  'i_channel_maxclients',
  'i_channel_create_modify_codec_max_quality',
  'i_client_talk_power',
  'i_client_grant_talk_power',
  'b_client_is_priority_speaker',
  'b_client_whisper_list_target',
] as const

export type PermissionKey = (typeof PERMISSION_KEY_WHITELIST)[number]
