import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CompactionFlow } from './CompactionFlow'

/**
 * jsdom has no canvas, so the drawing code is exercised against a recording 2D context, a
 * hand-driven requestAnimationFrame and a fake ResizeObserver. The three paths that matter:
 * animated, reduced motion (one still frame), and a hidden tab (the loop stops).
 */

type Ctx = ReturnType<typeof makeCtx>

function makeCtx() {
  const gradient = () => ({ addColorStop: vi.fn() })
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    createRadialGradient: vi.fn(gradient),
    createLinearGradient: vi.fn(gradient),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
  }
}

let ctx: Ctx
let frames: Array<(now: number) => void>
let cancelled: number[]
let observers: Array<{ cb: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>
let widthSpy: ReturnType<typeof vi.spyOn>

function setReducedMotion(value: boolean | 'throws' | 'absent') {
  if (value === 'absent') {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined })
    return
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => {
      if (value === 'throws') throw new Error('matchMedia unavailable')
      return { matches: value }
    },
  })
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

/** Run every queued frame once, at the given clock. */
function runFrames(now: number) {
  const queued = frames.splice(0)
  for (const f of queued) f(now)
}

beforeEach(() => {
  ctx = makeCtx()
  frames = []
  cancelled = []
  observers = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ctx) as unknown as HTMLCanvasElement['getContext'],
  )
  widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
  vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id)
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: () => void) {
        observers.push({ cb, observe: this.observe, disconnect: this.disconnect })
      }
    },
  )
  setReducedMotion(false)
  setHidden(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  widthSpy.mockRestore()
  setHidden(false)
})

describe('CompactionFlow canvas', () => {
  it('animates: sizes the canvas, then draws far half, core and near half on every frame', () => {
    render(<CompactionFlow />)
    expect(ctx.setTransform).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(1)

    runFrames(1000) // the first frame fixes the clock origin
    runFrames(1250)

    expect(ctx.clearRect).toHaveBeenCalledTimes(2)
    expect(ctx.createRadialGradient).toHaveBeenCalled() // halo and hot centre of the core
    expect(ctx.ellipse).toHaveBeenCalled() // photon ring
    expect(ctx.createLinearGradient).toHaveBeenCalled() // velocity streaks
    expect(ctx.arc).toHaveBeenCalled() // particle heads and the core
    expect(ctx.globalCompositeOperation).toBe('source-over') // draw() always restores it
    expect(frames).toHaveLength(1) // and asks for the next frame
  })

  it('stops asking for frames while the tab is hidden, and resumes when it comes back', () => {
    render(<CompactionFlow />)
    setHidden(true)
    runFrames(500)
    expect(frames).toHaveLength(0) // the frame drew once, then did not reschedule

    document.dispatchEvent(new Event('visibilitychange'))
    expect(cancelled.length).toBeGreaterThan(0)
    expect(frames).toHaveLength(0) // still hidden: nothing scheduled

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames).toHaveLength(1) // visible again: the loop restarts
  })

  it('reduced motion: draws one still frame, never schedules the loop, redraws on resize only', () => {
    setReducedMotion(true)
    render(<CompactionFlow />)
    expect(frames).toHaveLength(0)
    expect(ctx.clearRect).toHaveBeenCalledTimes(1)

    observers[0].cb() // the host was resized
    expect(ctx.setTransform).toHaveBeenCalledTimes(2)
    expect(ctx.clearRect).toHaveBeenCalledTimes(2)

    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames).toHaveLength(0) // a visible tab does not restart a still picture
  })

  it('animated mode: a resize only re-measures, it does not draw an extra frame', () => {
    render(<CompactionFlow />)
    observers[0].cb()
    expect(ctx.setTransform).toHaveBeenCalledTimes(2)
    expect(ctx.clearRect).not.toHaveBeenCalled()
  })

  it('treats an unreadable or missing matchMedia as "motion allowed"', () => {
    setReducedMotion('throws')
    const first = render(<CompactionFlow />)
    expect(frames).toHaveLength(1)
    first.unmount()

    frames = []
    setReducedMotion('absent')
    render(<CompactionFlow />)
    expect(frames).toHaveLength(1)
  })

  it('works without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { unmount } = render(<CompactionFlow />)
    expect(frames).toHaveLength(1)
    expect(() => unmount()).not.toThrow()
  })

  it('cleans up on unmount: cancels the frame, disconnects the observer, stops listening', () => {
    const { unmount } = render(<CompactionFlow />)
    unmount()
    expect(cancelled.length).toBeGreaterThan(0)
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)

    frames = []
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames).toHaveLength(0) // the listener is gone
  })

  it('does nothing when the canvas has no 2d context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => null) as unknown as HTMLCanvasElement['getContext'],
    )
    render(<CompactionFlow />)
    expect(frames).toHaveLength(0)
    expect(observers).toHaveLength(0)
  })
})
