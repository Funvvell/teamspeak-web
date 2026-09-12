/**
 * RNNoise 降噪 AudioWorklet
 *
 * 集成 @shiguredo/rnnoise-wasm（Apache-2.0，内部为 Xiph RNNoise）：
 * - wasm 模块由主线程 fetch 并 WebAssembly.compile 后经 port 转移（Module 可结构化克隆）
 * - worklet 内 new WebAssembly.Instance(module, stubs) —— imports 仅 3 个空实现（无 memory import）
 * - RNNoise 固定帧 480 采样 @48k（10ms）；输入 128 帧块 → 缓冲对齐 480 → 处理后输出 480 帧块
 * - 未就绪（降噪关 / wasm 未加载）时透传输入，链路不中断
 * - VAD 返回值（0~1）保留在 this.vad，供后续"智能降噪"使用
 */
class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pending = [] // Float32Array[] 输入块累积
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

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const ch = input[0]

    // 未就绪：透传输入块（链路保持畅通，等 wasm 就绪后自然切到 480 对齐）
    if (!this.ready) {
      this.port.postMessage(ch)
      return true
    }

    this.pending.push(ch)
    const fs = this.frameSize
    let len = 0
    for (const b of this.pending) len += b.length
    if (len < fs) return true

    let head = 0
    while (len >= fs) {
      const frame = new Float32Array(fs)
      let wi = 0
      while (wi < fs) {
        const b = this.pending[head]
        const need = fs - wi
        if (b.length <= need) {
          frame.set(b, wi)
          wi += b.length
          head++
        } else {
          frame.set(b.subarray(0, need), wi)
          this.pending[head] = b.subarray(need)
          wi = fs
        }
      }
      len -= fs
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
      } else {
        out = frame
      }
      this.port.postMessage(out)
    }
    if (head > 0) this.pending = this.pending.slice(head)
    return true
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor)
