/**
 * CompactionFlow — the live trace of a context compaction, drawn INSIDE the conversation that is
 * being compacted (at the tail of its transcript), never over the composer.
 *
 * A field of particles is drawn into a dense core: the context window collapsing into its summary.
 * When the `compact_boundary` event arrives this block unmounts and CompactBoundaryBlock takes its
 * place in the transcript.
 *
 * `prefers-reduced-motion`: one still frame, no loop. The loop also stops while the tab is hidden.
 */

import { useEffect, useRef } from 'react'
import { corePulse, makeParticles, poseAt } from './compactionParticles'

const HEIGHT = 72
const PARTICLES = 64
/** Indigo-400, the same hue as the streaming dots. */
const RGB = '129, 140, 248'

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, particles: ReturnType<typeof makeParticles>) {
  ctx.clearRect(0, 0, w, h)
  const pulse = corePulse(t)
  const core = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 26)
  core.addColorStop(0, `rgba(${RGB}, ${0.35 + 0.3 * pulse})`)
  core.addColorStop(1, `rgba(${RGB}, 0)`)
  ctx.fillStyle = core
  ctx.fillRect(w / 2 - 30, h / 2 - 30, 60, 60)
  for (const p of particles) {
    const pose = poseAt(p, t, w, h)
    if (pose.alpha <= 0.01) continue
    ctx.beginPath()
    ctx.fillStyle = `rgba(${RGB}, ${(pose.alpha * 0.85).toFixed(3)})`
    ctx.arc(pose.x, pose.y, pose.radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function CompactionFlow() {
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
      if (!still && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!still && !document.hidden) raf = requestAnimationFrame(frame)
    }

    resize()
    // A still frame is drawn at 40 % of the loop: particles mid-flight, core visible.
    if (still) draw(ctx, w, HEIGHT, 1000, particles)
    else raf = requestAnimationFrame(frame)

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { resize(); if (still) draw(ctx, w, HEIGHT, 1000, particles) }) : null
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
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" style={{ height: HEIGHT }} />
      <span className="absolute inset-x-0 bottom-1 text-center text-[11px] text-gray-400">Compacting context</span>
    </div>
  )
}
