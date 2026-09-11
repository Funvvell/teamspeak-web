/**
 * Browser Opus voice pipeline via WebCodecs (Chrome/Edge).
 * Capture: getUserMedia → AudioWorklet → AudioEncoder → binary WS frames
 * Playback: binary WS frames → AudioDecoder → AudioBuffer queue
 */

export const OPCODE_AUDIO = 1
export const CODEC_OPUS_VOICE = 4
export const SAMPLE_RATE = 48000
export const CHANNELS = 1
/** 20ms @ 48kHz mono */
export const FRAME_SAMPLES = 960

export function encodeVoiceFrame(opus: Uint8Array, codec = CODEC_OPUS_VOICE): Uint8Array {
  const out = new Uint8Array(2 + opus.length)
  out[0] = OPCODE_AUDIO
  out[1] = codec
  out.set(opus, 2)
  return out
}

export function decodeVoiceFrame(buf: ArrayBuffer | Uint8Array): {
  codec: number
  opus: Uint8Array
} | null {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (u8.length < 2 || u8[0] !== OPCODE_AUDIO) return null
  return { codec: u8[1], opus: u8.subarray(2) }
}

export function webCodecsSupported(): boolean {
  return (
    typeof AudioEncoder !== 'undefined' &&
    typeof AudioDecoder !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof EncodedAudioChunk !== 'undefined'
  )
}

export interface VoicePipeline {
  startCapture(
    stream: MediaStream,
    onFrame: (opus: Uint8Array) => void,
  ): Promise<void>
  stopCapture(): void
  /** Feed incoming opus from gateway for playback */
  pushIncoming(opus: Uint8Array): void
  setOutputVolume(v: number): void
  close(): void
}

