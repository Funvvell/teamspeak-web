import { describe, it, expect } from 'vitest'
import { MAX_RECONNECT_ATTEMPTS, reconnectDelayMs } from './reconnect'

describe('reconnectDelayMs', () => {
  it('exponential backoff capped at 8s', () => {
    expect(reconnectDelayMs(1)).toBe(1000)
    expect(reconnectDelayMs(2)).toBe(2000)
    expect(reconnectDelayMs(3)).toBe(4000)
    expect(reconnectDelayMs(4)).toBe(8000)
    expect(reconnectDelayMs(5)).toBe(8000)
  })

  it('guards non-positive attempt', () => {
    expect(reconnectDelayMs(0)).toBe(1000)
  })

  it('exports attempt cap', () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(5)
  })
})
