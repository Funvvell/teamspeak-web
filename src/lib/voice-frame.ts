/**
 * Binary voice frame codec (pure helpers, no WebCodecs / DOM).
 *
 * Explicit protocol — no length heuristics:
 *
 * - Uplink (browser → gateway): [opcode:u8=1][codec:u8][opus...]
 *   2-byte header, no clientId. Gateway strips with subarray(2).
 *   Use encodeClientFrame / encodeVoiceFrame.
 *
 * - Downlink (gateway → browser): [opcode:u8=1][codec:u8][clientId:u32 BE][opus...]
 *   Always 6-byte header (u32 clientId — TS3 ids can exceed 65535).
 *   Use encodeServerFrame / encodeVoiceFrameWithId and decodeServerFrame / decodeVoiceFrame.
 */

export const OPCODE_AUDIO = 1
export const CODEC_OPUS_VOICE = 4
/** Downlink header: [opcode:u8][codec:u8][clientId:u32 BE] */
export const FRAME_HEADER_BYTES = 6
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
 * Downlink encode (gateway → browser / tests / mock): 6-byte header with clientId.
 * Format: [opcode:u8=1][codec:u8][clientId:u32 BE][opus...]
 */
export function encodeServerFrame(
  opus: Uint8Array,
  clientId: number,
  codec = CODEC_OPUS_VOICE,
): Uint8Array {
  const out = new Uint8Array(FRAME_HEADER_BYTES + opus.length)
  const id = clientId >>> 0
  out[0] = OPCODE_AUDIO
  out[1] = codec
  out[2] = (id >>> 24) & 0xff
  out[3] = (id >>> 16) & 0xff
  out[4] = (id >>> 8) & 0xff
  out[5] = id & 0xff
  out.set(opus, FRAME_HEADER_BYTES)
  return out
}

/**
 * Decode a downlink frame. ALWAYS 6-byte header when length >= 6.
 * Returns null if length < 6 or opcode mismatch.
 * Opus payload may be empty (App drops empty payloads).
 *
 * Format: [opcode:u8=1][codec:u8][clientId:u32 BE][opus...]
 */
export function decodeVoiceFrame(
  buf: ArrayBufferLike | Uint8Array,
): DecodedVoiceFrame | null {
  const u8 = toU8(buf)
  if (u8.length < FRAME_HEADER_BYTES || u8[0] !== OPCODE_AUDIO) return null
  const codec = u8[1]
  const clientId =
    ((u8[2] << 24) | (u8[3] << 16) | (u8[4] << 8) | u8[5]) >>> 0
  return {
    codec,
    clientId,
    opus: u8.subarray(FRAME_HEADER_BYTES),
  }
}

/**
 * Decode a downlink frame requiring at least one opus byte.
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
