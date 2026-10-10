/**
 * CompactionFlow — the live trace of a context compaction, drawn INSIDE the conversation that is
 * being compacted (at the tail of its transcript), never over the composer.
 *
 * An accretion disc seen at a tilt: matter spirals into a dense core, heating from indigo to
 * white-cyan as it falls. Layers, back to front: ambient glow, far half of the disc, the core
 * (halo, photon ring, hot centre), near half of the disc. All additive ('lighter'), so overlaps
 * bloom instead of muddying. Each particle leaves a velocity streak sampled from its own past.
 *
 * `prefers-reduced-motion`: one still frame. The loop also stops while the tab is hidden.
 * When `compact_boundary` arrives this unmounts and CompactBoundaryBlock takes its place.
 */

import { useEffect, useRef } from 'react'
import { useT } from '@/i18n'
import { corePulse, disc, heatColor, makeParticles, poseAt, type Particle } from './compactionParticles'

const HEIGHT = 96
const PARTICLES = 150
/** How far back (ms) the streak of a particle reaches. */
const STREAK_MS = 90
const STILL_AT_MS = 1500

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function drawCore(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const { cx, cy, a, b } = disc(w, h)
  const pulse = corePulse(t)
  // Wide halo.
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, a * 0.5)
  halo.addColorStop(0, `rgba(125, 140, 255, ${0.16 + 0.1 * pulse})`)
  halo.addColorStop(0.4, 'rgba(99, 102, 241, 0.06)')
  halo.addColorStop(1, 'rgba(99, 102, 241, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, w, h)
  // Photon ring: a thin ellipse turning slowly, with a bright arc that sweeps around it.
  const ringR = 0.075
  const sweep = (t / 1400) % (Math.PI * 2)
  ctx.lineWidth = 1
  ctx.strokeStyle = `rgba(165, 180, 252, ${0.18 + 0.12 * pulse})`
  ctx.beginPath()
  ctx.ellipse(cx, cy, a * ringR, b * ringR * 1.9, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = `rgba(236, 254, 255, ${0.55 + 0.3 * pulse})`
  ctx.beginPath()
  ctx.ellipse(cx, cy, a * ringR, b * ringR * 1.9, 0, sweep, sweep + 0.9)
  ctx.stroke()
  // Hot centre.
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 11 + 3 * pulse)
  core.addColorStop(0, `rgba(255, 255, 255, ${0.9 * pulse + 0.1})`)
  core.addColorStop(0.35, `rgba(186, 230, 253, ${0.5 * pulse})`)
  core.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, 14, 0, Math.PI * 2)
  ctx.fill()
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], w: number, h: number, t: number, near: boolean) {
  ctx.lineCap = 'round'
  for (const p of particles) {
    const now = poseAt(p, t, w, h)
    if (now.alpha <= 0.02 || now.depth > 0 !== near) continue
    const past = poseAt(p, t - STREAK_MS, w, h)
    const rgb = heatColor(now.heat)
    // A loop wrap would draw a streak across the whole field: skip the frame it wraps on.
    const jump = Math.hypot(now.x - past.x, now.y - past.y)
    if (jump < w * 0.25) {
      const grad = ctx.createLinearGradient(past.x, past.y, now.x, now.y)
      grad.addColorStop(0, `rgba(${rgb}, 0)`)
      grad.addColorStop(1, `rgba(${rgb}, ${(now.alpha * 0.9).toFixed(3)})`)
      ctx.strokeStyle = grad
      ctx.lineWidth = Math.max(0.6, now.radius * 1.1)
      ctx.beginPath()
      ctx.moveTo(past.x, past.y)
      ctx.lineTo(now.x, now.y)
      ctx.stroke()
    }
    // The head: a soft dot, brighter than its streak.
    ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, now.alpha).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(now.x, now.y, now.radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, particles: Particle[]) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  drawParticles(ctx, particles, w, h, t, false) // far half, behind the core
  drawCore(ctx, w, h, t)
  drawParticles(ctx, particles, w, h, t, true) // near half, in front
  ctx.globalCompositeOperation = 'source-over'
}

export function CompactionFlow() {
  const { t } = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext?.('2d') ?? null
    if (!host || !canvas || !ctx) return // no canvas (tests, very old browsers): the label still says it

    const particles = makeParticles(PARTICLES)
    const still = reducedMotion()
    let w = 0
    let raf = 0
    let start = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = host.clientWidth
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.round(HEIGHT * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const frame = (now: number) => {
      if (!start) start = now
      draw(ctx, w, HEIGHT, now - start, particles)
      if (!document.hidden) raf = requestAnimationFrame(frame)
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!still && !document.hidden) raf = requestAnimationFrame(frame)
    }

    resize()
    if (still) draw(ctx, w, HEIGHT, STILL_AT_MS, particles)
    else raf = requestAnimationFrame(frame)

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            resize()
            if (still) draw(ctx, w, HEIGHT, STILL_AT_MS, particles)
          })
        : null
    ro?.observe(host)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div
      ref={hostRef}
      role="status"
      aria-live="polite"
      data-testid="compaction-flow"
      className="relative my-2 select-none overflow-hidden rounded-lg"
      style={{ height: HEIGHT }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 w-full" style={{ height: HEIGHT }} />
      <span className="absolute inset-x-0 bottom-1 text-center text-[11px] tracking-wide text-indigo-200/70">
        {t('chatA-messages.compaction.label')}
      </span>
    </div>
  )
}
