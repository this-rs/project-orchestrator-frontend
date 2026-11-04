/**
 * Behavioural tests for the `useRenderLoop` hook itself.
 *
 * The pure policy functions are covered in `useRenderLoop.test.ts`. What is
 * covered here is the part that can actually hurt: the state machine that
 * decides when to call the library's `pauseAnimation()` / `resumeAnimation()`.
 *
 * The failure this hook is built around is a MISSED WAKE-UP — a frozen graph,
 * which is worse than the heat it saves. So every wake-up path gets a test, and
 * so do the two safety nets: the 1 Hz single-frame heartbeat, and the retry
 * loop that runs while the ForceGraph3D instance is not mounted yet.
 *
 * Time is driven by hand. `performance.now()` is stubbed from the same counter
 * as the timers, because the hook compares `now` against `keepAliveUntil`: if
 * the clock did not advance with the timers, every keep-alive window would look
 * infinite and the idle assertions would pass for the wrong reason.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import {
  useRenderLoop,
  WAKE_INTERACTION_MS,
  type RenderLoopGraphRef,
  type RenderLoopOptions,
} from './useRenderLoop'

// ── Test doubles ─────────────────────────────────────────────────────────────

/** A ForceGraph3D stand-in exposing only what the hook touches. */
function makeGraph({ withControls = true, withRenderer = true } = {}) {
  const pauseAnimation = vi.fn()
  const resumeAnimation = vi.fn()
  const listeners = new Map<string, Set<() => void>>()
  const controls = {
    addEventListener: vi.fn((type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    }),
    removeEventListener: vi.fn((type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn)
    }),
  }
  // The renderer, as the frame budget sees it: a getter/setter pair and nothing
  // else. `pixelRatio` mirrors what the real WebGLRenderer would hold.
  const pixelRatio = { value: 1.5 }
  const renderer = {
    getPixelRatio: vi.fn(() => pixelRatio.value),
    setPixelRatio: vi.fn((next: number) => { pixelRatio.value = next }),
  }
  const fg: RenderLoopGraphRef = {
    pauseAnimation,
    resumeAnimation,
    ...(withControls ? { controls: () => controls } : {}),
    ...(withRenderer ? { renderer: () => renderer } : {}),
  }
  return {
    fg,
    pauseAnimation,
    resumeAnimation,
    controls,
    renderer,
    pixelRatio,
    emit: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  }
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(private cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
    FakeIntersectionObserver.instances.push(this)
  }
  trigger(isIntersecting: boolean) {
    this.cb([{ isIntersecting }])
  }
}

// ── Manual rAF ───────────────────────────────────────────────────────────────
// The frame budget chains requestAnimationFrame, so a test must decide exactly
// WHEN a frame happens and HOW LONG it took. This is installed after
// useFakeTimers(), so a faked rAF (which advances with the timers) can never
// slip a frame in behind the test's back.
let rafCallbacks = new Map<number, FrameRequestCallback>()
let rafNextId = 1
const realRequestAnimationFrame = globalThis.requestAnimationFrame
const realCancelAnimationFrame = globalThis.cancelAnimationFrame

function installManualRaf() {
  rafCallbacks = new Map()
  rafNextId = 1
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    (cb: FrameRequestCallback) => {
      const id = rafNextId++
      rafCallbacks.set(id, cb)
      return id
    }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (id: number) => {
    rafCallbacks.delete(id)
  }
}

/** Run `count` frames, each starting `dtMs` after the previous one. */
function pumpFrames(count: number, dtMs: number) {
  for (let i = 0; i < count; i++) {
    clock += dtMs
    const due = [...rafCallbacks.entries()]
    rafCallbacks.clear()
    act(() => {
      for (const [, cb] of due) cb(clock)
    })
  }
}

let clock = 0
/**
 * Advance the stubbed `performance.now()` and the timers together, in small
 * steps.
 *
 * The step matters. Bumping the clock by the whole span and then draining the
 * timers makes every callback — including the one due at 250ms — read the time
 * at the END of the span, so a 5s advance looks to the first poll like 5s have
 * already elapsed. Written that way, these tests passed for the wrong reason
 * and miscounted the pauses. Stepping keeps `performance.now()` within one step
 * of the timer clock.
 */