export function createVoicePipeline(): VoicePipeline {
  let audioCtx: AudioContext | null = null
  let captureCtx: AudioContext | null = null
  let workletNode: AudioWorkletNode | null = null
  let mediaStream: MediaStream | null = null
  let encoder: AudioEncoder | null = null
  let decoder: AudioDecoder | null = null
  let masterGain: GainNode | null = null
  let nextPlayTime = 0
  let sampleTimestampUs = 0
  let pcmBuffer: Float32Array[] = []
  let pcmLength = 0
  let closed = false
  let outputVolume = 1

  function ensureCtx(): AudioContext {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
      masterGain = audioCtx.createGain()
      masterGain.gain.value = outputVolume
      masterGain.connect(audioCtx.destination)
      nextPlayTime = 0
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  }

  function ensureDecoder(): AudioDecoder | null {
    if (!webCodecsSupported()) return null
    if (decoder && decoder.state !== 'closed') return decoder
    decoder = new AudioDecoder({
      output: (audioData) => {
        try {
          playAudioData(audioData)
        } finally {
          audioData.close()
        }
      },
      error: (e) => {
        console.warn('[voice] decoder error', e)
      },
    })
    decoder.configure({
      codec: 'opus',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
    })
    return decoder
  }

  function playAudioData(audioData: AudioData) {
    const ctx = ensureCtx()
    if (!masterGain) return
    const frames = audioData.numberOfFrames
    if (frames <= 0) return
    const buffer = ctx.createBuffer(CHANNELS, frames, audioData.sampleRate || SAMPLE_RATE)
    const ch = new Float32Array(frames)
    audioData.copyTo(ch, { planeIndex: 0 })
    buffer.copyToChannel(ch, 0)

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(masterGain)
    const now = ctx.currentTime
    if (nextPlayTime < now + 0.02) nextPlayTime = now + 0.02
    src.start(nextPlayTime)
    nextPlayTime += buffer.duration
    // Prevent unbounded drift if stream pauses
    if (nextPlayTime > now + 0.5) nextPlayTime = now + 0.05
  }

  function flushPcm(onFrame: (opus: Uint8Array) => void) {
    if (!encoder || pcmLength < FRAME_SAMPLES) return
    // Concat and split into 20ms frames
    const all = new Float32Array(pcmLength)
    let off = 0
    for (const chunk of pcmBuffer) {
      all.set(chunk, off)
      off += chunk.length
    }
    pcmBuffer = []
    pcmLength = 0

    for (let i = 0; i + FRAME_SAMPLES <= all.length; i += FRAME_SAMPLES) {
      const frame = all.subarray(i, i + FRAME_SAMPLES)
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: FRAME_SAMPLES,
        numberOfChannels: CHANNELS,
        timestamp: sampleTimestampUs,
        data: frame,
      })
      sampleTimestampUs += (FRAME_SAMPLES / SAMPLE_RATE) * 1e6
      encoder.encode(audioData)
      audioData.close()
    }
    // Keep remainder
    const remain = all.subarray(Math.floor(all.length / FRAME_SAMPLES) * FRAME_SAMPLES)
    if (remain.length > 0) {
      pcmBuffer.push(Float32Array.from(remain))
      pcmLength = remain.length
    }
  }

  async function startCapture(
    stream: MediaStream,
    onFrame: (opus: Uint8Array) => void,
  ): Promise<void> {
    stopCapture()
    if (!webCodecsSupported()) {
      throw new Error('当前浏览器不支持 WebCodecs AudioEncoder/Decoder，请使用 Chrome/Edge')
    }

    const config: AudioEncoderConfig = {
      codec: 'opus',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: 32000,
    }
    const support = await AudioEncoder.isConfigSupported(config)
    if (!support.supported) {
      throw new Error('浏览器不支持 Opus AudioEncoder 配置')
    }

    encoder = new AudioEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        onFrame(data)
      },
      error: (e) => console.warn('[voice] encoder error', e),
    })
    encoder.configure(config)
    sampleTimestampUs = 0

    mediaStream = stream
    const ctx = ensureCtx()
    // Separate context for capture so device rate can differ; resample via AudioContext
    captureCtx = ctx
    await ctx.audioWorklet.addModule('/capture-processor.js')
    const source = ctx.createMediaStreamSource(stream)
    workletNode = new AudioWorkletNode(ctx, 'capture-processor')
    workletNode.port.onmessage = (ev) => {
      const pcm = ev.data as Float32Array
      pcmBuffer.push(pcm)
      pcmLength += pcm.length
      flushPcm(onFrame)
    }
    source.connect(workletNode)
    // Keep graph alive without feedback to speakers
    const mute = ctx.createGain()
    mute.gain.value = 0
    workletNode.connect(mute)
    mute.connect(ctx.destination)
  }

  function stopCapture() {
    workletNode?.port.close()
    workletNode?.disconnect()
    workletNode = null
    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null
    if (encoder && encoder.state !== 'closed') {
      try {
        encoder.close()
      } catch {
        /* ignore */
      }
    }
    encoder = null
    pcmBuffer = []
    pcmLength = 0
  }

  function pushIncoming(opus: Uint8Array) {
    if (closed || !opus.length) return
    const dec = ensureDecoder()
    if (!dec || dec.state === 'closed') return
    try {
      dec.decode(
        new EncodedAudioChunk({
          type: 'key',
          timestamp: performance.now() * 1000,
          data: opus,
        }),
      )
    } catch (e) {
      console.warn('[voice] decode failed', e)
    }
  }

  function setOutputVolume(v: number) {
    outputVolume = Math.max(0, Math.min(1, v))
    if (masterGain) masterGain.gain.value = outputVolume
  }

  function close() {
    closed = true
    stopCapture()
    if (decoder && decoder.state !== 'closed') {
      try {
        decoder.close()
      } catch {
        /* ignore */
      }
    }
    decoder = null
    if (audioCtx && audioCtx.state !== 'closed') void audioCtx.close()
    audioCtx = null
    masterGain = null
  }

  return { startCapture, stopCapture, pushIncoming, setOutputVolume, close }
}
