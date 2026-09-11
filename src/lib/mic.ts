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
  ready: boolean
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
    ready: false,
  })
  const streamRef = useRef<MediaStream | null>(null)
  const analyserCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const pipelineRef = useRef<VoicePipeline | null>(null)
  const frameCbRef = useRef(onOpusFrame)
  frameCbRef.current = onOpusFrame
  const selectedIdRef = useRef('')

  const pushIncoming = useCallback((opus: Uint8Array, clientId = 0) => {
    if (!pipelineRef.current) {
      pipelineRef.current = createVoicePipeline()
    }
    pipelineRef.current.pushIncoming(opus, clientId)
  }, [])

  const setClientVolume = useCallback((clientId: number, v: number) => {
    if (!pipelineRef.current) {
      pipelineRef.current = createVoicePipeline()
    }
    pipelineRef.current.setClientVolume(clientId, v)
  }, [])

  const setOutputVolume = useCallback((v: number) => {
    setState((s) => ({ ...s, outputVolume: v }))
    if (!pipelineRef.current) {
      pipelineRef.current = createVoicePipeline()
    }
    pipelineRef.current.setOutputVolume(v)
  }, [])

  const setOutputDevice = useCallback(async (deviceId: string) => {
    if (!pipelineRef.current) {
      pipelineRef.current = createVoicePipeline()
    }
    await pipelineRef.current.setOutputDevice(deviceId)
  }, [])

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const list = await navigator.mediaDevices.enumerateDevices()
    const mics = list.filter((d) => d.kind === 'audioinput')
    setState((s) => {
      const selectedId =
        s.selectedId &&
        mics.some((m) => m.deviceId === s.selectedId)
          ? s.selectedId
          : selectedIdRef.current && mics.some((m) => m.deviceId === selectedIdRef.current)
            ? selectedIdRef.current
            : mics[0]?.deviceId || ''
      selectedIdRef.current = selectedId
      return { ...s, devices: mics, selectedId, ready: true }
    })
  }

  async function requestMic(deviceId?: string) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({
        ...s,
        error: '当前环境不支持麦克风（需要 HTTPS 或 localhost）',
      }))
      return
    }
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

      const track = stream.getAudioTracks()[0]
      const settings = track?.getSettings?.()
      const resolvedId = deviceId || settings?.deviceId || ''
      if (resolvedId) selectedIdRef.current = resolvedId

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
          : '麦克风已就绪，但浏览器不支持 WebCodecs，无法上行语音',
        selectedId: resolvedId || s.selectedId,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const denied = /denied|NotAllowed|Permission/i.test(message)
      setState((s) => ({
        ...s,
        micOn: false,
        level: 0,
        ready: true,
        permission: denied ? 'denied' : s.permission,
        error: denied ? '麦克风权限被拒绝，请在浏览器地址栏允许后刷新' : message,
      }))
      await refreshDevices()
    }
  }

  function stopMic() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    pipelineRef.current?.stopCapture()
    setState((s) => ({ ...s, micOn: false, level: 0 }))
  }

  const setMuted = useCallback((muted: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted
    })
  }, [])

  // Auto-detect + authorize mic when the page opens
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await refreshDevices()
      if (cancelled) return
      // Unlock labels + start pipeline without a button click
      await requestMic(selectedIdRef.current || undefined)
      if (cancelled) return
      // Some browsers need a second pass after permission
      await refreshDevices()
    }
    void boot()

    const onDeviceChange = () => {
      void refreshDevices()
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange)

    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange)
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      void analyserCtxRef.current?.close()
      pipelineRef.current?.close()
      pipelineRef.current = null
    }
  }, [])

  return {
    state,
    requestMic,
    stopMic,
    refreshDevices,
    setState,
    pushIncoming,
    setOutputVolume,
    setOutputDevice,
    setClientVolume,
    setMuted,
  }
}