function advance(ms: number, step = 50) {
  act(() => {
    let left = ms
    while (left > 0) {
      const slice = Math.min(step, left)
      clock += slice
      vi.advanceTimersByTime(slice)
      left -= slice
    }
  })
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Mount the hook on a real element, with a graph that is ready by default. */
function mount(graph?: ReturnType<typeof makeGraph>, options?: RenderLoopOptions) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const graphRef = { current: graph?.fg } as React.RefObject<RenderLoopGraphRef | undefined>
  const containerRef = { current: el } as React.RefObject<HTMLElement | null>
  const view = renderHook(() => useRenderLoop(graphRef, containerRef, options))
  return { ...view, el, graphRef }
}

beforeEach(() => {
  clock = 0
  vi.useFakeTimers()
  installManualRaf()
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  FakeIntersectionObserver.instances = []
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIntersectionObserver
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
})

afterEach(() => {
  vi.useRealTimers()
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = realRequestAnimationFrame
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = realCancelAnimationFrame
  vi.restoreAllMocks()
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
  document.body.innerHTML = ''
})

/** Boot warm-up is 5s of keep-alive; the layout also reports as running. */
function settle(handle: { setEngineRunning: (r: boolean) => void }) {
  act(() => handle.setEngineRunning(false))
  advance(5_100)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useRenderLoop — reaching idle', () => {
  it('leaves the loop alone while the force layout is still ticking', () => {
    const graph = makeGraph()
    mount(graph)

    // Engine is assumed running at mount (onEngineStop has not fired yet), so
    // nothing may be paused however long we wait.
    advance(30_000)

    expect(graph.pauseAnimation).not.toHaveBeenCalled()
  })

  it('pauses once the layout has settled and the warm-up window has passed', () => {
    const graph = makeGraph()
    const { result } = mount(graph)

    settle(result.current)

    // Exactly the transition, no heartbeat yet: the first beat is due one
    // second after the pause, past the end of this window.
    expect(graph.pauseAnimation).toHaveBeenCalledTimes(1)
  })

  it('never pauses an already-paused loop — every later pause closes a heartbeat', () => {
    const graph = makeGraph()
    const { result } = mount(graph)

    settle(result.current)
    graph.pauseAnimation.mockClear()
    graph.resumeAnimation.mockClear()
    // Several seconds of idle: the only calls left are heartbeat pairs.
    advance(3_500)

    expect(graph.pauseAnimation.mock.calls.length).toBe(graph.resumeAnimation.mock.calls.length)
    expect(graph.pauseAnimation).toHaveBeenCalled()
  })
})

describe('useRenderLoop — safety nets', () => {
  it('keeps polling instead of pausing while the graph is not mounted yet', () => {
    // The dangerous shape: no instance to drive. It must never end up paused,
    // and it must keep retrying so the graph starts when the instance appears.
    const { graphRef } = mount(undefined)
    const graph = makeGraph()

    advance(1_000)
    graphRef.current = graph.fg
    advance(250)

    // Now reachable: it settles as usual rather than staying stuck.
    expect(graph.pauseAnimation).not.toHaveBeenCalled()
  })

  it('emits a single-frame heartbeat while idle and on screen', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    graph.resumeAnimation.mockClear()
    graph.pauseAnimation.mockClear()

    advance(1_000)

    // resume() renders one frame synchronously, pause() cancels the next rAF:
    // exactly one frame, not a restarted loop.
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)
    expect(graph.pauseAnimation).toHaveBeenCalledTimes(1)

    advance(1_000)
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(2)
    expect(graph.pauseAnimation).toHaveBeenCalledTimes(2)
  })

  it('stops the heartbeat when the document is hidden', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    graph.resumeAnimation.mockClear()

    setHidden(true)
    advance(5_000)

    expect(graph.resumeAnimation).not.toHaveBeenCalled()
  })
})

