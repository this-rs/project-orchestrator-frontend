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

import { initialFrameQuality, observeFrame, type FrameQualityState } from './frameQuality'

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

/** `performance.now()`, with a fallback for a non-browser environment. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** A pixel ratio must be a positive finite number; anything else means 1. */
function clampRatio(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** The ratio the renderer holds right now, if it exists yet. */
function rendererPixelRatio(graphRef: React.RefObject<RenderLoopGraphRef | undefined>): number | undefined {
  const fg = graphRef.current
  const renderer = fg && typeof fg.renderer === 'function' ? fg.renderer() : undefined
  return typeof renderer?.getPixelRatio === 'function' ? renderer.getPixelRatio() : undefined
}

// ── Ref surface we need from ForceGraph3D ────────────────────────────────────

export interface RenderLoopControls {
  addEventListener?: (type: string, fn: () => void) => void
  removeEventListener?: (type: string, fn: () => void) => void
}

/**
 * The two renderer methods the frame budget needs. Typed structurally so this
 * module keeps zero knowledge of three.js.
 */
export interface RenderLoopRenderer {
  getPixelRatio?: () => number
  setPixelRatio: (pixelRatio: number) => unknown
}

export interface RenderLoopGraphRef {
  pauseAnimation?: () => unknown
  resumeAnimation?: () => unknown
  controls?: () => RenderLoopControls | undefined
  renderer?: () => RenderLoopRenderer | undefined
}

export interface RenderLoopOptions {
  /**
   * Ceiling the budget may raise the pixel ratio back to: the device ratio,
   * already clamped by the caller. Default 1 (never raise).
   */
  maxPixelRatio?: number
  /** Opening ratio. Defaults to `maxPixelRatio`. */
  initialPixelRatio?: number
  /**
   * Called whenever the ratio changes. The shader's `uPx` MUST follow (it scales
   * `gl_PointSize`, which is in device pixels): if it does not, every point
   * grows by exactly the factor the renderer lost.
   */
  onPixelRatioChange?: (pixelRatio: number) => void
}

export interface RenderLoopHandle {
  /** Wake the loop and keep it running for at least `ms`. Always safe to call. */
  wake: (ms?: number) => void
  /** Report the force-layout state (from onEngineTick / onEngineStop). */
  setEngineRunning: (running: boolean) => void
  /** Report whether animated link particles are currently on screen. */
  setParticlesAnimating: (animating: boolean) => void
  /** Pixel ratio currently in force (renderer and shader agree on it). */
  getPixelRatio: () => number
  /**
   * Change the ceiling — the screen's own ratio changed (window dragged to
   * another display). Resets the drop counter: the history belonged to the
   * previous screen, and po-graph resets `prDrops` for the same reason
   * (po-graph.js:4141).
   */
  setMaxPixelRatio: (pixelRatio: number) => void
  /**
   * Change the ceiling because the camera zoomed (pixelRatioZoom.ts) — the
   * SAME screen. Unlike `setMaxPixelRatio` it keeps the drop history: a zoom
   * must not erase the proof that this machine cannot hold a higher ratio.
   * While the budget has never dropped, the ratio follows a raised ceiling at
   * once (a close-up gets sharp now, not after 600 fast frames); after a drop
   * it stays where the budget put it. A lowered ceiling always caps the ratio.
   */
  setZoomPixelRatioCeiling: (pixelRatio: number) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRenderLoop(
  graphRef: React.RefObject<RenderLoopGraphRef | undefined>,
  containerRef: React.RefObject<HTMLElement | null>,
  options: RenderLoopOptions = {},
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

  // ── Frame budget (pixel ratio) ────────────────────────────────────────────
  // `qualityRef` is the whole decision state (see frameQuality.ts); the probe
  // below feeds it one sample per RENDERED frame and applies the ratio it
  // returns. It only runs while the library's loop runs: a scene at rest must
  // not keep a rAF chain alive, or this hook would re-create the very heat it
  // exists to remove.
  const maxRatioRef = useRef<number>(clampRatio(options.maxPixelRatio ?? options.initialPixelRatio ?? 1))
  const qualityRef = useRef<FrameQualityState>(
    initialFrameQuality(clampRatio(options.initialPixelRatio ?? options.maxPixelRatio ?? 1), nowMs()),
  )
  const probeRef = useRef<number | null>(null)
  /**
   * True once the budget knows which ratio to start from. When the caller gave
   * no ceiling, the first probe adopts the renderer's own ratio instead of
   * silently forcing a hook with no options down to 1.
   */
  const ratioKnownRef = useRef(options.maxPixelRatio != null || options.initialPixelRatio != null)
  const onRatioRef = useRef(options.onPixelRatioChange)
  useEffect(() => {
    onRatioRef.current = options.onPixelRatioChange
  }, [options.onPixelRatioChange])

  /** Push a ratio to the renderer AND to the caller (which owns the shader). */
  const applyPixelRatio = useCallback((ratio: number) => {
    const fg = graphRef.current
    const renderer = fg && typeof fg.renderer === 'function' ? fg.renderer() : undefined
    if (renderer && typeof renderer.setPixelRatio === 'function') {
      const current = typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : undefined
      if (typeof current !== 'number' || Math.abs(current - ratio) > 1e-3) {
        renderer.setPixelRatio(ratio)
      }
    }
    onRatioRef.current?.(ratio)
  }, [graphRef])

  const stopProbe = useCallback(() => {
    if (probeRef.current !== null) {
      cancelAnimationFrame(probeRef.current)
      probeRef.current = null
    }
    // lastFrameAt = 0 ⇒ the next sample only re-learns the clock instead of
    // averaging in the whole pause as if it were one slow frame.
    qualityRef.current = { ...qualityRef.current, lastFrameAt: 0 }
  }, [])

  const startProbe = useCallback(() => {
    if (probeRef.current !== null) return
    if (typeof requestAnimationFrame !== 'function') return
    if (!ratioKnownRef.current) {
      // No ceiling was imposed: measure against what the renderer already uses.
      ratioKnownRef.current = true
      const ratio = clampRatio(rendererPixelRatio(graphRef) ?? 1)
      maxRatioRef.current = ratio
      qualityRef.current = { ...initialFrameQuality(ratio, nowMs()), lastFrameAt: qualityRef.current.lastFrameAt }
    }
    // Re-assert the ratio once: the renderer may have just been created at the
    // device ratio while the budget already decided on a lower one.
    applyPixelRatio(qualityRef.current.ratio)
    const step = (now: number) => {
      probeRef.current = requestAnimationFrame(step)
      const prev = qualityRef.current
      const next = observeFrame(prev, {
        dtMs: now - prev.lastFrameAt,
        now,
        maxRatio: maxRatioRef.current,
      })
      qualityRef.current = next
      // Apply on a decision — and re-assert whenever the renderer disagrees.
      // `three-render-objects` sets `Math.min(2, devicePixelRatio)` when it
      // CONSTRUCTS the renderer (three-render-objects.mjs:534), which can happen
      // after the first probe: without this check the measured ratio would never
      // reach it, and the points would be drawn at the wrong scale.
      const current = rendererPixelRatio(graphRef)
      const drifted = typeof current === 'number' && Math.abs(current - next.ratio) > 1e-3
      if (drifted || Math.abs(next.ratio - prev.ratio) > 1e-6) applyPixelRatio(next.ratio)
    }
    probeRef.current = requestAnimationFrame(step)
    // `maxRatioRef` is listed because the compiler infers it as a dependency of
    // this callback (it is read and, on first use, adopted). Refs are stable, so
    // listing it can never re-create the callback.
  }, [applyPixelRatio, graphRef, maxRatioRef])

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
      // The frame budget can only be measured on frames that are drawn.
      startProbe()
      schedule(POLL_MS)
      return
    }

    // Nothing is being drawn anymore: stop measuring. Idempotent, and it also
    // re-seeds the EMA so the pause is not averaged in as one slow frame.
    stopProbe()

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
  }, [graphRef, schedule, startProbe, stopProbe])

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

  // ── Frame budget controls ─────────────────────────────────────────────────
  const getPixelRatio = useCallback(() => qualityRef.current.ratio, [])

  const setMaxPixelRatio = useCallback((pixelRatio: number) => {
    const max = clampRatio(pixelRatio)
    const q = qualityRef.current
    const ratio = Math.min(q.ratio, max)
    const otherScreen = Math.abs(max - maxRatioRef.current) > 1e-6
    maxRatioRef.current = max
    if (otherScreen) {
      // Another screen: the drop history and the smoothed interval belonged to
      // the previous one (po-graph resets `prDrops` on a dpr change,
      // po-graph.js:4141). Keep the timing so the probe stays seeded.
      qualityRef.current = { ...initialFrameQuality(ratio, nowMs()), lastFrameAt: q.lastFrameAt }
    } else if (ratio !== q.ratio) {
      qualityRef.current = { ...q, ratio, changedAt: nowMs() }
    }
    // One writer: the ceiling change reaches the renderer through the same path
    // the drops use, so the shader's uPx can never lag behind.
    applyPixelRatio(ratio)
  }, [applyPixelRatio, maxRatioRef])

  const setZoomPixelRatioCeiling = useCallback((pixelRatio: number) => {
    const max = clampRatio(pixelRatio)
    if (Math.abs(max - maxRatioRef.current) < 1e-6) return
    maxRatioRef.current = max
    const q = qualityRef.current
    // Never dropped → follow the ceiling both ways; dropped → only cap it.
    const ratio = q.drops === 0 ? max : Math.min(q.ratio, max)
    if (Math.abs(ratio - q.ratio) < 1e-6) return
    // `changedAt` restarts the drop cooldown: a machine that cannot hold the
    // sharper close-up still drops back, and that drop then sticks.
    qualityRef.current = { ...q, ratio, changedAt: nowMs() }
    applyPixelRatio(ratio)
  }, [applyPixelRatio, maxRatioRef])

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
      // Never leave a rAF chain alive after unmount.
      stopProbe()
      // Leave the library running so its own destructor behaves as before.
      const fg = graph.current
      if (fg && !loopRunningRef.current && typeof fg.resumeAnimation === 'function') {
        fg.resumeAnimation()
        loopRunningRef.current = true
      }
    }
  }, [graphRef, wake, stopProbe])

  return { wake, setEngineRunning, setParticlesAnimating, getPixelRatio, setMaxPixelRatio, setZoomPixelRatioCeiling }
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
