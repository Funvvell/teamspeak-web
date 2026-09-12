/** 纯工具函数与共享常量 —— 无 React 依赖 */
import { DEFAULT_VOICE_PORT } from '../../shared/types'

export const LS_FAV = 'tsweb:favorites'
export const LS_VOL = 'tsweb:volumes'
export const LS_COLLAPSED = 'tsweb:collapsed'
export const LS_RECENT = 'tsweb:recent'
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
  localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, 5)))
}

export function parseHostPort(v: string): { host: string; port: string } {
  const s = v.trim()
  if (!s) return { host: '', port: String(DEFAULT_VOICE_PORT) }
  if (s.includes(':')) {
    const i = s.lastIndexOf(':')
    const h = s.slice(0, i).trim()
    const p = Number(s.slice(i + 1))
    if (h && Number.isFinite(p) && p > 0 && p < 65536) {
      return { host: h, port: String(p) }
    }
    return { host: s, port: String(DEFAULT_VOICE_PORT) }
  }
  return { host: s, port: String(DEFAULT_VOICE_PORT) }
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

