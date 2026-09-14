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
  /** One shared AudioContext for the level analyser across requestMic calls. */
  const analyserCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const rafRef = useRef(0)
  const pipelineRef = useRef<VoicePipeline | null>(null)
  const fxRef = useRef({ aec: true, agc: true, noise: true })
  const frameCbRef = useRef(onOpusFrame)
  frameCbRef.current = onOpusFrame
  const selectedIdRef = useRef('')
  const voxRef = useRef<VoxSettings>(loadVox())
  const pttHeldRef = useRef(false)
  const lastTalkMs = useRef(0)
  const levelRef = useRef(0)
  const gateOpenRef = useRef(false)
  /**
   * Mutex: requestMic / refreshDevices are chained so getUserMedia and
   * startCapture never interleave. The chain never rejects.
   */
  const opMutexRef = useRef<Promise<void>>(Promise.resolve())
  /**
   * Generation token. Bumped on every teardown / stop / unmount and at the
   * start of each doRequestMic. In-flight work that finishes after a newer
   * op started aborts instead of applying stale state or leaking a stream.
   */
  const opGenRef = useRef(0)

  const ensurePipeline = useCallback((): VoicePipeline => {
    if (!pipelineRef.current) {
      pipelineRef.current = createVoicePipeline()
    }
    return pipelineRef.current
  }, [])

  const pushIncoming = useCallback(
    (opus: Uint8Array, clientId = 0) => {
      ensurePipeline().pushIncoming(opus, clientId)
    },
    [ensurePipeline],
  )

  const setClientVolume = useCallback(
    (clientId: number, v: number) => {
      ensurePipeline().setClientVolume(clientId, v)
    },
    [ensurePipeline],
  )

  const getClientVolume = useCallback(
    (clientId: number) => {
      return pipelineRef.current?.getClientVolume(clientId) ?? 1
    },
    [],
  )

  const setOutputVolume = useCallback(
    (v: number) => {
      setState((s) => ({ ...s, outputVolume: v }))
      ensurePipeline().setOutputVolume(v)
    },
    [ensurePipeline],
  )

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      await ensurePipeline().setOutputDevice(deviceId)
    },
    [ensurePipeline],
  )

  const setVox = useCallback((patch: Partial<VoxSettings>) => {
    voxRef.current = { ...voxRef.current, ...patch }
    saveVox(voxRef.current)
    setState((s) => ({ ...s, vox: voxRef.current }))
  }, [])

  const shouldSend = useCallback(() => {
    const { mode, threshold } = voxRef.current
    if (mode === 'open') return true
    if (mode === 'ptt') return pttHeldRef.current
    // vox：RNNoise VAD（0~1 语音概率）驱动 + RMS 响度兜底——
    // VAD 就绪时用深度模型识别人声（抗键盘/风扇误触发），未就绪回退响度阈值
    const now = performance.now()
    const vad = pipelineRef.current?.getVad?.() ?? -1
    const speaking = vad >= 0 ? vad >= 0.5 || levelRef.current >= threshold : levelRef.current >= threshold
    if (speaking) {
      lastTalkMs.current = now
      return true
    }
    return now - lastTalkMs.current < VOX_HANG_MS
  }, [])

  /** Unlocked device refresh — call only while holding opMutex or from boot. */
  const refreshDevicesInternal = useCallback(async () => {
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
  }, [])

  /**
   * Stop stream tracks, level RAF, and pipeline capture. Safe to call
   * repeatedly. Bumps the generation so any in-flight requestMic aborts
   * at its next checkpoint instead of resurrecting a dead stream.
   */
  const teardownCapture = useCallback(() => {
    opGenRef.current++
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    sourceRef.current?.disconnect()
    sourceRef.current = null
    pipelineRef.current?.stopCapture()
  }, [])

  const doRequestMic = useCallback(
    async (deviceId?: string) => {
      // Claim a generation: teardownCapture() below bumps again, so we take
      // our id AFTER teardown to remain the "current" op.
      if (!navigator.mediaDevices?.getUserMedia) {
        setState((s) => ({
          ...s,
          error: '当前环境不支持麦克风（需要 HTTPS 或 localhost）',
        }))
        return
      }
      try {
        // Fully stop any previous capture before starting a new one.
        teardownCapture()
        const gen = opGenRef.current

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
        // Superseded while awaiting getUserMedia — release the new stream.
        if (gen !== opGenRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const track = stream.getAudioTracks()[0]
        const settings = track?.getSettings?.()
        const resolvedId = deviceId || settings?.deviceId || ''
        if (resolvedId) selectedIdRef.current = resolvedId

        // Reuse one AudioContext + AnalyserNode across remounts; only the
        // MediaStreamSource is recreated for the new stream.
        let ctx = analyserCtxRef.current
        if (!ctx || ctx.state === 'closed') {
          ctx = new AudioContext()
          analyserCtxRef.current = ctx
          analyserRef.current = null
        }
        if (ctx.state === 'suspended') void ctx.resume()
        sourceRef.current?.disconnect()
        const source = ctx.createMediaStreamSource(stream)
        sourceRef.current = source
        let analyser = analyserRef.current
        if (!analyser || analyser.context !== ctx) {
          analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          analyserRef.current = analyser
        }
        source.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        let lastPush = 0
        let lastLevel = 0
        const tick = () => {
          // Stop the meter loop if this capture generation was torn down.
          if (gen !== opGenRef.current) return
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
          await ensurePipeline().startCapture(stream, (opus) => {
            if (!shouldSend()) return
            frameCbRef.current?.(opus)
          })
          if (gen !== opGenRef.current) return
        }

        await refreshDevicesInternal()
        if (gen !== opGenRef.current) return
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
        await refreshDevicesInternal()
      }
    },
    [ensurePipeline, refreshDevicesInternal, shouldSend, teardownCapture],
  )

  /** Enqueue fn on the op mutex; chain never rejects. */
  const enqueueOp = useCallback((fn: () => Promise<void>): Promise<void> => {
    const run = opMutexRef.current.then(fn)
    opMutexRef.current = run.then(
      () => {},
      () => {},
    )
    return run
  }, [])

  /** Serialized: concurrent calls run one after another, never interleave. */
  const requestMic = useCallback(
    (deviceId?: string): Promise<void> => {
      return enqueueOp(() => doRequestMic(deviceId))
    },
    [doRequestMic, enqueueOp],
  )

  /** Public refresh — serialized with requestMic so enumerateDevices never races gUM. */
  const refreshDevices = useCallback((): Promise<void> => {
    return enqueueOp(() => refreshDevicesInternal())
  }, [enqueueOp, refreshDevicesInternal])

  const setAudioFx = useCallback(
    (fx: { aec: boolean; agc: boolean; noise?: boolean }) => {
      fxRef.current = { ...fxRef.current, ...fx }
      pipelineRef.current?.setAudioFx(fxRef.current)
      // 采集已开启时重启（新 constraints 生效，如关闭浏览器原生 AEC）
      if (streamRef.current) {
        void requestMic(selectedIdRef.current || undefined)
      }
    },
    [requestMic],
  )

  const getVad = useCallback(() => {
    return pipelineRef.current?.getVad?.() ?? -1
  }, [])

  const stopMic = useCallback(() => {
    teardownCapture()
    pttHeldRef.current = false
    setState((s) => ({ ...s, micOn: false, level: 0, pttHeld: false, gateOpen: false }))
  }, [teardownCapture])

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

    const genRef = opGenRef
    return () => {
      cancelled = true
      genRef.current++
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange)
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      sourceRef.current?.disconnect()
      sourceRef.current = null
      analyserRef.current = null
      // Close the analyser context reliably so remounts don't leak it.
      void analyserCtxRef.current?.close().catch(() => {})
      analyserCtxRef.current = null
      pipelineRef.current?.close()
      pipelineRef.current = null
    }
  }, [requestMic, refreshDevices])

  return {
    state,
    requestMic,
    stopMic,
    refreshDevices,
    /**
     * @deprecated Prefer dedicated setters (setVox / setOutputVolume / …).
     * Kept for App compatibility — the device picker still patches
     * `selectedId` before calling requestMic. Do not use for mic lifecycle.
     */
    setState,
    pushIncoming,
    setOutputVolume,
    setOutputDevice,
    setClientVolume,
    getClientVolume,
    setMuted,
    setAudioFx,
    setVox,
    getVad,
    keyLabel,
  }
}
