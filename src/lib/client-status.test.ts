import { describe, it, expect } from 'vitest'
import { latText, statusFor, userStateCls } from './client-status'
import type { ClientInfo } from '../../shared/types'

function client(partial: Partial<ClientInfo> = {}): ClientInfo {
  return {
    id: 1,
    nickname: 'a',
    channelId: 1,
    isTalking: false,
    isMuted: false,
    ...partial,
  }
}

describe('client-status', () => {
  it('latText falls back to em dash', () => {
    expect(latText(client())).toBe('—')
    expect(latText(client({ latency: 42 }))).toBe(42)
  })

  it('userStateCls priority talking > muted > listen > idle', () => {
    expect(userStateCls(client({ isTalking: true, isInputMuted: true }))).toBe('talking')
    expect(userStateCls(client({ isInputMuted: true }))).toBe('muted')
    expect(userStateCls(client({ isOutputMuted: true }))).toBe('listen')
    expect(userStateCls(client())).toBe('idle')
  })

  it('statusFor includes latency in muted/idle text', () => {
    const s = statusFor(client({ isInputMuted: true, latency: 12 }), 99, false)
    expect(s.kind).toBe('muted')
    expect(s.text).toContain('12')
  })
})
