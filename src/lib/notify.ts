import { sinkIdSupported } from './voice-pipeline'

/**
 * Lightweight shared AudioContext used only for notification beeps.
 * Deliberately does NOT create a VoicePipeline — that would spin up a second
 * full voice stack (worklet/encoder path + AudioContext) and fight the mic
 * pipeline for AEC / output device. Beeps need an oscillator + gain only.
 */
let beepCtx: AudioContext | null = null
let beepGain: GainNode | null = null
let storedSinkId = localStorage.getItem('tsweb:sinkId') || ''
let soundsOn = localStorage.getItem('tsweb:sounds') !== '0'

type AudioCtxWithSink = AudioContext & {
  setSinkId?(id: string): Promise<void>
}

function ensureBeepCtx(): AudioContext {
  if (!beepCtx || beepCtx.state === 'closed') {
    beepCtx = new AudioContext()
    beepGain = beepCtx.createGain()
    beepGain.gain.value = 1
    beepGain.connect(beepCtx.destination)
    if (storedSinkId && sinkIdSupported()) {
      void (beepCtx as AudioCtxWithSink).setSinkId?.(storedSinkId).catch(() => {})
    }
  }
  // Autoplay policy: resume if a prior gesture left us suspended.
  if (beepCtx.state === 'suspended') void beepCtx.resume()
  return beepCtx
}

/**
 * @deprecated No-op. Notify no longer attaches the mic VoicePipeline;
 * beeps use their own lightweight AudioContext. Kept so older call sites
 * (mic.ts) remain source-compatible during the parallel merge.
 */
export function attachNotifyPipeline(_p: unknown) {
  /* intentionally empty */
}

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

function beepOnce(freq: number, durationSec: number, gain: number) {
  const ctx = ensureBeepCtx()
  if (!beepGain) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  const t = ctx.currentTime
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + durationSec)
  osc.connect(g)
  g.connect(beepGain)
  osc.start(t)
  osc.stop(t + durationSec + 0.02)
}

export function playNotify(kind: BeepKind) {
  if (!soundsOn) return
  const b = BEEPS[kind]
  try {
    beepOnce(b.freq, b.dur, b.gain)
    // poke: double blip
    if (kind === 'poke') {
      setTimeout(() => {
        try {
          beepOnce(1400, 0.04, b.gain)
        } catch {
          /* autoplay policies */
        }
      }, 70)
    }
  } catch {
    /* autoplay policies */
  }
}

/**
 * Route notify beeps to a specific output device.
 * Applied only to the shared beep AudioContext — voice audio routing is
 * handled separately via mic.setOutputDevice / the voice pipeline.
 */
export function applySinkId(deviceId: string) {
  storedSinkId = deviceId || ''
  localStorage.setItem('tsweb:sinkId', storedSinkId)
  if (beepCtx && beepCtx.state !== 'closed' && sinkIdSupported()) {
    void (beepCtx as AudioCtxWithSink).setSinkId?.(storedSinkId).catch(() => {})
  }
}

export function getStoredSinkId() {
  return localStorage.getItem('tsweb:sinkId') || ''
}
