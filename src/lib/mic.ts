import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createVoicePipeline,
  webCodecsSupported,
  type VoicePipeline,
} from './voice-pipeline'

export interface DeviceState {
  devices: MediaDeviceInfo[]
  selectedId: string
  micOn: boolean
  level: number
  error: string | null
  permission: 'unknown' | 'granted' | 'denied'
  webCodecs: boolean
  outputVolume: number
}

export function useMicrophone(onOpusFrame?: (opus: Uint8Array) => void) {
  const [state, setState] = useState<DeviceState>({
    devices: [],
    selectedId: '',
    micOn: false,
    level: 0,
    error: null,
    permission: 'unknown',
    webCodecs: typeof window !== 'undefined' ? webCodecsSupported() : false,
    outputVolume: 1,
  })
  const streamRef = useRef<MediaStream | null>(null)
  const analyserCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const pipelineRef = useRef<VoicePipeline | null>(null)
  const frameCbRef = useRef(onOpusFrame)
  frameCbRef.current = onOpusFrame

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      void analyserCtxRef.current?.close()
      pipelineRef.current?.close()
      pipelineRef.current = null
    }
  }, [])

  const pushIncoming = useCallback((opus: Uint8Array) => {
    if (!pipelineRef.current) {
      pipelineRef.current = createVoicePipeline()
    }
    pipelineRef.current.pushIncoming(opus)
  }, [])

  const setOutputVolume = useCallback((v: number) => {
    setState((s) => ({ ...s, outputVolume: v }))
    if (!pipelineRef.current) {
      pipelineRef.current = createVoicePipeline()
    }
    pipelineRef.current.setOutputVolume(v)
  }, [])

  async function refreshDevices() {
    const list = await navigator.mediaDevices.enumerateDevices()
    const mics = list.filter((d) => d.kind === 'audioinput')
    setState((s) => ({
      ...s,
      devices: mics,
      selectedId: s.selectedId || mics[0]?.deviceId || '',
    }))
  }

  async function requestMic(deviceId?: string) {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      cancelAnimationFrame(rafRef.current)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // Level meter (independent of voice pipeline)
      const ctx = new AudioContext()
      void analyserCtxRef.current?.close()
      analyserCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        setState((s) => ({ ...s, level: Math.min(1, rms * 4) }))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      // Voice encode path
      if (webCodecsSupported()) {
        if (!pipelineRef.current) pipelineRef.current = createVoicePipeline()
        await pipelineRef.current.startCapture(stream, (opus) => {
          frameCbRef.current?.(opus)
        })
      }

      await refreshDevices()
      setState((s) => ({
        ...s,
        micOn: true,
        permission: 'granted',
        error: webCodecsSupported()
          ? null
          : '已开麦做电平检测，但浏览器不支持 WebCodecs，无法上行语音',
        selectedId: deviceId || s.selectedId,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const denied = /denied|NotAllowed/i.test(message)
      setState((s) => ({
        ...s,
        micOn: false,
        level: 0,
        permission: denied ? 'denied' : s.permission,
        error: message,
      }))
    }
  }

  function stopMic() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    pipelineRef.current?.stopCapture()
    setState((s) => ({ ...s, micOn: false, level: 0 }))
  }

  return {
    state,
    requestMic,
    stopMic,
    refreshDevices,
    setState,
    pushIncoming,
    setOutputVolume,
  }
}
