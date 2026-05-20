/**
 * ActivityParticleOverlay — full-grid particle pulse on every ActivityEvent.
 *
 * Sits on top of the RunCard grid as an absolutely-positioned `<canvas>` and
 * spawns a short-lived burst of particles emanating from the centre of the
 * card whose `run_id` matches the incoming event. Uses the existing
 * `ParticlePool` / `BurstEmitter` from `components/particles/engine/`.
 *
 * Severity → color mapping mirrors `LogLine`:
 *   info     → blue
 *   success  → green
 *   warn     → amber
 *   error    → red
 *   debug    → gray
 *
 * Performance / throttling
 *   - The overlay maintains a single 1024-particle pool, a single rAF loop.
 *   - We only spawn while the user has the overlay enabled
 *     (`particleOverlayEnabledAtom`).
 *   - When the incoming event-rate exceeds `BURST_THROTTLE_PER_SEC` we
 *     collapse the next N events into a single aggregated burst per cell
 *     (per `run_id`) so the CPU cost stays bounded.
 *   - When no card matches a `run_id`, the event is dropped silently (e.g.
 *     CRUD events without a runId).
 *
 * The overlay is fully presentational and tracked by `data-run-id` attributes
 * the page sets on every RunCard wrapper.
 */

import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import type { ActivityEvent } from '@/types'
import { particleOverlayEnabledAtom } from '@/atoms'
import { BurstEmitter } from '@/components/particles/engine/emitters'
import { ParticleEngine } from '@/components/particles/engine/ParticleEngine'
import { ParticlePool } from '@/components/particles/engine/ParticlePool'

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Max bursts per second across the whole overlay. Above this we aggregate. */
const BURST_THROTTLE_PER_SEC = 30
/** Pool size — comfortably above peak (≈100 events × 4 particles each). */
const POOL_SIZE = 1024
/** Particles per single event burst. */
const BURST_COUNT_SINGLE = 6
/** Particles when collapsing N events into one aggregated burst. */
const BURST_COUNT_AGGREGATED = 12
/** Particle radius (px). */
const PARTICLE_SIZE = 2.5
/** Particle lifetime (s). */
const PARTICLE_LIFE = 0.6
/** Initial speed magnitude (px/s). */
const BURST_SPEED = 90

const SEVERITY_COLORS: Record<string, string> = {
  info: '#60a5fa',
  success: '#4ade80',
  warn: '#facc15',
  error: '#f87171',
  debug: '#9ca3af',
}

// ---------------------------------------------------------------------------
// Severity derivation (kept local — duplicated from ActivityLog to avoid
// importing the whole module from the overlay)
// ---------------------------------------------------------------------------

function severityFor(evt: ActivityEvent): keyof typeof SEVERITY_COLORS {
  switch (evt.kind) {
    case 'runner': {
      const name = evt.event.event
      if (
        name === 'task_failed' ||
        name === 'runner_error' ||
        name === 'cwd_mismatch'
      )
        return 'error'
      if (name === 'task_timeout' || name === 'budget_exceeded') return 'warn'
      if (
        name === 'plan_completed' ||
        name === 'task_completed' ||
        name === 'wave_completed'
      )
        return 'success'
      return 'info'
    }
    case 'protocol_progress':
      if (evt.status === 'failed') return 'error'
      if (evt.status === 'completed') return 'success'
      if (evt.status === 'cancelled') return 'warn'
      return 'info'
    case 'chat': {
      const t = evt.event.type
      if (t === 'error' || t === 'session_error') return 'error'
      if (t === 'retrying') return 'warn'
      if (t === 'result') return 'success'
      return 'info'
    }
    case 'crud':
      return evt.action === 'deleted' ? 'warn' : 'info'
    default:
      return 'info'
  }
}

function runIdOf(evt: ActivityEvent): string | null {
  if (evt.kind === 'runner') return evt.run_id
  if (evt.kind === 'protocol_progress') return evt.run_id
  if (evt.kind === 'chat') return evt.run_id ?? evt.session_id ?? null
  return null
}

// ---------------------------------------------------------------------------
// Overlay component
// ---------------------------------------------------------------------------

export interface ActivityParticleOverlayProps {
  /** Live events buffer — newest last. */
  events: ActivityEvent[]
  /** Element whose `getBoundingClientRect()` is the overlay's reference frame. */
  gridRef: React.RefObject<HTMLElement | null>
  className?: string
}

interface PendingBurst {
  x: number
  y: number
  color: string
  count: number
  events: number // how many events were aggregated here
}

