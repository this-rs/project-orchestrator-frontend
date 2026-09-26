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
} from './useRenderLoop'

// ── Test doubles ─────────────────────────────────────────────────────────────

/** A ForceGraph3D stand-in exposing only what the hook touches. */
function makeGraph({ withControls = true } = {}) {
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
  const fg: RenderLoopGraphRef = {
    pauseAnimation,
    resumeAnimation,
    ...(withControls ? { controls: () => controls } : {}),
  }
  return {
    fg,
    pauseAnimation,
    resumeAnimation,
    controls,
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
function mount(graph?: ReturnType<typeof makeGraph>) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const graphRef = { current: graph?.fg } as React.RefObject<RenderLoopGraphRef | undefined>
  const containerRef = { current: el } as React.RefObject<HTMLElement | null>
  const view = renderHook(() => useRenderLoop(graphRef, containerRef))
  return { ...view, el, graphRef }
}

beforeEach(() => {
  clock = 0
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  FakeIntersectionObserver.instances = []
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIntersectionObserver
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
})

afterEach(() => {
  vi.useRealTimers()
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
