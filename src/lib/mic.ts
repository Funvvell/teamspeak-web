import { useEffect, useRef, useState } from 'react'

export interface DeviceState {
  devices: MediaDeviceInfo[]
  selectedId: string
  micOn: boolean
  level: number
  error: string | null
  permission: 'unknown' | 'granted' | 'denied'
}

export function useMicrophone() {
  const [state, setState] = useState<DeviceState>({
    devices: [],
    selectedId: '',
    micOn: false,
    level: 0,
    error: null,
    permission: 'unknown',
  })
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      void ctxRef.current?.close()
    }
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      streamRef.current = stream
      const ctx = new AudioContext()
      ctxRef.current?.close()
      ctxRef.current = ctx
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
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)

      await refreshDevices()
      setState((s) => ({
        ...s,
        micOn: true,
        permission: 'granted',
        error: null,
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
    setState((s) => ({ ...s, micOn: false, level: 0 }))
  }

  return { state, requestMic, stopMic, refreshDevices, setState }
}
