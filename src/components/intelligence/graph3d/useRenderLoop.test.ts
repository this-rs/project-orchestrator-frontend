import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import {
  shouldRenderContinuously,
  shouldHeartbeat,
  isMobileLikeDevice,
  type RenderLoopInput,
} from './useRenderLoop'

const IDLE: RenderLoopInput = {
  documentHidden: false,
  onScreen: true,
  engineRunning: false,
  particlesAnimating: false,
  now: 1000,
  keepAliveUntil: 0,
}

describe('shouldRenderContinuously', () => {
  it('idles on a settled, static, visible scene', () => {
    expect(shouldRenderContinuously(IDLE)).toBe(false)
  })

  it('renders while the force layout is still ticking', () => {
    expect(shouldRenderContinuously({ ...IDLE, engineRunning: true })).toBe(true)
  })

  it('renders while link particles are on screen', () => {
    expect(shouldRenderContinuously({ ...IDLE, particlesAnimating: true })).toBe(true)
  })

  it('renders inside the keep-alive window and stops after it', () => {
    expect(shouldRenderContinuously({ ...IDLE, keepAliveUntil: 1001 })).toBe(true)
    expect(shouldRenderContinuously({ ...IDLE, keepAliveUntil: 1000 })).toBe(false)
  })

  it('stops when the document is hidden, whatever else is true', () => {
    expect(shouldRenderContinuously({
      documentHidden: true,
      onScreen: true,
      engineRunning: true,
      particlesAnimating: true,
      now: 0,
      keepAliveUntil: Number.MAX_SAFE_INTEGER,
    })).toBe(false)
  })

  it('stops when off screen, even with particles or a keep-alive window', () => {
    expect(shouldRenderContinuously({ ...IDLE, onScreen: false, particlesAnimating: true })).toBe(false)
    expect(shouldRenderContinuously({ ...IDLE, onScreen: false, keepAliveUntil: 9999 })).toBe(false)
  })

  it('keeps rendering off screen while the layout is running', () => {
    // The layout's stop condition is wall-clock, so pausing mid-layout would
    // truncate it. Only a hidden document (where the browser stops rAF anyway)
    // is allowed to do that.
    expect(shouldRenderContinuously({ ...IDLE, onScreen: false, engineRunning: true })).toBe(true)
  })
})

describe('shouldHeartbeat', () => {
  it('emits the safety heartbeat only when visible and on screen', () => {
    expect(shouldHeartbeat({ documentHidden: false, onScreen: true })).toBe(true)
    expect(shouldHeartbeat({ documentHidden: true, onScreen: true })).toBe(false)
    expect(shouldHeartbeat({ documentHidden: false, onScreen: false })).toBe(false)
  })
})

describe('isMobileLikeDevice', () => {
  const originalWidth = window.innerWidth
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true, writable: true })
    window.matchMedia = originalMatchMedia
  })

  it('is true for a coarse pointer on a wide screen (tablet)', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    expect(isMobileLikeDevice()).toBe(true)
  })

  it('is true for a narrow viewport with a fine pointer', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    Object.defineProperty(window, 'innerWidth', { value: 420, configurable: true, writable: true })
    expect(isMobileLikeDevice()).toBe(true)
  })

  it('is false for a wide viewport with a fine pointer (desktop)', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    expect(isMobileLikeDevice()).toBe(false)
  })

  it('does not look at the user agent', () => {
    const spy = vi.fn().mockReturnValue({ matches: false })
    window.matchMedia = spy as unknown as typeof window.matchMedia
    isMobileLikeDevice()
    expect(spy).toHaveBeenCalledWith('(pointer: coarse)')
  })
})