describe('useRenderLoop — wake-ups', () => {
  it('resumes on an explicit wake and idles again when the window expires', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    graph.resumeAnimation.mockClear()
    graph.pauseAnimation.mockClear()

    act(() => result.current.wake(WAKE_INTERACTION_MS))
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)

    advance(WAKE_INTERACTION_MS + 300)
    expect(graph.pauseAnimation).toHaveBeenCalled()
  })

  it('never shortens a longer keep-alive window with a shorter wake', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)

    act(() => result.current.wake(2_000))
    graph.pauseAnimation.mockClear()
    act(() => result.current.wake(100)) // shorter — must not win
    advance(500)

    expect(graph.pauseAnimation).not.toHaveBeenCalled()
  })

  it('resumes when the layout restarts and idles when it stops', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    graph.resumeAnimation.mockClear()

    act(() => result.current.setEngineRunning(true))
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)

    graph.pauseAnimation.mockClear()
    act(() => result.current.setEngineRunning(false))
    advance(6_000)
    expect(graph.pauseAnimation).toHaveBeenCalled()
  })

  it('resumes while link particles are animating', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    graph.resumeAnimation.mockClear()

    act(() => result.current.setParticlesAnimating(true))
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)

    // Idempotent: reporting the same state again changes nothing.
    act(() => result.current.setParticlesAnimating(true))
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)
  })

  it('wakes on a camera change reported by the controls', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    graph.resumeAnimation.mockClear()

    act(() => graph.emit('change'))

    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)
  })

  it('wakes on raw pointer interaction with the canvas', () => {
    const graph = makeGraph()
    const { result, el } = mount(graph)
    settle(result.current)
    graph.resumeAnimation.mockClear()

    act(() => {
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })

    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)
  })

  it('renders immediately when the tab comes back to the foreground', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    setHidden(true)
    graph.resumeAnimation.mockClear()

    setHidden(false)

    // The first visible frame must be current, not one second stale.
    expect(graph.resumeAnimation).toHaveBeenCalled()
  })

  it('pauses when scrolled off screen and wakes when scrolled back', () => {
    const graph = makeGraph()
    const { result } = mount(graph)
    settle(result.current)
    const observer = FakeIntersectionObserver.instances.at(-1)!
    graph.pauseAnimation.mockClear()
    graph.resumeAnimation.mockClear()

    act(() => observer.trigger(false))
    advance(2_000)
    // Off screen: no heartbeat either — that is the point of the check.
    expect(graph.resumeAnimation).not.toHaveBeenCalled()

    act(() => observer.trigger(true))
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)
  })
})

describe('useRenderLoop — attachment and teardown', () => {
  it('attaches to controls that only become available after mount', () => {
    // ForceGraph3D builds its controls asynchronously; the hook polls for them.
    const graph = makeGraph({ withControls: false })
    const { result } = mount(graph)
    expect(graph.controls.addEventListener).not.toHaveBeenCalled()

    ;(graph.fg as { controls?: unknown }).controls = () => graph.controls
    advance(150)
    settle(result.current)
    graph.resumeAnimation.mockClear()

    act(() => graph.emit('change'))
    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)
  })

  it('detaches its control listeners on unmount', () => {
    const graph = makeGraph()
    const { unmount } = mount(graph)
    expect(graph.listenerCount('change')).toBe(1)

    unmount()

    expect(graph.listenerCount('change')).toBe(0)
  })

  it('hands the loop back running on unmount, so the library destructs as before', () => {
    const graph = makeGraph()
    const { result, unmount } = mount(graph)
    settle(result.current)
    expect(graph.pauseAnimation).toHaveBeenCalled()
    graph.resumeAnimation.mockClear()

    unmount()

    expect(graph.resumeAnimation).toHaveBeenCalledTimes(1)
  })

  it('stops its timers on unmount — no work after the component is gone', () => {
    const graph = makeGraph()
    const { result, unmount } = mount(graph)
    settle(result.current)
    unmount()
    graph.resumeAnimation.mockClear()
    graph.pauseAnimation.mockClear()

    advance(10_000)

    expect(graph.resumeAnimation).not.toHaveBeenCalled()
    expect(graph.pauseAnimation).not.toHaveBeenCalled()
  })
})

