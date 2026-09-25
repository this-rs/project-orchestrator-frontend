// ============================================================================
// useRenderLoop — on-demand rendering for ForceGraph3D
// ============================================================================
//
// WHY
//   `3d-force-graph` drives an unconditional `requestAnimationFrame` loop
//   (`_animationCycle`): every frame it runs `tickFrame()` (layout + particles)
//   and `renderObjs.tick()` (controls.update + renderer.render + hover
//   raycast). `cooldownTicks` / `cooldownTime` only stop the *force
//   simulation* — the loop keeps redrawing a perfectly static scene at 60 fps
//   forever. On a phone that is a constant GPU+CPU load and the main reason
//   the device heats up.
//
// WHAT THIS DOES
//   Nothing is removed from the scene. We only stop *redrawing* an image that
//   cannot have changed, and we redraw as soon as anything can make it change.
//
//   `pauseAnimation()` / `resumeAnimation()` are the library's own API.
//   `resumeAnimation()` runs `_animationCycle()` synchronously (= renders one
//   frame) and then schedules the next rAF, so `resume(); pause();` renders
//   exactly one frame — that is our single-frame primitive.
//
// THE RISK THIS FILE IS BUILT AROUND
//   A missed wake-up freezes the graph, which is worse than the heat. Two
//   layers of defence:
//     1. an explicit, exhaustive wake-up inventory (see `wake()` call sites in
//        IntelligenceGraph3D.tsx and useActivationSync.ts);
//     2. a 1 Hz safety heartbeat while idle and on screen, which renders one
//        single frame. It costs ~1/60th of the continuous loop and bounds any
//        missed wake-up to ~1 s of staleness instead of "frozen forever".
// ============================================================================

import { useCallback, useEffect, useRef } from 'react'

// ── Timings ──────────────────────────────────────────────────────────────────

/** Keep rendering this long after a pointer/wheel/controls interaction. */
export const WAKE_INTERACTION_MS = 1200
/** Keep rendering this long after an imperative scene mutation. */
export const WAKE_MUTATION_MS = 400
/** Keep rendering this long after new graph data arrives. */
export const WAKE_DATA_MS = 2500
/** How often we re-evaluate the policy while the loop is running. */
const POLL_MS = 250
/** Single-frame heartbeat period while idle (safety net, see header). */
const HEARTBEAT_MS = 1000
/** Retry period while the ForceGraph3D instance is not mounted yet. */
const NOT_READY_RETRY_MS = 200

// ── Policy (pure — unit tested) ──────────────────────────────────────────────

export interface RenderLoopInput {
  /** `document.hidden` — tab in background / screen locked. */
  documentHidden: boolean
  /** IntersectionObserver: the canvas intersects the viewport. */
  onScreen: boolean
  /** The d3-force layout is still ticking (node positions move every frame). */
  engineRunning: boolean
  /** The scene contains link particles, which move on every frame. */
  particlesAnimating: boolean
  /** `performance.now()` */
  now: number
  /** Render continuously at least until this timestamp. */
  keepAliveUntil: number
}

/**
 * Should the library's rAF loop be running right now?
 *
 * Note on `engineRunning` + `documentHidden`: the force layout's stop
 * condition is wall-clock (`Date.now() - startTickTime > cooldownTime`), so
 * pausing mid-layout can cut the layout short. We accept that only when the
 * document is hidden — browsers already stop firing rAF for hidden documents,
 * so this is the behaviour that happens anyway, with or without this hook.
 * When the component is merely scrolled off screen we keep rendering until the
 * layout has settled.
 */
export function shouldRenderContinuously(i: RenderLoopInput): boolean {
  if (i.documentHidden) return false
  if (i.engineRunning) return true
  if (!i.onScreen) return false
  if (i.particlesAnimating) return true
  return i.now < i.keepAliveUntil
}

/** Should we emit the idle single-frame heartbeat? */
export function shouldHeartbeat(i: Pick<RenderLoopInput, 'documentHidden' | 'onScreen'>): boolean {
  return !i.documentHidden && i.onScreen
}

// ── Ref surface we need from ForceGraph3D ────────────────────────────────────

export interface RenderLoopControls {
  addEventListener?: (type: string, fn: () => void) => void
  removeEventListener?: (type: string, fn: () => void) => void
}

export interface RenderLoopGraphRef {
  pauseAnimation?: () => unknown
  resumeAnimation?: () => unknown
  controls?: () => RenderLoopControls | undefined
}

