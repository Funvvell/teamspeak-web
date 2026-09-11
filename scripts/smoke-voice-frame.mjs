import assert from 'node:assert'

const OPCODE_AUDIO = 1
const CODEC_OPUS_VOICE = 4

function encodeVoiceFrame(opus, codec = CODEC_OPUS_VOICE) {
  const out = new Uint8Array(2 + opus.length)
  out[0] = OPCODE_AUDIO
  out[1] = codec
  out.set(opus, 2)
  return out
}

function decodeVoiceFrame(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (u8.length < 2 || u8[0] !== OPCODE_AUDIO) return null
  return { codec: u8[1], opus: u8.subarray(2) }
}

const opus = new Uint8Array([0x11, 0x22, 0x33, 0x44])
const frame = encodeVoiceFrame(opus, CODEC_OPUS_VOICE)
assert.equal(frame[0], OPCODE_AUDIO)
assert.equal(frame[1], CODEC_OPUS_VOICE)
assert.equal(frame.length, 2 + opus.length)

const parsed = decodeVoiceFrame(frame)
assert.ok(parsed)
assert.equal(parsed.codec, CODEC_OPUS_VOICE)
assert.deepEqual([...parsed.opus], [...opus])
assert.equal(decodeVoiceFrame(new Uint8Array([9, 1, 2])), null)
console.log('PASS voice frame codec')
