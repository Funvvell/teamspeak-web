/**
 * Browser Opus voice pipeline via WebCodecs (Chrome/Edge).
 * Capture: getUserMedia → AudioWorklet → AudioEncoder → binary WS frames
 * Playback: binary WS frames → AudioDecoder → AudioBuffer queue
 *
 * Frame format (see voice-frame.ts):
 * - Uplink (this → gateway):  [1][codec][opus...]                 (2-byte header, no id)
 * - Downlink (gateway → this): [1][codec][idHi][idLo][opus...]    (always 4-byte header)
 */

export {
  OPCODE_AUDIO,
  CODEC_OPUS_VOICE,
  FRAME_HEADER_BYTES,
  CLIENT_HEADER_BYTES,
  encodeClientFrame,
  encodeServerFrame,
  decodeServerFrame,
  decodeVoiceFrame,
  /** @deprecated use encodeClientFrame */
  encodeVoiceFrame,
  /** @deprecated use encodeServerFrame */
  encodeVoiceFrameWithId,
} from './voice-frame'
export type { DecodedVoiceFrame } from './voice-frame'

export const SAMPLE_RATE = 48000
export const CHANNELS = 1
/** 20ms @ 48kHz mono */
export const FRAME_SAMPLES = 960

export function webCodecsSupported(): boolean {
  return (
    typeof AudioEncoder !== 'undefined' &&
    typeof AudioDecoder !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof EncodedAudioChunk !== 'undefined'
  )
}

export function sinkIdSupported(): boolean {
  return (
    typeof AudioContext !== 'undefined' &&
    typeof (AudioContext.prototype as { setSinkId?: unknown }).setSinkId ===
      'function'
  )
}

export interface VoicePipeline {
  startCapture(
    stream: MediaStream,
    onFrame: (opus: Uint8Array) => void,
  ): Promise<void>
  stopCapture(): void
  /** Feed incoming opus from gateway for playback */
  pushIncoming(opus: Uint8Array, clientId?: number): void
  setOutputVolume(v: number): void
  setClientVolume(clientId: number, v: number): void
  getClientVolume(clientId: number): number
  /** 切换回声消除（软件 AEC）/ 自动增益（重启采集生效） */
  setAudioFx(fx: { aec: boolean; agc: boolean; noise?: boolean }): void
  /** RNNoise VAD（0~1 语音概率；降噪未就绪时返回 -1） */
  getVad(): number
  setOutputDevice(deviceId: string): Promise<void>
  beep(freq?: number, durationSec?: number, gain?: number): void
  close(): void
}

