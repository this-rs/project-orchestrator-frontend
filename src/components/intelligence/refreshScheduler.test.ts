import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRefreshScheduler } from './refreshScheduler'

describe('createRefreshScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs once after the window, however many requests came in', () => {
    const run = vi.fn()
    const s = createRefreshScheduler(run, 2000, () => true)
    for (let i = 0; i < 30; i++) s.request()
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not slide the window: a long burst still refreshes on time', () => {
    const run = vi.fn()
    const s = createRefreshScheduler(run, 2000, () => true)
    s.request()
    for (let t = 0; t < 1900; t += 100) {
      vi.advanceTimersByTime(100)
      s.request()
    }
    vi.advanceTimersByTime(100)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('a request after the refresh opens a new window', () => {
    const run = vi.fn()
    const s = createRefreshScheduler(run, 1000, () => true)
    s.request()
    vi.advanceTimersByTime(1000)
    s.request()
    vi.advanceTimersByTime(1000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('a hidden tab waits to be seen, then refreshes once', () => {
    let visible = false
    const run = vi.fn()
    const s = createRefreshScheduler(run, 1000, () => visible)
    s.request()
    vi.advanceTimersByTime(1000)
    expect(run).not.toHaveBeenCalled()
    s.request() // absorbed while waiting
    visible = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(run).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancel drops a pending refresh, and a waiting one', () => {
    const run = vi.fn()
    const s = createRefreshScheduler(run, 1000, () => true)
    s.request()
    s.cancel()
    vi.advanceTimersByTime(5000)
    expect(run).not.toHaveBeenCalled()

    let visible = false
    const s2 = createRefreshScheduler(run, 1000, () => visible)
    s2.request()
    vi.advanceTimersByTime(1000)
    s2.cancel()
    visible = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(run).not.toHaveBeenCalled()
  })
})
