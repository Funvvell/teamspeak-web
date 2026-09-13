/**
 * RNNoise 降噪 AudioWorklet
 *
 * 集成 @shiguredo/rnnoise-wasm（Apache-2.0，内部为 Xiph RNNoise）：
 * - wasm 模块由主线程 fetch 并 WebAssembly.compile 后经 port 转移（Module 支持结构化克隆）
 * - worklet 内 new WebAssembly.Instance(module, stubs) —— imports 仅 3 个空实现（无 memory import）
 * - RNNoise 固定帧 480 采样 @48k（10ms）；输入 128 帧块 → 缓冲对齐 480 → 处理 → 输出写节点通道
 * - 输出与 128 块对齐：480 与 128 不可约，处理输出先进 outQueue；队列不足时借未处理输入补足
 *   （借出帧不再参与处理，无重复、无静音；每 15 块循环含 4 次 32 帧原始透传，可闻性低）
 * - 未就绪（降噪关 / wasm 未加载）时透传输入，链路不中断
 * - VAD（0~1，RNNoise 神经模型语音概率）经 port 上报主线程，供声控 VOX 精准门控
 */
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pending = [] // Float32Array[] 输入块累积（未处理）
    this.outQueue = [] // Float32Array[] 处理输出待发队列
    this.ready = false // wasm 实例化完成
    this.denoise = true // 降噪开关
    this.frameSize = 480
    this.wasm = null
    this.state = 0
    this.memI16 = null
    this.inPtr = 0
    this.outPtr = 0
    this.vad = 0
    this.port.onmessage = (e) => {
      const d = e.data
      if (d && d.type === 'set-denoise') this.denoise = !!d.enabled
      if (d && d.type === 'init') this.initWasm(d.module)
    }
  }

  initWasm(module) {
    try {
      const inst = new WebAssembly.Instance(module, {
        env: {
          __assert_fail: () => {},
          emscripten_resize_heap: () => 0,
        },
        wasi_snapshot_preview1: { fd_write: () => 0 },
      })
      this.wasm = inst.exports
      this.frameSize = this.wasm.rnnoise_get_frame_size()
      this.state = this.wasm.rnnoise_create(0)
      this.inPtr = this.wasm.malloc(this.frameSize * 2)
      this.outPtr = this.wasm.malloc(this.frameSize * 2)
      this.memI16 = new Int16Array(this.wasm.memory.buffer)
      this.ready = true
      this.port.postMessage({ type: 'ready', frameSize: this.frameSize })
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) })
    }
  }

  // 从 pending 头部取 n 帧（不足返回 null）
  takeFrom(arr, n, out) {
    let w = 0
    while (w < n && arr.length) {
      const seg = arr[0]
      const take = Math.min(seg.length, n - w)
      out.set(seg.subarray(0, take), w)
      w += take
      if (seg.length > take) arr[0] = seg.subarray(take)
      else arr.shift()
    }
    return w
  }

  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || !input[0] || !output || !output[0]) return true
    const ch = input[0]
    const outCh = output[0]

    // 未就绪：透传输入块（链路保持畅通，等 wasm 就绪后自然切到降噪）
    if (!this.ready) {
      outCh.set(ch)
      return true
    }

    this.pending.push(ch)
    const fs = this.frameSize

    // 处理所有已凑满的 480 帧窗口
    let pendLen = 0
    for (const b of this.pending) pendLen += b.length
    while (pendLen >= fs) {
      const frame = new Float32Array(fs)
      const got = this.takeFrom(this.pending, fs, frame)
      pendLen -= got
      if (got < fs) break
      let out
      if (this.denoise) {
        // RNNoise 假定 16-bit PCM：float(-1..1) × 32768 → Int16 写入
        const i16 = this.memI16
        const base = this.inPtr >> 1
        for (let i = 0; i < fs; i++) {
          let v = frame[i] * 32768
          if (v > 32767) v = 32767
          else if (v < -32768) v = -32768
          i16[base + i] = v | 0
        }
        this.vad = this.wasm.rnnoise_process_frame(this.state, this.inPtr, this.outPtr)
        out = new Float32Array(fs)
        const obase = this.outPtr >> 1
        for (let i = 0; i < fs; i++) out[i] = i16[obase + i] / 32768
        // VAD 上报（每 10ms 一次，控制消息不占用音频通道）
        this.port.postMessage({ vad: this.vad })
      } else {
        out = frame
      }
      this.outQueue.push(out)
    }

    // 输出：优先处理队列（已降噪），不足时借未处理输入（原始帧，仅周期瞬态），再不足填零（启动瞬态）
    let w = this.takeFrom(this.outQueue, outCh.length, outCh)
    if (w < outCh.length) {
      w += this.takeFrom(this.pending, outCh.length - w, outCh)
    }
    if (w < outCh.length) outCh.fill(0, w)
    return true
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor)
