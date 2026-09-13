import { useEffect, useRef } from 'react'

/**
 * GradientWaves 风格背景（Canvas 2D 实现，零依赖）
 * 紫色地平线 → 粉色涌浪 → 白色波峰，慢速流动 + 迷雾 + 颗粒 + 鼠标视差
 * 配色对齐用户给的 GradientWaves 参数：horizon #5227FF / wave #FF9FFC / crest #FFFFFF
 */
export function WavesBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    const t0 = performance.now()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // 层配置：每层一条正弦带（远处紫 → 近处粉），颜色按用户给定渐变
    const layers = [
      { color: 'rgba(82, 39, 255, 0.20)', speed: 0.22, amp: 46, wave: 620, phase: 0.0, crest: 0 },
      { color: 'rgba(112, 60, 255, 0.22)', speed: 0.26, amp: 58, wave: 520, phase: 1.3, crest: 0 },
      { color: 'rgba(152, 84, 255, 0.24)', speed: 0.30, amp: 68, wave: 460, phase: 2.6, crest: 0 },
      { color: 'rgba(196, 116, 255, 0.26)', speed: 0.34, amp: 78, wave: 400, phase: 0.8, crest: 0 },
      { color: 'rgba(233, 142, 255, 0.30)', speed: 0.38, amp: 86, wave: 350, phase: 2.1, crest: 1 },
      { color: 'rgba(255, 159, 252, 0.34)', speed: 0.42, amp: 92, wave: 300, phase: 3.4, crest: 1 },
      { color: 'rgba(255, 190, 254, 0.32)', speed: 0.46, amp: 84, wave: 260, phase: 1.6, crest: 1 },
      { color: 'rgba(255, 224, 255, 0.40)', speed: 0.5, amp: 72, wave: 230, phase: 4.1, crest: 1 },
    ]

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener(
      'pointermove',
      (e) => {
        mouse.tx = e.clientX / window.innerWidth
        mouse.ty = e.clientY / window.innerHeight
      },
      { passive: true },
    )

    const grain = () => {
      const n = 140
      for (let i = 0; i < n; i++) {
        const x = Math.random() * w
        const y = Math.random() * h
        const a = Math.random() * 0.05
        ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(82,39,255,${a * 0.6})`
        ctx.fillRect(x, y, 1.4, 1.4)
      }
    }

    const waveY = (base: number, t: number, l: typeof layers[number], px: number) => {
      // 基础波 + 次谐波（turbulence 感）
      return (
        base +
        Math.sin((px / l.wave) * Math.PI * 2 + t * l.speed + l.phase) * l.amp +
        Math.sin((px / (l.wave * 0.6)) * Math.PI * 2 + t * l.speed * 1.7 + l.phase * 2) * l.amp * 0.28
      )
    }

    const draw = (now: number) => {
      const t = reduce ? 0 : (now - t0) / 1000
      mouse.x += (mouse.tx - mouse.x) * 0.04
      mouse.y += (mouse.ty - mouse.y) * 0.04
      const px = (mouse.x - 0.5) * 2 * 0.5 // parallaxStrength 0.5
      const py = (mouse.y - 0.5) * 2 * 0.3

      ctx.clearRect(0, 0, w, h)

      // 雾底：顶部白 → 地平线淡紫（给毛玻璃可透的晕染底色）
      const fog = ctx.createLinearGradient(0, 0, 0, h)
      fog.addColorStop(0, 'rgba(255,255,255,0.98)')
      fog.addColorStop(0.42, 'rgba(240, 236, 255, 0.9)')
      fog.addColorStop(0.72, 'rgba(222, 212, 255, 0.55)')
      fog.addColorStop(1, 'rgba(180, 150, 255, 0.35)')
      ctx.fillStyle = fog
      ctx.fillRect(0, 0, w, h)

      // 波浪带：从地平线（约 62% 高度）向下涌向观察者
      const horizon = h * 0.62 + py * h * 0.05
      const total = layers.length
      layers.forEach((l, i) => {
        const depth = i / (total - 1) // 0 远 → 1 近
        const base = horizon + depth * (h * 0.5)
        const pxOff = px * (40 + depth * 120)
        ctx.beginPath()
        const step = Math.max(8, Math.round(w / 90))
        ctx.moveTo(-10, waveY(base, t, l, -10 - pxOff) - 40 * depth)
        for (let x = 0; x <= w + 10; x += step) {
          ctx.lineTo(x, waveY(base, t, l, x - pxOff))
        }
        ctx.lineTo(w + 10, h + 10)
        ctx.lineTo(-10, h + 10)
        ctx.closePath()
        ctx.fillStyle = l.color
        ctx.fill()

        // 白色波峰高光
        if (l.crest) {
          ctx.beginPath()
          ctx.moveTo(-10, waveY(base, t, l, -10 - pxOff))
          for (let x = 0; x <= w + 10; x += step) {
            ctx.lineTo(x, waveY(base, t, l, x - pxOff))
          }
          ctx.strokeStyle = `rgba(255,255,255,${0.5 + depth * 0.3})`
          ctx.lineWidth = 1.6 + depth * 1.2
          ctx.stroke()
        }
      })

      // 底部近景白浪（crest 白占主体，柔化）
      const near = ctx.createLinearGradient(0, h - 130, 0, h)
      near.addColorStop(0, 'rgba(255,255,255,0.0)')
      near.addColorStop(1, 'rgba(255,255,255,0.5)')
      ctx.fillStyle = near
      ctx.fillRect(0, h - 130, w, 130)

      // 颗粒（grainIntensity 0.05）
      grain()
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      className="waves-bg"
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  )
}
