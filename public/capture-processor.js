// AudioWorklet: capture mono f32 PCM and post to main thread.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0] && input[0].length > 0) {
      // Copy channel 0
      this.port.postMessage(Float32Array.from(input[0]))
    }
    return true
  }
}
registerProcessor('capture-processor', CaptureProcessor)
