import { describe, it, expect } from 'vitest'
import {
  OPCODE_AUDIO,
  CODEC_OPUS_VOICE,
  FRAME_HEADER_BYTES,
  CLIENT_HEADER_BYTES,
  encodeClientFrame,
  encodeServerFrame,
  decodeVoiceFrame,
  decodeServerFrame,
  encodeVoiceFrame,
  encodeVoiceFrameWithId,
} from './voice-frame'

describe('encodeClientFrame (uplink, 2-byte header)', () => {
  it('writes [opcode][codec][opus...]', () => {
    const opus = new Uint8Array([0x11, 0x22, 0x33])
    const frame = encodeClientFrame(opus, CODEC_OPUS_VOICE)
    expect(frame.length).toBe(CLIENT_HEADER_BYTES + opus.length)
    expect(frame[0]).toBe(OPCODE_AUDIO)
    expect(frame[1]).toBe(CODEC_OPUS_VOICE)
    expect([...frame.subarray(2)]).toEqual([...opus])
  })

  it('is aliased by the deprecated encodeVoiceFrame name', () => {
    const opus = new Uint8Array([0xaa])
    expect([...encodeVoiceFrame(opus)]).toEqual([...encodeClientFrame(opus)])
  })
})

describe('encodeServerFrame (downlink, 4-byte header)', () => {
  it('writes clientId as u16 BE after opcode+codec', () => {
    const opus = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const clientId = 0x1234
    const frame = encodeServerFrame(opus, clientId, CODEC_OPUS_VOICE)
    expect(frame.length).toBe(FRAME_HEADER_BYTES + opus.length)
    expect(frame[0]).toBe(OPCODE_AUDIO)
    expect(frame[1]).toBe(CODEC_OPUS_VOICE)
    expect((frame[2] << 8) | frame[3]).toBe(clientId)
    expect([...frame.subarray(FRAME_HEADER_BYTES)]).toEqual([...opus])
  })

  it('is aliased by the deprecated encodeVoiceFrameWithId name', () => {
    const opus = new Uint8Array([0x01])
    expect([...encodeVoiceFrameWithId(opus, 7)]).toEqual([...encodeServerFrame(opus, 7)])
  })
})

describe('decodeVoiceFrame (downlink, always 4-byte header)', () => {
  it('roundtrips encodeServerFrame → decodeVoiceFrame', () => {
    const opus = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05])
    const parsed = decodeVoiceFrame(encodeServerFrame(opus, 0x0abc))
    expect(parsed).not.toBeNull()
    expect(parsed!.codec).toBe(CODEC_OPUS_VOICE)
    expect(parsed!.clientId).toBe(0x0abc)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('clientId u16 max 65535 survives roundtrip', () => {
    const opus = new Uint8Array([0xff, 0xee, 0xdd])
    const parsed = decodeVoiceFrame(encodeServerFrame(opus, 0xffff))
    expect(parsed!.clientId).toBe(0xffff)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('clientId 0 is a valid id (not special-cased)', () => {
    const opus = new Uint8Array([0xaa, 0xbb, 0xcc])
    const parsed = decodeVoiceFrame(encodeServerFrame(opus, 0))
    expect(parsed!.clientId).toBe(0)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('accepts ArrayBuffer input', () => {
    const opus = new Uint8Array([0x10, 0x20, 0x30])
    const frame = encodeServerFrame(opus, 7)
    const buf = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength)
    const parsed = decodeVoiceFrame(buf)
    expect(parsed!.clientId).toBe(7)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('rejects wrong opcode', () => {
    expect(decodeVoiceFrame(new Uint8Array([9, 1, 0, 0, 1]))).toBeNull()
  })

  it('rejects frames shorter than the 4-byte header', () => {
    expect(decodeVoiceFrame(new Uint8Array([]))).toBeNull()
    expect(decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO]))).toBeNull()
    expect(decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE]))).toBeNull()
    expect(decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0x00]))).toBeNull()
  })

  it('accepts header-only frames with empty opus (length == 4)', () => {
    const parsed = decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0x00, 0x05]))
    expect(parsed).not.toBeNull()
    expect(parsed!.clientId).toBe(5)
    expect(parsed!.opus.length).toBe(0)
  })
})

describe('decodeServerFrame (stricter: requires ≥1 opus byte)', () => {
  it('roundtrips when payload is non-empty', () => {
    const opus = new Uint8Array([0x11, 0x22, 0x33, 0x44])
    const parsed = decodeServerFrame(encodeServerFrame(opus, 0x0abc))
    expect(parsed!.clientId).toBe(0x0abc)
    expect([...parsed!.opus]).toEqual([...opus])
  })

  it('rejects header-only frames (empty opus)', () => {
    const frame = encodeServerFrame(new Uint8Array(0), 1)
    expect(frame.length).toBe(FRAME_HEADER_BYTES)
    expect(decodeServerFrame(frame)).toBeNull()
  })

  it('rejects wrong opcode and short frames', () => {
    expect(decodeServerFrame(new Uint8Array([9, 1, 0, 0, 1]))).toBeNull()
    expect(decodeServerFrame(new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0, 0]))).toBeNull()
  })
})
