import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createVoicePipeline,
  webCodecsSupported,
  type VoicePipeline,
} from './voice-pipeline'

export type SendMode = 'open' | 'vox' | 'ptt'

export interface VoxSettings {
  mode: SendMode
  /** 0–1 analyser level threshold for VOX */
  threshold: number
  /** KeyboardEvent.code for PTT, e.g. Space */
  pttKey: string
}

const LS_VOX = 'tsweb:vox'
const DEFAULT_VOX: VoxSettings = { mode: 'vox', threshold: 0.18, pttKey: 'Space' }
/** Keep sending ~250ms after level drops (hang time) */
const VOX_HANG_MS = 250

function loadVox(): VoxSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_VOX) || 'null')
    if (!raw || typeof raw !== 'object') return DEFAULT_VOX
    return {
      mode: (raw.mode as SendMode) || DEFAULT_VOX.mode,
      threshold:
        typeof raw.threshold === 'number'
          ? Math.min(1, Math.max(0, raw.threshold))
          : DEFAULT_VOX.threshold,
      pttKey: typeof raw.pttKey === 'string' && raw.pttKey ? raw.pttKey : DEFAULT_VOX.pttKey,
    }
  } catch {
    return DEFAULT_VOX
  }
}

function saveVox(s: VoxSettings) {
  localStorage.setItem(LS_VOX, JSON.stringify(s))
}

function keyLabel(code: string) {
  if (code === 'Space') return '空格'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

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
  vox: VoxSettings
  pttHeld: boolean
  /** true while gate is open (VOX triggered or PTT held or open mode) */
  gateOpen: boolean
}

export function useMicrophone(onOpusFrame?: (opus: Uint8Array) => void) {
  const [state, setState] = useState<DeviceState>(() => ({
    devices: [],
    selectedId: '',
    micOn: false,
    level: 0,
    error: null,
    permission: 'unknown',
    webCodecs: typeof window !== 'undefined' ? webCodecsSupported() : false,
    outputVolume: 1,
    ready: false,
    vox: loadVox(),
    pttHeld: false,
    gateOpen: false,
  }))
  const streamRef = useRef<MediaStream | null>(null)
  const analyserCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const pipelineRef = useRef<VoicePipeline | null>(null)
  const fxRef = useRef({ aec: true, agc: true })
  const frameCbRef = useRef(onOpusFrame)
  frameCbRef.current = onOpusFrame
  const selectedIdRef = useRef('')
  const voxRef = useRef<VoxSettings>(loadVox())
  const pttHeldRef = useRef(false)
  const lastTalkMs = useRef(0)
  const levelRef = useRef(0)
  const gateOpenRef = useRef(false)

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

  const setAudioFx = (fx: { aec: boolean; agc: boolean }) => {
    fxRef.current = { ...fxRef.current, ...fx }
    pipelineRef.current?.setAudioFx(fxRef.current)
    // 采集已开启时重启（新 constraints 生效，如关闭浏览器原生 AEC）
    if (streamRef.current) {
      void requestMic(selectedIdRef.current || undefined)
    }
  }

  const setVox = useCallback((patch: Partial<VoxSettings>) => {
    voxRef.current = { ...voxRef.current, ...patch }
    saveVox(voxRef.current)
    setState((s) => ({ ...s, vox: voxRef.current }))
  }, [])

  const shouldSend = useCallback(() => {
    const { mode, threshold } = voxRef.current
    if (mode === 'open') return true
    if (mode === 'ptt') return pttHeldRef.current
    // vox
    const now = performance.now()
    if (levelRef.current >= threshold) {
      lastTalkMs.current = now
      return true
    }
    return now - lastTalkMs.current < VOX_HANG_MS
  }, [])

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const list = await navigator.mediaDevices.enumerateDevices()
    const mics = list.filter((d) => d.kind === 'audioinput')
    setState((s) => {
      const selectedId =
        s.selectedId && mics.some((m) => m.deviceId === s.selectedId)
          ? s.selectedId
          : selectedIdRef.current &&
              mics.some((m) => m.deviceId === selectedIdRef.current)
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
          // 软件 AEC/AGC 开启时关闭浏览器原生实现，避免双重处理相互干扰；
          // 关闭时回退到浏览器原生（Chrome = AEC3）
          echoCancellation: !fxRef.current.aec,
          noiseSuppression: true,
          autoGainControl: !fxRef.current.agc,
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
      let lastPush = 0
      let lastLevel = 0
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        const level = Math.min(1, rms * 4)
        levelRef.current = level
        const open = shouldSend()
        const now = performance.now()
        const gateChanged = open !== gateOpenRef.current
        // Throttle meter repaints (~20fps) and only push visible changes,
        // so the level bar doesn't jitter/flicker at 60fps
        const timeDue = now - lastPush >= 50
        const levelChanged = Math.abs(level - lastLevel) >= 0.02
        if (gateChanged || (timeDue && levelChanged) || (timeDue && open)) {
          lastPush = now
          lastLevel = level
          gateOpenRef.current = open
          setState((s) =>
            s.level === level && s.gateOpen === open
              ? s
              : { ...s, level, gateOpen: open },
          )
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      if (webCodecsSupported()) {
        if (!pipelineRef.current) pipelineRef.current = createVoicePipeline()
        await pipelineRef.current.startCapture(stream, (opus) => {
          if (!shouldSend()) return
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
    pttHeldRef.current = false
    setState((s) => ({ ...s, micOn: false, level: 0, pttHeld: false, gateOpen: false }))
  }

  const setMuted = useCallback((muted: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted
    })
  }, [])

  // PTT keyboard
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const t = el as HTMLElement | null
      if (!t) return false
      const tag = t.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable
      )
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (voxRef.current.mode !== 'ptt') return
      if (isTyping(e.target)) return
      if (e.code !== voxRef.current.pttKey) return
      e.preventDefault()
      if (!pttHeldRef.current) {
        pttHeldRef.current = true
        setState((s) => ({ ...s, pttHeld: true, gateOpen: true }))
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (voxRef.current.mode !== 'ptt') return
      if (e.code !== voxRef.current.pttKey) return
      pttHeldRef.current = false
      setState((s) => ({ ...s, pttHeld: false, gateOpen: false }))
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await refreshDevices()
      if (cancelled) return
      await requestMic(selectedIdRef.current || undefined)
      if (cancelled) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 启动引导仅执行一次；requestMic/refreshDevices 依赖均稳定（ref/稳定 setState）
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
    setAudioFx,
    setVox,
    keyLabel,
  }
}
