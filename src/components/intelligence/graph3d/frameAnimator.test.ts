import { describe, it, expect, vi } from 'vitest'
import { FRAME_WAKE_MS, FrameAnimator, type FrameScheduler } from './frameAnimator'

/** A scheduler driven by hand: `step(now)` runs the pending frame, if any. */
function manualScheduler() {
  let pending: ((now: number) => void) | null = null
  let handle = 0
  const scheduler: FrameScheduler = {
    request: (cb) => {
      pending = cb
      return ++handle
    },
    cancel: () => {
      pending = null
    },
  }
  return {
    scheduler,
    get hasPending() {
      return pending !== null
    },
    step(now: number) {
      const cb = pending
      pending = null
      cb?.(now)
    },
  }
}

describe('FrameAnimator', () => {
  it('schedules nothing at rest', () => {
    const s = manualScheduler()
    const wake = vi.fn()
    const a = new FrameAnimator(wake, s.scheduler)
    expect(a.isRunning).toBe(false)
    expect(s.hasPending).toBe(false)
    expect(wake).not.toHaveBeenCalled()
  })

  it('runs a job every frame, wakes the renderer, and stops itself when the job is done', () => {
    const s = manualScheduler()
    const wake = vi.fn()
    const a = new FrameAnimator(wake, s.scheduler)
    const seen: number[] = []
    a.add((now) => {
      seen.push(now)
      return now < 30
    })
    expect(a.isRunning).toBe(true)
    s.step(10)
    s.step(20)
    s.step(30) // returns false: last frame
    expect(seen).toEqual([10, 20, 30])
    expect(a.isRunning).toBe(false)
    expect(a.size).toBe(0)
    expect(s.hasPending).toBe(false)
    // One wake per frame (including the final one, so the restored styles are drawn).
    expect(wake).toHaveBeenCalledTimes(3)
    expect(wake).toHaveBeenLastCalledWith(FRAME_WAKE_MS)
  })

  it('adding the same job twice keeps one; removing the last job cancels the frame', () => {
    const s = manualScheduler()
    const a = new FrameAnimator(() => {}, s.scheduler)
    const job = () => true
    a.add(job)
    a.add(job)
    expect(a.size).toBe(1)
    a.remove(job)
    expect(a.size).toBe(0)
    expect(a.isRunning).toBe(false)
    expect(s.hasPending).toBe(false)
  })

  it('keeps running while any job wants more frames', () => {
    const s = manualScheduler()
    const a = new FrameAnimator(() => {}, s.scheduler)
    let shortCalls = 0
    a.add(() => ++shortCalls < 2)
    a.add((now) => now < 100)
    s.step(10)
    s.step(20)
    expect(a.size).toBe(1)
    expect(a.isRunning).toBe(true)
    s.step(100)
    expect(a.isRunning).toBe(false)
  })

  it('a throwing job is dropped, the others go on', () => {
    const s = manualScheduler()
    const a = new FrameAnimator(() => {}, s.scheduler)
    a.add(() => {
      throw new Error('boom')
    })
    let calls = 0
    a.add(() => ++calls < 3)
    s.step(1)
    expect(a.size).toBe(1)
    s.step(2)
    s.step(3)
    expect(a.isRunning).toBe(false)
  })

  it('dispose() clears everything and no frame fires afterwards', () => {
    const s = manualScheduler()
    const job = vi.fn(() => true)
    const a = new FrameAnimator(() => {}, s.scheduler)
    a.add(job)
    a.dispose()
    s.step(5)
    expect(job).not.toHaveBeenCalled()
    expect(a.isRunning).toBe(false)
  })

  it('wakeOnce() draws one frame without a job', () => {
    const s = manualScheduler()
    const wake = vi.fn()
    const a = new FrameAnimator(wake, s.scheduler)
    a.wakeOnce()
    expect(wake).toHaveBeenCalledWith(FRAME_WAKE_MS)
    expect(a.isRunning).toBe(false)
  })
})