export interface RenderLoopHandle {
  /** Wake the loop and keep it running for at least `ms`. Always safe to call. */
  wake: (ms?: number) => void
  /** Report the force-layout state (from onEngineTick / onEngineStop). */
  setEngineRunning: (running: boolean) => void
  /** Report whether animated link particles are currently on screen. */
  setParticlesAnimating: (animating: boolean) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRenderLoop(
  graphRef: React.RefObject<RenderLoopGraphRef | undefined>,
  containerRef: React.RefObject<HTMLElement | null>,
): RenderLoopHandle {
  const keepAliveUntilRef = useRef(0)
  const engineRunningRef = useRef(true)
  const particlesRef = useRef(false)
  const hiddenRef = useRef(false)
  const onScreenRef = useRef(true)
  /** Mirrors the library's loop state so pause/resume stay idempotent. */
  const loopRunningRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyRef = useRef<() => void>(() => {})

  const schedule = useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      applyRef.current()
    }, ms)
  }, [])

  const apply = useCallback(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.pauseAnimation !== 'function' || typeof fg.resumeAnimation !== 'function') {
      // Not mounted yet — never leave the graph stuck paused, keep polling.
      schedule(NOT_READY_RETRY_MS)
      return
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const input: RenderLoopInput = {
      documentHidden: hiddenRef.current,
      onScreen: onScreenRef.current,
      engineRunning: engineRunningRef.current,
      particlesAnimating: particlesRef.current,
      now,
      keepAliveUntil: keepAliveUntilRef.current,
    }

    if (shouldRenderContinuously(input)) {
      if (!loopRunningRef.current) {
        fg.resumeAnimation()
        loopRunningRef.current = true
      }
      schedule(POLL_MS)
      return
    }

    if (loopRunningRef.current) {
      fg.pauseAnimation()
      loopRunningRef.current = false
    } else if (shouldHeartbeat(input)) {
      // Single-frame heartbeat: resumeAnimation() renders one frame
      // synchronously and queues the next rAF; pauseAnimation() cancels it.
      fg.resumeAnimation()
      fg.pauseAnimation()
    }

    schedule(shouldHeartbeat(input) ? HEARTBEAT_MS : POLL_MS * 4)
  }, [graphRef, schedule])

  // `apply` is stable (both deps are stable), so this runs once. It is declared
  // here — before every wake-up effect below and before the caller's own
  // effects — so `applyRef` is wired up by the time anything calls `wake()`.
  useEffect(() => {
    applyRef.current = apply
  }, [apply])

  const wake = useCallback((ms: number = WAKE_MUTATION_MS) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const until = now + ms
    if (until > keepAliveUntilRef.current) keepAliveUntilRef.current = until
    applyRef.current()
  }, [])

  const setEngineRunning = useCallback((running: boolean) => {
    if (engineRunningRef.current === running) return
    engineRunningRef.current = running
    applyRef.current()
  }, [])

  const setParticlesAnimating = useCallback((animating: boolean) => {
    if (particlesRef.current === animating) return
    particlesRef.current = animating
    applyRef.current()
  }, [])

  // ── Wake-up: camera controls (rotate / zoom / pan) ────────────────────────
  // OrbitControls dispatches 'change' for every camera mutation it performs,
  // which is the authoritative signal — more reliable than guessing which DOM
  // events the controls consume.
  useEffect(() => {
    let controls: RenderLoopControls | undefined
    const onChange = () => wake(WAKE_INTERACTION_MS)

    const attach = () => {
      const fg = graphRef.current
      if (!fg || typeof fg.controls !== 'function') return false
      const c = fg.controls()
      if (!c || typeof c.addEventListener !== 'function') return false
      controls = c
      c.addEventListener('change', onChange)
      c.addEventListener?.('start', onChange)
      c.addEventListener?.('end', onChange)
      return true
    }

    let interval: ReturnType<typeof setInterval> | null = null
    let giveUp: ReturnType<typeof setTimeout> | null = null
    if (!attach()) {
      interval = setInterval(() => {
        if (attach() && interval) {
          clearInterval(interval)
          interval = null
        }
      }, 100)
      // Give up polling after 10s — DOM wake-ups below still cover interaction.
      giveUp = setTimeout(() => {
        if (interval) { clearInterval(interval); interval = null }
      }, 10000)
    }

    return () => {
      if (interval) clearInterval(interval)
      if (giveUp) clearTimeout(giveUp)
      controls?.removeEventListener?.('change', onChange)
      controls?.removeEventListener?.('start', onChange)
      controls?.removeEventListener?.('end', onChange)
    }
  }, [graphRef, wake])

  // ── Wake-up: raw pointer / wheel / touch on the canvas ────────────────────
  // Covers hover raycasting and tooltips (which only run inside the loop),
  // node drag, and any interaction the controls do not translate into a
  // camera change.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onInteract = () => wake(WAKE_INTERACTION_MS)
    const events = [
      'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave',
      'wheel', 'touchstart', 'touchmove', 'touchend', 'contextmenu', 'click', 'dblclick',
    ]
    for (const type of events) {
      el.addEventListener(type, onInteract, { capture: true, passive: true })
    }
    return () => {
      for (const type of events) {
        el.removeEventListener(type, onInteract, { capture: true })
      }
    }
  }, [containerRef, wake])

  // ── Pause: tab hidden / screen locked ────────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      hiddenRef.current = document.hidden
      // Coming back: render immediately so the first visible frame is current.
      // The camera is untouched, so there is no jump and no reset.
      if (!document.hidden) wake(WAKE_MUTATION_MS)
      else applyRef.current()
    }
    hiddenRef.current = document.hidden
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [wake])

  // ── Pause: component scrolled off screen ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      const next = entry.isIntersecting
      if (onScreenRef.current === next) return
      onScreenRef.current = next
      if (next) wake(WAKE_MUTATION_MS)
      else applyRef.current()
    }, { threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef, wake])

  // ── Boot + teardown ──────────────────────────────────────────────────────
  useEffect(() => {
    // Generous warm-up: mount, first layout, auto zoom-to-fit.
    wake(5000)
    const graph = graphRef
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      // Leave the library running so its own destructor behaves as before.
      const fg = graph.current
      if (fg && !loopRunningRef.current && typeof fg.resumeAnimation === 'function') {
        fg.resumeAnimation()
        loopRunningRef.current = true
      }
    }
  }, [graphRef, wake])

  return { wake, setEngineRunning, setParticlesAnimating }
}

// ── Device capability detection (no user-agent sniffing) ─────────────────────

/**
 * Coarse pointer (touch) or a narrow viewport ⇒ treat as a phone/tablet.
 * Evaluated once, because `rendererConfig` is an init-only prop.
 */
export function isMobileLikeDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
  return coarse || window.innerWidth < 768
}
