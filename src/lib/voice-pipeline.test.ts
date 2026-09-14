import { describe, it, expect } from 'vitest'
import {
  OPCODE_AUDIO,
  CODEC_OPUS_VOICE,
  FRAME_HEADER_BYTES,
  CLIENT_HEADER_BYTES,
  encodeClientFrame,
  encodeServerFrame,
  decodeServerFrame,
  encodeVoiceFrame,
  encodeVoiceFrameWithId,
  decodeVoiceFrame,
  webCodecsSupported,
} from './voice-pipeline'

describe('encodeClientFrame (uplink, 2-byte header, no id)', () => {
  it('roundtrip shape: [opcode][codec][opus...]', () => {
    const opus = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55])
    const frame = encodeClientFrame(opus, CODEC_OPUS_VOICE)
    expect(frame[0]).toBe(OPCODE_AUDIO)
    expect(frame[1]).toBe(CODEC_OPUS_VOICE)
    expect(frame.length).toBe(CLIENT_HEADER_BYTES + opus.length)
    expect([...frame.subarray(2)]).toEqual([...opus])
  })

  it('encodeVoiceFrame is an alias of encodeClientFrame', () => {
    const opus = new Uint8Array([0xaa, 0xbb])
    expect([...encodeVoiceFrame(opus)]).toEqual([...encodeClientFrame(opus)])
  })
})

describe('encodeServerFrame / decodeVoiceFrame (downlink, always 4-byte header)', () => {
  it('roundtrip with clientId', () => {
    const opus = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01])
    const clientId = 0x1234
    const frame = encodeServerFrame(opus, clientId, CODEC_OPUS_VOICE)
    expect(frame.length).toBe(FRAME_HEADER_BYTES + opus.length)
    expect(frame[0]).toBe(OPCODE_AUDIO)
    expect(frame[1]).toBe(CODEC_OPUS_VOICE)
    expect((frame[2] << 8) | frame[3]).toBe(clientId)

    const parsed = decodeVoiceFrame(frame)
    expect(parsed).not.toBeNull()
    expect(parsed!.clientId).toBe(clientId)
    expect(parsed!.codec).toBe(CODEC_OPUS_VOICE)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('clientId u16 BE: max value 65535 survives roundtrip', () => {
    const opus = new Uint8Array([0x01, 0x02, 0x03])
    const parsed = decodeVoiceFrame(encodeServerFrame(opus, 0xffff))
    expect(parsed!.clientId).toBe(0xffff)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('clientId 0 is preserved', () => {
    const opus = new Uint8Array([0xaa, 0xbb, 0xcc])
    const frame = encodeServerFrame(opus, 0)
    expect(frame.length).toBe(FRAME_HEADER_BYTES + opus.length)
    const parsed = decodeVoiceFrame(frame)
    expect(parsed!.clientId).toBe(0)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('accepts ArrayBuffer input', () => {
    const opus = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50])
    const frame = encodeServerFrame(opus, 7)
    const buf = frame.buffer.slice(
      frame.byteOffset,
      frame.byteOffset + frame.byteLength,
    )
    const parsed = decodeVoiceFrame(buf)
    expect(parsed!.clientId).toBe(7)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('encodeVoiceFrameWithId is an alias of encodeServerFrame', () => {
    const opus = new Uint8Array([0x01, 0x02])
    expect([...encodeVoiceFrameWithId(opus, 9)]).toEqual([
      ...encodeServerFrame(opus, 9),
    ])
  })
})

describe('decodeVoiceFrame edge cases (always 4-byte when length >= 4)', () => {
  it('rejects wrong opcode', () => {
    expect(decodeVoiceFrame(new Uint8Array([9, 1, 2, 3, 4]))).toBeNull()
  })

  it('rejects frames shorter than 4 bytes (no legacy short-frame path)', () => {
    expect(decodeVoiceFrame(new Uint8Array([]))).toBeNull()
    expect(decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO]))).toBeNull()
    expect(
      decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE])),
    ).toBeNull()
    // len 3 would have been misread as legacy before; now rejected
    expect(
      decodeVoiceFrame(
        new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0xff]),
      ),
    ).toBeNull()
  })

  it('length 4 is header-only downlink (empty opus allowed)', () => {
    const parsed = decodeVoiceFrame(
      new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0x00, 0x05]),
    )
    expect(parsed).not.toBeNull()
    expect(parsed!.clientId).toBe(5)
    expect(parsed!.opus.length).toBe(0)
  })

  it('does not treat a 2-byte uplink frame as downlink', () => {
    // 2-byte uplink + extra payload would look like 4-byte downlink if fed
    // to decodeVoiceFrame — callers must not do that. decodeVoiceFrame always
    // reads id from bytes 2–3 when length >= 4.
    const uplink = encodeClientFrame(new Uint8Array([0x11, 0x22, 0x33]))
    expect(uplink.length).toBe(5)
    const parsed = decodeVoiceFrame(uplink)!
    // Bytes 2–3 of the uplink (first two opus bytes) are read as clientId
    expect(parsed.clientId).toBe((0x11 << 8) | 0x22)
    expect([...parsed.opus]).toEqual([0x33])
  })
})

describe('decodeServerFrame (requires header + at least 1 opus byte)', () => {
  it('accepts length >= 5', () => {
    const opus = new Uint8Array([0x01])
    const parsed = decodeServerFrame(encodeServerFrame(opus, 42))
    expect(parsed!.clientId).toBe(42)
    expect([...parsed!.opus]).toEqual([0x01])
  })

  it('rejects header-only (length 4)', () => {
    expect(
      decodeServerFrame(
        new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0x00, 0x01]),
      ),
    ).toBeNull()
  })

  it('rejects short frames', () => {
    expect(decodeServerFrame(new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE]))).toBeNull()
  })
})

describe('webCodecsSupported', () => {
  it('returns boolean (false under node)', () => {
    expect(typeof webCodecsSupported()).toBe('boolean')
  })
})
