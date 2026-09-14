/**
 * Binary voice frame codec (pure helpers, no WebCodecs / DOM).
 *
 * Explicit protocol — no length heuristics:
 *
 * - Uplink (browser → gateway): [opcode:u8=1][codec:u8][opus...]
 *   2-byte header, no clientId. Gateway strips with subarray(2).
 *   Use encodeClientFrame / encodeVoiceFrame.
 *
 * - Downlink (gateway → browser): [opcode:u8=1][codec:u8][clientId:u16 BE][opus...]
 *   Always 4-byte header. Gateway builds this header; browser always parses it.
 *   Use encodeServerFrame / encodeVoiceFrameWithId and decodeServerFrame / decodeVoiceFrame.
 */

export const OPCODE_AUDIO = 1
export const CODEC_OPUS_VOICE = 4
/** Downlink header: [opcode:u8][codec:u8][clientId:u16 BE] */
export const FRAME_HEADER_BYTES = 4
/** Uplink header: [opcode:u8][codec:u8] */
export const CLIENT_HEADER_BYTES = 2

export interface DecodedVoiceFrame {
  codec: number
  clientId: number
  opus: Uint8Array
}

function toU8(buf: ArrayBufferLike | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf)
}

/**
 * Uplink encode (browser → gateway): 2-byte header, no clientId.
 * Format: [opcode:u8=1][codec:u8][opus...]
 */
export function encodeClientFrame(
  opus: Uint8Array,
  codec = CODEC_OPUS_VOICE,
): Uint8Array {
  const out = new Uint8Array(CLIENT_HEADER_BYTES + opus.length)
  out[0] = OPCODE_AUDIO
  out[1] = codec
  out.set(opus, CLIENT_HEADER_BYTES)
  return out
}

/**
 * Downlink encode (gateway → browser / tests / mock): 4-byte header with clientId.
 * Format: [opcode:u8=1][codec:u8][clientId:u16 BE][opus...]
 */
export function encodeServerFrame(
  opus: Uint8Array,
  clientId: number,
  codec = CODEC_OPUS_VOICE,
): Uint8Array {
  const out = new Uint8Array(FRAME_HEADER_BYTES + opus.length)
  out[0] = OPCODE_AUDIO
  out[1] = codec
  out[2] = (clientId >> 8) & 0xff
  out[3] = clientId & 0xff
  out.set(opus, FRAME_HEADER_BYTES)
  return out
}

/**
 * Decode a downlink frame. ALWAYS 4-byte header when length >= 4.
 * Returns null if length < 4 or opcode mismatch.
 * Opus payload may be empty (App drops empty payloads).
 *
 * Format: [opcode:u8=1][codec:u8][clientId:u16 BE][opus...]
 */
export function decodeVoiceFrame(
  buf: ArrayBufferLike | Uint8Array,
): DecodedVoiceFrame | null {
  const u8 = toU8(buf)
  if (u8.length < FRAME_HEADER_BYTES || u8[0] !== OPCODE_AUDIO) return null
  const codec = u8[1]
  const clientId = (u8[2] << 8) | u8[3]
  return {
    codec,
    clientId,
    opus: u8.subarray(FRAME_HEADER_BYTES),
  }
}

/**
 * Decode a downlink frame requiring at least one opus byte (length >= 5).
 * Stricter than decodeVoiceFrame for tests / mock paths.
 */
export function decodeServerFrame(
  buf: ArrayBufferLike | Uint8Array,
): DecodedVoiceFrame | null {
  const u8 = toU8(buf)
  if (u8.length < FRAME_HEADER_BYTES + 1) return null
  return decodeVoiceFrame(u8)
}

/** @deprecated Alias of encodeClientFrame (uplink, no id). */
export const encodeVoiceFrame = encodeClientFrame
/** @deprecated Alias of encodeServerFrame (downlink / tests, with id). */
export const encodeVoiceFrameWithId = encodeServerFrame
