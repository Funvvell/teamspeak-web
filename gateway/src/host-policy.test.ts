import { describe, it, expect } from 'vitest'
import { assertHostAllowed, isPrivateOrLocalHost } from './session'

const open = { allowPrivate: false, allowlist: [] as string[] }
const allowPrivate = { allowPrivate: true, allowlist: [] as string[] }
const allowlist = (list: string[]) => ({ allowPrivate: false, allowlist: list })

describe('isPrivateOrLocalHost', () => {
  it('treats loopback / RFC1918 / link-local as private', () => {
    expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalHost('10.1.2.3')).toBe(true)
    expect(isPrivateOrLocalHost('172.16.0.1')).toBe(true)
    expect(isPrivateOrLocalHost('172.31.255.255')).toBe(true)
    expect(isPrivateOrLocalHost('192.168.1.1')).toBe(true)
    expect(isPrivateOrLocalHost('169.254.1.1')).toBe(true)
    expect(isPrivateOrLocalHost('0.0.0.0')).toBe(true)
    expect(isPrivateOrLocalHost('localhost')).toBe(true)
  })

  it('treats public IPv4 as non-private', () => {
    expect(isPrivateOrLocalHost('8.8.8.8')).toBe(false)
    expect(isPrivateOrLocalHost('172.32.0.1')).toBe(false)
    expect(isPrivateOrLocalHost('1.1.1.1')).toBe(false)
  })

  it('blocks IPv6 loopback full form and ULA/link-local', () => {
    expect(isPrivateOrLocalHost('::1')).toBe(true)
    expect(isPrivateOrLocalHost('0:0:0:0:0:0:0:1')).toBe(true)
    expect(isPrivateOrLocalHost('fd00::1')).toBe(true)
    expect(isPrivateOrLocalHost('fe80::1')).toBe(true)
    expect(isPrivateOrLocalHost('::')).toBe(true)
  })

  it('blocks IPv4-mapped IPv6 private addresses', () => {
    expect(isPrivateOrLocalHost('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalHost('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateOrLocalHost('::ffff:192.168.0.1')).toBe(true)
    expect(isPrivateOrLocalHost('::ffff:7f00:1')).toBe(true)
  })

  it('does not treat public IPv6 / mapped public IPv4 as private', () => {
    expect(isPrivateOrLocalHost('2001:4860:4860::8888')).toBe(false)
    expect(isPrivateOrLocalHost('::ffff:8.8.8.8')).toBe(false)
  })
})

describe('assertHostAllowed', () => {
  it('always rejects cloud metadata', () => {
    expect(() => assertHostAllowed('169.254.169.254', allowPrivate)).toThrow(/元数据/)
    expect(() =>
      assertHostAllowed('169.254.169.254', allowlist(['169.254.169.254'])),
    ).toThrow(/元数据/)
  })

  it('rejects private hosts when policy forbids', () => {
    expect(() => assertHostAllowed('127.0.0.1', open)).toThrow(/私网/)
    expect(() => assertHostAllowed('::ffff:10.0.0.1', open)).toThrow(/私网/)
  })

  it('allows private hosts when allowPrivate', () => {
    expect(() => assertHostAllowed('192.168.1.10', allowPrivate)).not.toThrow()
  })

  it('enforces allowlist including wildcards', () => {
    const p = allowlist(['ts.example.com', '*.corp.example'])
    expect(() => assertHostAllowed('ts.example.com', p)).not.toThrow()
    expect(() => assertHostAllowed('a.corp.example', p)).not.toThrow()
    expect(() => assertHostAllowed('evil.example', p)).toThrow(/白名单/)
  })

  it('rejects empty host', () => {
    expect(() => assertHostAllowed('  ', open)).toThrow(/不能为空/)
  })
})
