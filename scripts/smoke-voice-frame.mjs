/**
 * Offline smoke: voice frame encode/decode via the real src/lib implementation.
 * Run: node --import tsx scripts/smoke-voice-frame.mjs
 * No gateway / network required.
 */
import assert from 'node:assert'
import {
  OPCODE_AUDIO,
  CODEC_OPUS_VOICE,
  FRAME_HEADER_BYTES,
  encodeClientFrame,
  encodeServerFrame,
  decodeServerFrame,
  encodeVoiceFrame,
  encodeVoiceFrameWithId,
  decodeVoiceFrame,
} from '../src/lib/voice-pipeline.ts'

// Uplink: 2-byte header, no clientId
const opus = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55])
const frame = encodeClientFrame(opus, CODEC_OPUS_VOICE)
assert.equal(frame[0], OPCODE_AUDIO)
assert.equal(frame[1], CODEC_OPUS_VOICE)
assert.equal(frame.length, 2 + opus.length)
assert.deepEqual([...frame.subarray(2)], [...opus])
// encodeVoiceFrame alias
assert.deepEqual([...encodeVoiceFrame(opus)], [...frame])

// Downlink: always 4-byte header with clientId
const opusLong = new Uint8Array([0x11, 0x22, 0x33, 0x44])
const clientId = 0x0abc
const withId = encodeServerFrame(opusLong, clientId, CODEC_OPUS_VOICE)
assert.equal(withId.length, FRAME_HEADER_BYTES + opusLong.length)
assert.equal((withId[2] << 8) | withId[3], clientId)

const parsedId = decodeVoiceFrame(withId)
assert.ok(parsedId)
assert.equal(parsedId.clientId, clientId)
assert.equal(parsedId.codec, CODEC_OPUS_VOICE)
assert.deepEqual([...parsedId.opus], [...opusLong])
// aliases
assert.deepEqual([...encodeVoiceFrameWithId(opusLong, clientId)], [...withId])
assert.ok(decodeServerFrame(withId))
assert.equal(
  decodeServerFrame(
    new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0x00, 0x01]),
  ),
  null,
)

// decodeVoiceFrame rejects short / wrong-opcode frames (no legacy heuristic)
assert.equal(decodeVoiceFrame(new Uint8Array([9, 1, 2, 3, 4])), null)
assert.equal(decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0xff])), null)
assert.equal(decodeVoiceFrame(new Uint8Array([OPCODE_AUDIO])), null)

// length 4 = header-only downlink, empty opus
const headerOnly = decodeVoiceFrame(
  new Uint8Array([OPCODE_AUDIO, CODEC_OPUS_VOICE, 0x00, 0x07]),
)
assert.ok(headerOnly)
assert.equal(headerOnly.clientId, 7)
assert.equal(headerOnly.opus.length, 0)

console.log('PASS voice frame codec (explicit uplink/downlink)')