export function ActivityParticleOverlay({
  events,
  gridRef,
  className = '',
}: ActivityParticleOverlayProps) {
  const enabled = useAtomValue(particleOverlayEnabledAtom)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<ParticleEngine | null>(null)
  const lastSeenSeqRef = useRef<number>(0)
  const pendingRef = useRef<Map<string, PendingBurst>>(new Map())
  /** Sliding window timestamps (ms) of recent bursts — used to detect throttle threshold. */
  const burstWindowRef = useRef<number[]>([])
  const rafRef = useRef<number>(0)

  // ── Lifecycle: build engine, run rAF loop ────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    const gridEl = gridRef.current
    if (!canvas || !gridEl) return

    const pool = new ParticlePool(POOL_SIZE)
    const engine = new ParticleEngine(pool, 0.94)
    engineRef.current = engine

    let cssW = gridEl.clientWidth
    let cssH = gridEl.clientHeight
    const setupCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      const w = gridEl.clientWidth
      const h = gridEl.clientHeight
      cssW = w
      cssH = h
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    setupCanvas()

    const ro = new ResizeObserver(() => setupCanvas())
    ro.observe(gridEl)

    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      // Flush any pending aggregated bursts.
      if (pendingRef.current.size > 0) {
        for (const burst of pendingRef.current.values()) {
          BurstEmitter.emit(
            pool,
            {
              position: { x: burst.x, y: burst.y },
              rate: 0,
              spread: 0,
              angle: 0,
              speed: BURST_SPEED,
              config: {
                color: burst.color,
                size: PARTICLE_SIZE,
                maxLife: PARTICLE_LIFE,
                opacity: 1,
              },
            },
            { count: burst.count, jitter: 0.4 },
          )
        }
        pendingRef.current.clear()
      }

      engine.step(dt, now / 1000)

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, cssW, cssH)
        pool.forEachActive((p) => {
          const alpha = Math.max(0, Math.min(1, p.life)) * p.opacity
          ctx.globalAlpha = alpha
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      engineRef.current = null
      pool.reset()
    }
  }, [enabled, gridRef])

  // ── Event-driven spawning ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      // Sync the cursor anyway so re-enabling doesn't replay history.
      const last = events[events.length - 1]
      if (last) lastSeenSeqRef.current = Math.max(lastSeenSeqRef.current, last.seq)
      return
    }
    const gridEl = gridRef.current
    if (!gridEl) return
    const gridRect = gridEl.getBoundingClientRect()

    // Trim the throttle window to the last 1s.
    const now = performance.now()
    const cutoff = now - 1000
    const win = burstWindowRef.current
    while (win.length > 0 && win[0] < cutoff) win.shift()

    let cursor = lastSeenSeqRef.current
    for (const evt of events) {
      if (evt.seq <= cursor) continue
      cursor = evt.seq
      const runId = runIdOf(evt)
      if (!runId) continue

      // Find the card by data attribute.
      const card = gridEl.querySelector<HTMLElement>(`[data-run-id="${cssEscape(runId)}"]`)
      if (!card) continue
      const r = card.getBoundingClientRect()
      const cx = r.left + r.width / 2 - gridRect.left
      const cy = r.top + r.height / 2 - gridRect.top
      // Skip if the card is fully outside the visible grid (perf).
      if (cx < -50 || cy < -50 || cx > gridRect.width + 50 || cy > gridRect.height + 50) {
        continue
      }

      const sev = severityFor(evt)
      const color = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS.info

      const throttled = win.length >= BURST_THROTTLE_PER_SEC
      if (throttled) {
        // Aggregate into the pending bucket for this card.
        const key = runId
        const prev = pendingRef.current.get(key)
        if (prev) {
          prev.events += 1
          prev.count = Math.min(BURST_COUNT_AGGREGATED, prev.count + 2)
          // Highest-severity wins for the merged color.
          if (severityRank(sev) > severityRank(colorToSeverity(prev.color))) {
            prev.color = color
          }
        } else {
          pendingRef.current.set(key, {
            x: cx,
            y: cy,
            color,
            count: BURST_COUNT_AGGREGATED,
            events: 1,
          })
        }
      } else {
        win.push(now)
        const engine = engineRef.current
        if (engine) {
          BurstEmitter.emit(
            engine.pool,
            {
              position: { x: cx, y: cy },
              rate: 0,
              spread: 0,
              angle: 0,
              speed: BURST_SPEED,
              config: {
                color,
                size: PARTICLE_SIZE,
                maxLife: PARTICLE_LIFE,
                opacity: 1,
              },
            },
            { count: BURST_COUNT_SINGLE, jitter: 0.25 },
          )
        }
      }
    }
    lastSeenSeqRef.current = cursor
  }, [events, enabled, gridRef])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-10 ${className}`}
    />
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cssEscape(s: string): string {
  // Minimal CSS attribute selector escaping — run_ids are UUIDs so we only
  // need to defend against `"`/`\` defensively.
  return s.replace(/["\\]/g, '\\$&')
}

const SEVERITY_RANK: Record<string, number> = {
  debug: 0,
  info: 1,
  success: 2,
  warn: 3,
  error: 4,
}

function severityRank(s: string): number {
  return SEVERITY_RANK[s] ?? 0
}

function colorToSeverity(color: string): string {
  for (const [k, v] of Object.entries(SEVERITY_COLORS)) {
    if (v === color) return k
  }
  return 'info'
}

export default ActivityParticleOverlay
