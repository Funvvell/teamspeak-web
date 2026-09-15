import {
  Activity,
  Bell,
  Bolt,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleUser,
  Crown,
  Gamepad2,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Music2,
  Radio,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Signal,
  Star,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
} from 'lucide-react'

export type IconProps = {
  size?: number
  className?: string
  style?: React.CSSProperties
}

const base = (size = 16) => ({ width: size, height: size })

export const IcSearch = (p: IconProps) => <Search {...base(p.size)} className={p.className} style={p.style} />
export const IcBolt = (p: IconProps) => <Bolt {...base(p.size)} className={p.className} style={p.style} />
export const IcDns = (p: IconProps) => <Radio {...base(p.size)} className={p.className} style={p.style} />
export const IcKey = (p: IconProps) => <Shield {...base(p.size)} className={p.className} style={p.style} />
export const IcBadge = (p: IconProps) => <CircleUser {...base(p.size)} className={p.className} style={p.style} />
export const IcLogin = (p: IconProps) => <Zap {...base(p.size)} className={p.className} style={p.style} />
export const IcBookmark = (p: IconProps) => <Star {...base(p.size)} className={p.className} style={p.style} />
export const IcVolumeUp = (p: IconProps) => <Volume2 {...base(p.size)} className={p.className} style={p.style} />
export const IcVolumeOff = (p: IconProps) => <VolumeX {...base(p.size)} className={p.className} style={p.style} />
export const IcMic = (p: IconProps) => <Mic {...base(p.size)} className={p.className} style={p.style} />
export const IcMicOff = (p: IconProps) => <MicOff {...base(p.size)} className={p.className} style={p.style} />
export const IcHeadset = (p: IconProps) => <Headphones {...base(p.size)} className={p.className} style={p.style} />
export const IcHeadsetOff = (p: IconProps) => <HeadphoneOff {...base(p.size)} className={p.className} style={p.style} />
export const IcShield = (p: IconProps) => <Shield {...base(p.size)} className={p.className} style={p.style} />
export const IcStar = (p: IconProps) => <Star {...base(p.size)} className={p.className} style={p.style} />
export const IcUsers = (p: IconProps) => <Users {...base(p.size)} className={p.className} style={p.style} />
export const IcShieldPerson = (p: IconProps) => <ShieldCheck {...base(p.size)} className={p.className} style={p.style} />
export const IcPriority = (p: IconProps) => <Crown {...base(p.size)} className={p.className} style={p.style} />
export const IcGame = (p: IconProps) => <Gamepad2 {...base(p.size)} className={p.className} style={p.style} />
export const IcBell = (p: IconProps) => <Bell {...base(p.size)} className={p.className} style={p.style} />
export const IcMusic = (p: IconProps) => <Music2 {...base(p.size)} className={p.className} style={p.style} />
export const IcSettings = (p: IconProps) => <Settings2 {...base(p.size)} className={p.className} style={p.style} />
export const IcTune = (p: IconProps) => <Settings2 {...base(p.size)} className={p.className} style={p.style} />
export const IcWave = (p: IconProps) => <Activity {...base(p.size)} className={p.className} style={p.style} />
export const IcWifi = (p: IconProps) => <Wifi {...base(p.size)} className={p.className} style={p.style} />
export const IcBot = (p: IconProps) => <Bot {...base(p.size)} className={p.className} style={p.style} />
export const IcCheck = (p: IconProps) => <CheckCircle2 {...base(p.size)} className={p.className} style={p.style} />
export const IcChevron = (p: IconProps) => <ChevronRight {...base(p.size)} className={p.className} style={p.style} />
export const IcSignal = (p: IconProps) => <Signal {...base(p.size)} className={p.className} style={p.style} />

/** Decorative waveform bars for talking state */
export function WaveBars({ active, level = 0.6 }: { active?: boolean; level?: number }) {
  const heights = [8, 16, 10, 22, 14, 20, 9, 18, 12, 16, 7, 14]
  return (
    <div className={`wave-bars${active ? '' : ' idle'}`} aria-hidden="true">
      {heights.map((h, i) => (
        <i
          key={i}
          style={{
            height: active ? `${Math.max(4, Math.round(h * (0.4 + level * 0.8)))}px` : '3px',
          }}
        />
      ))}
    </div>
  )
}

/** Segmented LED meter */
export function LedMeter({ db, threshold }: { db: number; threshold: number }) {
  // Map -60..0 dB to 0..32 segments
  const segs = 32
  const norm = Math.max(0, Math.min(1, (db + 60) / 60))
  const onCount = Math.round(norm * segs)
  const thrPct = Math.max(0, Math.min(100, ((threshold + 60) / 60) * 100))
  return (
    <div className="led-meter" role="meter" aria-valuenow={db} aria-valuemin={-60} aria-valuemax={0}>
      {Array.from({ length: segs }, (_, i) => {
        const p = (i + 1) / segs
        const cls =
          i < onCount
            ? p > 0.92
              ? 'clip'
              : p > 0.8
                ? 'warm'
                : 'on'
            : ''
        return <i key={i} className={cls} />
      })}
      <div className="led-threshold" style={{ left: `calc(${thrPct}% - 1px)` }} />
    </div>
  )
}

/** Bottom VU bars */
export function VuBars({ level }: { level: number }) {
  const n = 10
  const on = Math.round(level * n)
  return (
    <div className="vu-bars" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          className={
            i < on ? (i >= n - 2 ? 'clip' : i >= n - 4 ? 'hot' : 'on') : ''
          }
        />
      ))}
    </div>
  )
}
