import { createVoicePipeline, sinkIdSupported } from './voice-pipeline'

/** Shared pipeline for notification beeps + mic path reuse via mic hook */
let notifyPipeline: ReturnType<typeof createVoicePipeline> | null = null
let soundsOn = localStorage.getItem('tsweb:sounds') !== '0'

export function setSoundsEnabled(on: boolean) {
  soundsOn = on
  localStorage.setItem('tsweb:sounds', on ? '1' : '0')
}

export function getSoundsEnabled() {
  return soundsOn
}

export function supportsSetSinkId() {
  return sinkIdSupported()
}

type BeepKind = 'join' | 'leave' | 'pm' | 'poke' | 'connect' | 'disconnect'

const BEEPS: Record<BeepKind, { freq: number; dur: number; gain: number }> = {
  join: { freq: 660, dur: 0.07, gain: 0.12 },
  leave: { freq: 440, dur: 0.09, gain: 0.1 },
  pm: { freq: 990, dur: 0.06, gain: 0.14 },
  poke: { freq: 1200, dur: 0.05, gain: 0.18 },
  connect: { freq: 520, dur: 0.12, gain: 0.12 },
  disconnect: { freq: 320, dur: 0.15, gain: 0.1 },
}

export function playNotify(kind: BeepKind) {
  if (!soundsOn) return
  if (!notifyPipeline) notifyPipeline = createVoicePipeline()
  const b = BEEPS[kind]
  try {
    notifyPipeline.beep(b.freq, b.dur, b.gain)
    // poke: double blip
    if (kind === 'poke') {
      setTimeout(() => notifyPipeline?.beep(1400, 0.04, b.gain), 70)
    }
  } catch {
    /* autoplay policies */
  }
}

export function applySinkId(deviceId: string) {
  if (!notifyPipeline) notifyPipeline = createVoicePipeline()
  void notifyPipeline.setOutputDevice(deviceId)
  localStorage.setItem('tsweb:sinkId', deviceId)
}

export function getStoredSinkId() {
  return localStorage.getItem('tsweb:sinkId') || ''
}