describe('useRenderLoop — frame budget (pixel ratio)', () => {
  const ceiling = { maxPixelRatio: 1.5, initialPixelRatio: 1.5 }

  it('opens at the ceiling and hands it to the renderer and the shader alike', () => {
    const graph = makeGraph()
    const seen: number[] = []
    const { result } = mount(graph, { ...ceiling, onPixelRatioChange: (pr) => seen.push(pr) })

    expect(result.current.getPixelRatio()).toBe(1.5)
    // One write path: the renderer holds it, and the caller is told so it can
    // move the shader's uPx with it.
    expect(graph.pixelRatio.value).toBe(1.5)
    expect(seen).toEqual([1.5])
  })

  it('drops by 0.5 when frames stay above 34 ms for a long window', () => {
    const graph = makeGraph()
    const seen: number[] = []
    const { result } = mount(graph, { ...ceiling, onPixelRatioChange: (pr) => seen.push(pr) })

    pumpFrames(120, 50) // 6 s at 20 fps

    expect(result.current.getPixelRatio()).toBe(1)
    expect(graph.pixelRatio.value).toBe(1)
    expect(graph.renderer.setPixelRatio).toHaveBeenCalledWith(1)
    // The shader is told, in the same breath as the renderer: uPx must follow or
    // every point grows by the factor the renderer lost.
    expect(seen).toEqual([1.5, 1])
  })

  it('does not drop on a merely-fine window (60 fps)', () => {
    const graph = makeGraph()
    const { result } = mount(graph, ceiling)
    pumpFrames(300, 16.7)
    expect(result.current.getPixelRatio()).toBe(1.5)
    expect(graph.renderer.setPixelRatio).not.toHaveBeenCalled()
  })

  it('measures nothing while the scene is at rest — no rAF chain left alive', () => {
    const graph = makeGraph()
    const { result } = mount(graph, ceiling)

    settle(result.current) // layout settled, warm-up over: the loop is paused
    expect(rafCallbacks.size).toBe(0)

    graph.renderer.setPixelRatio.mockClear()
    pumpFrames(300, 50) // would drop twice if anything were still measuring

    expect(result.current.getPixelRatio()).toBe(1.5)
    expect(graph.renderer.setPixelRatio).not.toHaveBeenCalled()
  })

  it('climbs back after a long cheap window, never past the ceiling', () => {
    const graph = makeGraph()
    const seen: number[] = []
    const { result } = mount(graph, { maxPixelRatio: 1.25, initialPixelRatio: 1.25, onPixelRatioChange: (pr) => seen.push(pr) })

    pumpFrames(120, 50) // slow → floor
    expect(result.current.getPixelRatio()).toBe(1)
    pumpFrames(2_500, 8) // 20 s at 8 ms: cooldown + fast window
    expect(result.current.getPixelRatio()).toBe(1.25)
    expect(graph.pixelRatio.value).toBe(1.25)
    expect(seen).toEqual([1.25, 1, 1.25])
  })

  it('wins over a renderer that sets its own ratio late', () => {
    const graph = makeGraph()
    const { result } = mount(graph, ceiling)
    // three-render-objects hard-sets `Math.min(2, devicePixelRatio)` when it
    // CONSTRUCTS the renderer, which can happen after the first probe. Left
    // alone, the ratio in force would never reach it and every point would be
    // drawn at the wrong scale.
    graph.pixelRatio.value = 2

    pumpFrames(2, 16)

    expect(graph.pixelRatio.value).toBe(1.5)
    expect(result.current.getPixelRatio()).toBe(1.5)
  })

  it('follows a zoom ceiling at once while the budget never dropped, and back down', () => {
    const graph = makeGraph()
    const seen: number[] = []
    const { result } = mount(graph, { ...ceiling, onPixelRatioChange: (pr) => seen.push(pr) })

    act(() => result.current.setZoomPixelRatioCeiling(2))
    expect(result.current.getPixelRatio()).toBe(2)
    expect(graph.pixelRatio.value).toBe(2)

    act(() => result.current.setZoomPixelRatioCeiling(1.5))
    expect(result.current.getPixelRatio()).toBe(1.5)
    expect(seen).toEqual([1.5, 2, 1.5])
  })

  it('a zoom keeps the drop history: a machine that dropped is not sharpened again', () => {
    const graph = makeGraph()
    const { result } = mount(graph, ceiling)
    pumpFrames(120, 50) // slow → 1
    expect(result.current.getPixelRatio()).toBe(1)

    act(() => result.current.setZoomPixelRatioCeiling(2))
    expect(result.current.getPixelRatio()).toBe(1)
    // Still slow: the budget is not reset by the zoom, it stays at the floor.
    pumpFrames(120, 50)
    expect(result.current.getPixelRatio()).toBe(1)
  })

  it('starts a new measurement after a resume, without averaging the pause in', () => {
    const graph = makeGraph()
    const { result } = mount(graph, ceiling)
    settle(result.current)

    act(() => result.current.wake(5_000))
    // 5 frames spanning a 30 s pause would, if averaged, read as "very slow".
    pumpFrames(5, 30_000)

    expect(result.current.getPixelRatio()).toBe(1.5)
    expect(graph.renderer.setPixelRatio).not.toHaveBeenCalled()
  })
})
