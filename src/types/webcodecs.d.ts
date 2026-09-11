/** Minimal WebCodecs declarations when TS lib DOM lacks them. */

interface AudioDataInit {
  format: 'f32' | 'f32-planar' | 's16' | 's16-planar' | 's32' | 's32-planar' | 'u8' | 'u8-planar'
  sampleRate: number
  numberOfFrames: number
  numberOfChannels: number
  timestamp: number
  data: BufferSource
}

declare class AudioData {
  constructor(init: AudioDataInit)
  readonly format: string
  readonly sampleRate: number
  readonly numberOfFrames: number
  readonly numberOfChannels: number
  readonly timestamp: number
  readonly duration: number
  readonly byteLength: number
  close(): void
  copyTo(destination: Float32Array, options?: { planeIndex?: number; frameOffset?: number; frameCount?: number }): void
}

interface EncodedAudioChunkInit {
  type: 'key' | 'delta'
  timestamp: number
  duration?: number
  data: BufferSource
}

declare class EncodedAudioChunk {
  constructor(init: EncodedAudioChunkInit)
  readonly type: string
  readonly timestamp: number
  readonly byteLength: number
  copyTo(destination: BufferSource): void
}

interface AudioEncoderConfig {
  codec: string
  sampleRate: number
  numberOfChannels: number
  bitrate?: number
  opus?: { application?: 'voip' | 'audio' | 'lowdelay' }
}

interface AudioEncoderInit {
  output: (chunk: EncodedAudioChunk, metadata?: unknown) => void
  error: (e: unknown) => void
}

declare class AudioEncoder {
  constructor(init: AudioEncoderInit)
  readonly state: 'unconfigured' | 'configured' | 'closed'
  readonly encodeQueueSize: number
  configure(config: AudioEncoderConfig): void
  encode(data: AudioData): void
  flush(): Promise<void>
  close(): void
  static isConfigSupported(config: AudioEncoderConfig): Promise<{ supported: boolean; config?: AudioEncoderConfig }>
}

interface AudioDecoderConfig {
  codec: string
  sampleRate: number
  numberOfChannels: number
}

interface AudioDecoderInit {
  output: (data: AudioData) => void
  error: (e: unknown) => void
}

declare class AudioDecoder {
  constructor(init: AudioDecoderInit)
  readonly state: 'unconfigured' | 'configured' | 'closed'
  readonly decodeQueueSize: number
  configure(config: AudioDecoderConfig): void
  decode(chunk: EncodedAudioChunk): void
  flush(): Promise<void>
  close(): void
}
