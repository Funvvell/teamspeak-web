import { describe, it, expect, vi } from 'vitest'
import { Session } from './session'
import type { GatewayToClient } from '../../shared/types'
import type { TsProtocolAdapter } from './protocol/adapter'

/** Minimal WebSocket stand-in — Session only uses readyState/OPEN/send */
function makeWs() {
  const sent: string[] = []
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (data: string) => {
      sent.push(data)
    },
  }
  return { ws, sent, messages: () => sent.map((s) => JSON.parse(s) as GatewayToClient) }
}

function makeAdapter(): TsProtocolAdapter {
  return {
    connect: vi.fn(async () => ({ name: 'mock', welcome: '', selfId: 1 })),
    disconnect: vi.fn(async () => {}),
    joinChannel: vi.fn(async () => {}),
    sendText: vi.fn(),
    sendVoice: vi.fn(),
    getChannelTree: () => [],
    getClients: () => [],
  }
}

describe('Session.handleRaw JSON path', () => {
  it('invalid JSON emits bad_json error', () => {
    const { ws, messages } = makeWs()
    const session = new Session(ws as never, () => makeAdapter())
    session.handleRaw('{not json')
    const msgs = messages()
    expect(msgs[0]).toEqual({
      type: 'error',
      code: 'bad_json',
      message: 'Invalid JSON',
    })
  })

  it('unknown message type emits unknown error', async () => {
    const { ws, messages } = makeWs()
    const session = new Session(ws as never, () => makeAdapter())
    session.handleRaw(JSON.stringify({ type: 'not_a_real_type' }))
    await new Promise((r) => setTimeout(r, 0))
    const msgs = messages()
    expect(msgs.some((m) => m.type === 'error' && m.code === 'unknown')).toBe(true)
  })

  it('mic on/off emits connected status', async () => {
    const { ws, messages } = makeWs()
    const session = new Session(ws as never, () => makeAdapter())
    session.handleRaw(JSON.stringify({ type: 'mic', enabled: true }))
    await new Promise((r) => setTimeout(r, 0))
    const msgs = messages()
    expect(
      msgs.some((m) => m.type === 'status' && m.state === 'connected' && m.message === 'Mic on'),
    ).toBe(true)
  })
})

describe('Session.handleRaw binary voice frames', () => {
  function sessionWithAdapter() {
    const { ws } = makeWs()
    const adapter = makeAdapter()
    const session = new Session(ws as never, () => adapter)
    ;(session as unknown as { adapter: TsProtocolAdapter }).adapter = adapter
    return { session, adapter }
  }

  it('always strips 2-byte uplink header before sendVoice', () => {
    const { session, adapter } = sessionWithAdapter()
    // [opcode=1][codec=4][opus 0x11 0x22 0x33 0x44]
    session.handleRaw(Buffer.from([1, 4, 0x11, 0x22, 0x33, 0x44]))
    expect(adapter.sendVoice).toHaveBeenCalledTimes(1)
    const [data, codec] = (adapter.sendVoice as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(codec).toBe(4)
    expect([...data]).toEqual([0x11, 0x22, 0x33, 0x44])
  })

  it('strips 2-byte header for short opus payloads', () => {
    const { session, adapter } = sessionWithAdapter()
    session.handleRaw(Buffer.from([1, 4, 0x11, 0x22]))
    expect(adapter.sendVoice).toHaveBeenCalledTimes(1)
    const [data, codec] = (adapter.sendVoice as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(codec).toBe(4)
    expect([...data]).toEqual([0x11, 0x22])
  })

  it('drops unknown opcode without calling sendVoice', () => {
    const { session, adapter } = sessionWithAdapter()
    session.handleRaw(Buffer.from([9, 4, 0x11]))
    expect(adapter.sendVoice).not.toHaveBeenCalled()
  })

  it('drops empty frames (len < 3)', () => {
    const { session, adapter } = sessionWithAdapter()
    session.handleRaw(Buffer.from([1, 4]))
    expect(adapter.sendVoice).not.toHaveBeenCalled()
  })

  it('downlink onVoice sends 4-byte header with clientId u16 BE', async () => {
    const sent: unknown[] = []
    const ws = {
      readyState: 1,
      OPEN: 1,
      send: (data: unknown) => {
        sent.push(data)
      },
    }
    let voiceCb: ((f: { clientId: number; codec: number; data: Uint8Array }) => void) | null =
      null
    const adapter: TsProtocolAdapter = {
      connect: vi.fn(async () => ({ name: 'mock', welcome: '', selfId: 1 })),
      disconnect: vi.fn(async () => {}),
      joinChannel: vi.fn(async () => {}),
      sendText: vi.fn(),
      sendVoice: vi.fn(),
      getChannelTree: () => [],
      getClients: () => [],
      onVoice: (cb) => {
        voiceCb = cb
        return () => {
          voiceCb = null
        }
      },
    }
    const session = new Session(ws as never, () => adapter)
    session.handleRaw(
      JSON.stringify({
        type: 'connect',
        host: 'ts.example.com',
        port: 9987,
        nickname: 'tester',
      }),
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(voiceCb).toBeTruthy()
    voiceCb!({ clientId: 0x0abc, codec: 4, data: Uint8Array.from([0x11, 0x22]) })
    const buf = sent.find((s) => Buffer.isBuffer(s)) as Buffer
    expect(buf).toBeTruthy()
    expect([...buf]).toEqual([1, 4, 0x0a, 0xbc, 0x11, 0x22])
  })
})
