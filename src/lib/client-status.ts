import type { ClientInfo } from '../../shared/types'

export type StatusKind = 'talking' | 'muted' | 'listen' | 'idle'

export function latText(c: ClientInfo): number | string {
  return c.latency != null ? c.latency : '—'
}

export function userStateCls(c: ClientInfo): string {
  if (c.isTalking) return 'talking'
  if (c.isInputMuted || c.isMuted) return 'muted'
  if (c.isOutputMuted) return 'listen'
  return 'idle'
}

export function statusFor(
  c: ClientInfo,
  selfId: number | null,
  uplink: boolean,
): { text: string; kind: StatusKind } {
  if (selfId != null && c.id === selfId && uplink) {
    return { text: '正在说话', kind: 'talking' }
  }
  if (c.isTalking) return { text: '正在说话', kind: 'talking' }
  if (c.isInputMuted) return { text: `已静音 · ${latText(c)} ms`, kind: 'muted' }
  if (c.isOutputMuted) return { text: `仅收听 · ${latText(c)} ms`, kind: 'listen' }
  return { text: `在线 · ${latText(c)} ms`, kind: 'idle' }
}
