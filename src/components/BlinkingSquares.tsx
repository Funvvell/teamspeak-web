import { useEffect, useRef } from 'react'

/**
 * BlinkingSquares —— 原创等效实现（ReactBits Pro "Blinking Squares" 免费替代）
 * 网格小方块轻柔闪烁，沿 direction 方向密度渐变
 * props API 对齐官方：direction/gridSize/squareSize/fadeStart/fadeEnd/falloff/
 * minBrightness/twinkleSpeed/twinkleStrength/intensity/opacity/squareColor/backgroundColor/dpr
 */
interface BlinkingSquaresProps {
  direction?: 'right' | 'left' | 'top' | 'bottom'
  gridSize?: number
  squareSize?: number
  fadeStart?: number
  fadeEnd?: number
  falloff?: number
  minBrightness?: number
  twinkleSpeed?: number
  twinkleStrength?: number
  intensity?: number
  opacity?: number
  squareColor?: string
  backgroundColor?: string
  dpr?: number
}

// 稳定伪随机（cell 持久）
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function BlinkingSquares({
  direction = 'right',
  gridSize = 52,
  squareSize = 0.57,
  fadeStart = 0.65,
  fadeEnd = 1,
  falloff = 1.25,
  minBrightness = 0.55,
  twinkleSpeed = 1.4,
  twinkleStrength = 0.94,
  intensity = 1,
  opacity = 1,
  squareColor = '#BB29FF',
  backgroundColor = '#F4F0FF',
  dpr = 1.5,
}: BlinkingSquaresProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!ctx2d(canvas)) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let w = 0
    let h = 0
    const t0 = performance.now()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const d = Math.min(window.devicePixelRatio || 1, dpr)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * d)
      canvas.height = Math.round(h * d)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(d, 0, 0, d, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const parseColor = (hex: string) => {
      const m = hex.replace('#', '')
      const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
      const n = parseInt(full, 16)
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }
    const sq = parseColor(squareColor)
    const bg = parseColor(backgroundColor)

    const draw = (now: number) => {
      const t = reduce ? 0 : (now - t0) / 1000
      // 背景
      ctx.fillStyle = `rgba(${bg.r},${bg.g},${bg.b},${opacity})`
      ctx.fillRect(0, 0, w, h)

      // 网格布局：沿长轴 gridSize 格
      const horizontal = direction === 'right' || direction === 'left'
      const cols = horizontal ? gridSize : Math.max(8, Math.round((gridSize * h) / Math.max(w, 1)))
      const rows = horizontal ? Math.max(8, Math.round((gridSize * h) / Math.max(w, 1))) : gridSize
      const cellW = w / cols
      const cellH = h / rows
      const fill = Math.max(1, Math.min(cellW, cellH) * squareSize)

      // 密度沿 direction 的坐标（0..1）
      const coord = (ci: number, ri: number) => {
        if (direction === 'right') return ci / (cols - 1)
        if (direction === 'left') return 1 - ci / (cols - 1)
        if (direction === 'top') return 1 - ri / (rows - 1)
        return ri / (rows - 1)
      }
      const ramp = (u: number) => {
        if (u <= fadeStart) return 0
        if (u >= fadeEnd) return 1
        return Math.pow((u - fadeStart) / (fadeEnd - fadeStart), falloff)
      }

      let lit = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seed = r * cols + c
          const density = ramp(coord(c, r))
          if (hash(seed * 1.7 + 0.3) >= density) continue
          // 亮度：minBrightness..1，闪烁振荡
          let b = minBrightness + hash(seed * 2.3 + 5.1) * (1 - minBrightness)
          const ph = hash(seed * 3.1 + 7.7) * Math.PI * 2
          const tw = 0.5 + 0.5 * Math.sin(t * twinkleSpeed * Math.PI * 2 + ph)
          b *= 1 - twinkleStrength + twinkleStrength * tw
          b *= intensity
          if (b <= 0.01) continue
          const a = Math.min(1, b) * opacity
          ctx.fillStyle = `rgba(${sq.r},${sq.g},${sq.b},${a})`
          ctx.fillRect(c * cellW + (cellW - fill) / 2, r * cellH + (cellH - fill) / 2, fill, fill)
          lit++
        }
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [direction, gridSize, squareSize, fadeStart, fadeEnd, falloff, minBrightness, twinkleSpeed, twinkleStrength, intensity, opacity, squareColor, backgroundColor, dpr])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  )
}

function ctx2d(canvas: HTMLCanvasElement | null): canvas is HTMLCanvasElement {
  return !!canvas && !!canvas.getContext('2d')
}
