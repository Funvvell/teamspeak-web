/** 纯工具函数与共享常量 —— 无 React 依赖 */
import { DEFAULT_VOICE_PORT } from '../../shared/types'

export const LS_FAV = 'tsweb:favorites'
export const LS_VOL = 'tsweb:volumes'
export const LS_COLLAPSED = 'tsweb:collapsed'
export const LS_RECENT = 'tsweb:recent'
export const LS_AEC = 'tsw.aec'
export const LS_AGC = 'tsw.agc'
export const LS_RNN = 'tsweb:rnnoise'
export const LS_DESKTOP = 'tsweb:desktop-notify'

export const COUNTRY_FLAG: Record<string, string> = {
  CN: '🇨🇳',
  US: '🇺🇸',
  JP: '🇯🇵',
  KR: '🇰🇷',
  DE: '🇩🇪',
  GB: '🇬🇧',
  FR: '🇫🇷',
  TW: '🇹🇼',
  HK: '🇭🇰',
  SG: '🇸🇬',
  RU: '🇷🇺',
  AU: '🇦🇺',
  CA: '🇨🇦',
  BR: '🇧🇷',
}

export function countryFlag(code?: string) {
  if (!code) return null
  return COUNTRY_FLAG[code.toUpperCase()] || null
}

export interface LogItem {
  event: 'join' | 'leave' | 'move' | 'connect' | 'disconnect' | 'poke'
  clientId?: number
  nickname?: string
  channelId?: number
  detail?: string
  ts: number
}

export const LOG_ICON: Record<LogItem['event'], string> = {
  join: '→',
  leave: '←',
  move: '⇢',
  connect: '⚡',
  disconnect: '⛔',
  poke: '👋',
}

export function loadCollapsed(): Set<number> {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_COLLAPSED) || '[]')
    return new Set(Array.isArray(arr) ? arr.map(Number) : [])
  } catch {
    return new Set()
  }
}

export function saveCollapsed(set: Set<number>) {
  localStorage.setItem(LS_COLLAPSED, JSON.stringify([...set]))
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface RecentServer {
  host: string
  port: string
  label: string
  ts: number
}

export function loadRecent(): RecentServer[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_RECENT) || '[]')
    return Array.isArray(arr) ? arr.filter((r) => r && r.host) : []
  } catch {
    return []
  }
}

export function saveRecent(list: RecentServer[]) {
  const seen = new Set<string>()
  const cleaned = list
    .map((r) => {
      const { host, port } = parseHostPort(`${r.host}:${r.port}`)
      return { ...r, host, port, label: host }
    })
    .filter((r) => {
      if (!r.host) return false
      const k = `${r.host}:${r.port}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 3)
  localStorage.setItem(LS_RECENT, JSON.stringify(cleaned))
}

/**
 * Split host:port. Peels repeated trailing `:port` on hostnames so reconnects
 * cannot stack ports. Bare IPv6 (`::1`) only strips one trailing port segment.
 */
export function parseHostPort(v: string): { host: string; port: string } {
  let s = v.trim()
  if (!s) return { host: '', port: String(DEFAULT_VOICE_PORT) }

  if (s.startsWith('[')) {
    const close = s.indexOf(']')
    if (close > 0) {
      const host = s.slice(1, close)
      const rest = s.slice(close + 1)
      const m = rest.match(/^:(\d+)$/)
      return { host, port: m ? m[1] : String(DEFAULT_VOICE_PORT) }
    }
  }

  // Bare IPv6 (contains ':' segments, no dotted quad): peel at most one :port
  if (s.includes(':') && !s.includes('.') && (s.match(/:/g) || []).length >= 2) {
    const idx = s.lastIndexOf(':')
    const n = Number(s.slice(idx + 1))
    if (idx > 0 && Number.isInteger(n) && n > 0 && n < 65536) {
      return { host: s.slice(0, idx), port: String(n) }
    }
    return { host: s, port: String(DEFAULT_VOICE_PORT) }
  }

  let port = String(DEFAULT_VOICE_PORT)
  for (let i = 0; i < 8; i++) {
    const idx = s.lastIndexOf(':')
    if (idx <= 0) break
    const n = Number(s.slice(idx + 1))
    if (Number.isInteger(n) && n > 0 && n < 65536) {
      port = String(n)
      s = s.slice(0, idx).trim()
    } else {
      break
    }
  }
  return { host: s, port }
}

/** Normalize a host string used for identity (strip ports, lowercase). */
export function normalizeHost(host: string): string {
  let s = host.trim().toLowerCase()
  for (let i = 0; i < 8; i++) {
    const idx = s.lastIndexOf(':')
    if (idx <= 0) break
    const n = Number(s.slice(idx + 1))
    if (Number.isInteger(n) && n > 0 && n < 65536) {
      s = s.slice(0, idx).trim()
    } else {
      break
    }
  }
  return s
}

/** System notification for pm/poke when the page is unfocused */
export function desktopNotify(title: string, body: string, enabled: boolean) {
  if (!enabled) return
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification(title, { body })
    } catch {
      /* ignore */
    }
  }
}

/**
 * Per-server per-client volumes, keyed by numeric client id.
 * Legacy data used "id:nickname" keys — migrate them on read.
 */
export function loadVolumes(host: string): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(LS_VOL) || '{}')
    const raw: Record<string, number> = all[host] || {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw)) {
      // Legacy "123:昵称" -> "123"
      const id = k.replace(/:\S*$/, '')
      if (/^\d+$/.test(id)) out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveVolumes(host: string, v: Record<string, number>) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_VOL) || '{}')
    all[host] = v
    localStorage.setItem(LS_VOL, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