export function createVoicePipeline(): VoicePipeline {
  let audioCtx: AudioContext | null = null
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
  const clientVolumes = new Map<number, number>()
  /**
   * FIFO of clientId per decode input. WebCodecs AudioDecoder emits outputs
   * in the same order as decode() inputs, so the output callback shifts the
   * matching id (avoids the old single pendingClientId race).
   */
  const clientIdQueue: number[] = []
  let sinkId = ''
  let fxAec = true
  let fxAgc = true
  let fxNoise = true
  let rnnoiseNode: AudioWorkletNode | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let aecNode: AudioWorkletNode | null = null
  let agcNode: DynamicsCompressorNode | null = null
  let muteNode: GainNode | null = null
  let wasmAbort: AbortController | null = null
  /** Bumped on stopCapture/close so a late initRnnoise result is ignored. */
  let rnnoiseGen = 0

  function ensureCtx(): AudioContext {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
      masterGain = audioCtx.createGain()
      masterGain.gain.value = outputVolume
      masterGain.connect(audioCtx.destination)
      nextPlayTime = 0
      if (sinkId && sinkIdSupported()) {
        void (audioCtx as AudioContext & { setSinkId(id: string): Promise<void> })
          .setSinkId(sinkId)
          .catch(() => {})
      }
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  }

  function ensureDecoder(): AudioDecoder | null {
    if (!webCodecsSupported()) return null
    if (decoder && decoder.state !== 'closed') return decoder
    decoder = new AudioDecoder({
      output: (audioData) => {
        // Order-preserving: WebCodecs emits outputs in decode() call order
        const clientId = clientIdQueue.shift() ?? 0
        try {
          playAudioData(audioData, clientId)
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

  function playAudioData(audioData: AudioData, clientId = 0) {
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
    const per = clientVolumes.get(clientId)
    if (per !== undefined && per !== 1) {
      const g = ctx.createGain()
      g.gain.value = per
      src.connect(g)
      g.connect(masterGain)
    } else {
      src.connect(masterGain)
    }
    const now = ctx.currentTime
    if (nextPlayTime < now + 0.02) nextPlayTime = now + 0.02
    src.start(nextPlayTime)
    nextPlayTime += buffer.duration
    // Simple catch-up: if we fell >0.5s behind wall clock (GC pause, tab
    // throttle, clock drift), reset the schedule instead of growing a jitter
    // buffer. Intentionally not a full jitter buffer — keep latency low.
    if (nextPlayTime > now + 0.5) nextPlayTime = now + 0.05
  }

  function flushPcm() {
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
    await ctx.audioWorklet.addModule('/aec-processor.js')
    await ctx.audioWorklet.addModule('/rnnoise-worklet.js')
    await ctx.audioWorklet.addModule('/capture-processor.js')
    sourceNode = ctx.createMediaStreamSource(stream)
    workletNode = new AudioWorkletNode(ctx, 'capture-processor')
    workletNode.port.onmessage = (ev) => {
      const pcm = ev.data as Float32Array
      pcmBuffer.push(pcm)
      pcmLength += pcm.length
      flushPcm()
    }
    // —— 低延迟音频处理链：软件 AEC（回声消除）→ RNNoise 降噪 → AGC（自动增益）→ 采集 ——
    // AEC 为 FDAF+NLMS 算法（reflex-aec，MIT），参考信号由 masterGain 旁路接入
    // inputs[1]：同一 AudioContext 内样本级对齐，HOP=128 ≈ 2.7ms@48k，无额外缓冲
    // 降噪为 RNNoise（@shiguredo/rnnoise-wasm，Apache-2.0）：480 帧 10ms 处理，输出对齐后块
    // AGC 用 Web Audio DynamicsCompressorNode（原生节点，零额外延迟）
    let head: AudioNode = sourceNode
    if (fxAec && masterGain) {
      aecNode = new AudioWorkletNode(ctx, 'aec-processor', {
        numberOfInputs: 2,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })
      sourceNode.connect(aecNode, 0, 0)
      masterGain.connect(aecNode, 0, 1) // 播放输出 → AEC 参考输入
      head = aecNode
    }
    if (fxAgc) {
      agcNode = ctx.createDynamicsCompressor()
      agcNode.threshold.value = -24
      agcNode.knee.value = 12
      agcNode.ratio.value = 8
      agcNode.attack.value = 0.003
      agcNode.release.value = 0.12
      head.connect(agcNode)
      head = agcNode
    }
    // RNNoise 节点恒在链中（wasm 懒加载）：降噪开时 init，关时透传，开关即时生效不重建图
    rnnoiseNode = new AudioWorkletNode(ctx, 'rnnoise-processor')
    rnnoiseNode.port.onmessage = (ev) => {
      const d = ev.data
      if (d && d.type === 'error') console.warn('[voice] rnnoise init error', d.message)
      if (d && d.type === 'ready') rnnoiseReady = true
      if (d && typeof d.vad === 'number') vadRef = d.vad
    }
    head.connect(rnnoiseNode)
    rnnoiseNode.connect(workletNode)
    if (fxNoise) {
      void initRnnoise()
    } else {
      rnnoiseNode.port.postMessage({ type: 'set-denoise', enabled: false })
    }
    // Keep graph alive without feedback to speakers
    muteNode = ctx.createGain()
    muteNode.gain.value = 0
    workletNode.connect(muteNode)
    muteNode.connect(ctx.destination)
  }

  function stopCapture() {
    // Invalidate in-flight RNNoise wasm load
    rnnoiseGen++
    wasmAbort?.abort()
    wasmAbort = null
    // Tear down the full capture graph: disconnect every node and drop refs.
    if (workletNode) {
      try {
        workletNode.port.onmessage = null
        workletNode.port.close()
      } catch {
        /* ignore */
      }
      try {
        workletNode.disconnect()
      } catch {
        /* ignore */
      }
      workletNode = null
    }
    if (rnnoiseNode) {
      try {
        rnnoiseNode.port.onmessage = null
        rnnoiseNode.port.close()
      } catch {
        /* ignore */
      }
      try {
        rnnoiseNode.disconnect()
      } catch {
        /* ignore */
      }
      rnnoiseNode = null
    }
    rnnoiseReady = false
    vadRef = 0
    if (aecNode) {
      try {
        aecNode.port.onmessage = null
        aecNode.disconnect()
      } catch {
        /* ignore */
      }
      aecNode = null
    }
    if (agcNode) {
      try {
        agcNode.disconnect()
      } catch {
        /* ignore */
      }
      agcNode = null
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect()
      } catch {
        /* ignore */
      }
      sourceNode = null
    }
    if (muteNode) {
      try {
        muteNode.disconnect()
      } catch {
        /* ignore */
      }
      muteNode = null
    }
    // Drop masterGain → AEC reference edge so playback does not keep the graph alive
    if (masterGain) {
      try {
        masterGain.disconnect()
      } catch {
        /* ignore */
      }
      // Reconnect masterGain → destination (playback path) after tearing down AEC ref
      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          masterGain.connect(audioCtx.destination)
        } catch {
          /* ignore */
        }
      }
    }
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

  function setAudioFx(fx: { aec: boolean; agc: boolean; noise?: boolean }) {
    fxAec = fx.aec
    fxAgc = fx.agc
    if (typeof fx.noise === 'boolean') {
      fxNoise = fx.noise
      // 降噪开关即时生效（无需重启采集）：未初始化则异步拉起 wasm，期间自动透传
      if (rnnoiseNode) {
        rnnoiseNode.port.postMessage({ type: 'set-denoise', enabled: fxNoise })
        if (fxNoise && !rnnoiseReady) void initRnnoise()
      }
    }
  }

  function getVad() {
    return rnnoiseReady ? vadRef : -1
  }

  let rnnoiseReady = false
  let vadRef = 0

  async function initRnnoise() {
    const gen = ++rnnoiseGen
    try {
      if (!rnnoiseNode || rnnoiseReady) return
      // 主线程拉取并编译 wasm（~3.6MB，仅降噪开启时一次性加载），Module 可转移进 worklet
      wasmAbort?.abort()
      wasmAbort = new AbortController()
      const res = await fetch('/rnnoise.wasm', { signal: wasmAbort.signal })
      if (!res.ok) throw new Error('fetch rnnoise.wasm failed: ' + res.status)
      const bytes = await res.arrayBuffer()
      const module = await WebAssembly.compile(bytes)
      // stopCapture/close may have run during fetch/compile — ignore late ready
      if (gen !== rnnoiseGen || !rnnoiseNode || rnnoiseReady || closed) return
      // WebAssembly.Module 支持结构化克隆，直接发送（无需 transfer 列表）
      rnnoiseNode.port.postMessage({ type: 'init', module })
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      if (gen !== rnnoiseGen) return
      console.warn('[voice] rnnoise init failed, 降噪保持关闭', err)
      fxNoise = false
      if (rnnoiseNode) rnnoiseNode.port.postMessage({ type: 'set-denoise', enabled: false })
    }
  }

  function pushIncoming(opus: Uint8Array, clientId = 0) {
    if (closed || !opus.length) return
    const dec = ensureDecoder()
    if (!dec || dec.state === 'closed') return
    // Associate this clientId with the next decoder output (order-preserving FIFO)
    clientIdQueue.push(clientId)
    try {
      dec.decode(
        new EncodedAudioChunk({
          type: 'key',
          timestamp: performance.now() * 1000,
          data: opus,
        }),
      )
    } catch (e) {
      // Drop the queued id if decode threw so the FIFO stays aligned
      clientIdQueue.pop()
      console.warn('[voice] decode failed', e)
    }
  }

  function setOutputVolume(v: number) {
    outputVolume = Math.max(0, Math.min(2, v))
    if (masterGain) masterGain.gain.value = outputVolume
  }

  function setClientVolume(clientId: number, v: number) {
    clientVolumes.set(clientId, Math.max(0, Math.min(2, v)))
  }

  function getClientVolume(clientId: number) {
    return clientVolumes.get(clientId) ?? 1
  }

  async function setOutputDevice(deviceId: string) {
    sinkId = deviceId || ''
    const ctx = ensureCtx()
    if (!sinkIdSupported()) return
    try {
      await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(
        sinkId,
      )
    } catch (e) {
      console.warn('[voice] setSinkId failed', e)
    }
  }

  function beep(freq = 880, durationSec = 0.08, gain = 0.15) {
    const ctx = ensureCtx()
    if (!masterGain) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    g.gain.value = gain * outputVolume
    osc.connect(g)
    g.connect(masterGain)
    const t = ctx.currentTime
    g.gain.setValueAtTime(g.gain.value, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + durationSec)
    osc.start(t)
    osc.stop(t + durationSec + 0.02)
  }

  function close() {
    closed = true
    wasmAbort?.abort()
    wasmAbort = null
    stopCapture()
    clientIdQueue.length = 0
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

  return {
    startCapture,
    stopCapture,
    setAudioFx,
    getVad,
    pushIncoming,
    setOutputVolume,
    setClientVolume,
    getClientVolume,
    setOutputDevice,
    beep,
    close,
  }
}
