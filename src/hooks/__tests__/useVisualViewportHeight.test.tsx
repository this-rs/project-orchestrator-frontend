import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useVisualViewportHeight } from '../useVisualViewportHeight'

const LAYOUT_HEIGHT = 800

interface FakeViewport {
  height: number
  offsetTop: number
  scale: number
  addEventListener: (type: string, fn: () => void) => void
  removeEventListener: (type: string, fn: () => void) => void
  emit: (type: string) => void
}

function fakeViewport(): FakeViewport {
  const listeners = new Map<string, Set<() => void>>()
  return {
    height: LAYOUT_HEIGHT,
    offsetTop: 0,
    scale: 1,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
    emit: (type) => listeners.get(type)?.forEach((fn) => fn()),
  }
}

let seen: Array<number | undefined> = []
function Probe() {
  const box = useVisualViewportHeight()
  seen.push(box?.height)
  return <textarea data-testid="field" />
}

describe('useVisualViewportHeight', () => {
  let vv: FakeViewport
  let frames: Array<FrameRequestCallback>

  const runFrame = () => {
    const due = frames
    frames = []
    act(() => due.forEach((fn) => fn(0)))
  }

  beforeEach(() => {
    seen = []
    frames = []
    vv = fakeViewport()
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: LAYOUT_HEIGHT, configurable: true })
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn))
    vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
  })

  it('stays inert while no keyboard is up', () => {
    render(<Probe />)
    expect(seen.at(-1)).toBeUndefined()
    expect(frames).toHaveLength(0) // no per-frame work without a focused field
  })

  it('covers [0, bottom of the visible area] once a field is focused and the keyboard is up', () => {
    const { getByTestId } = render(<Probe />)
    vv.height = 450
    act(() => getByTestId('field').focus())
    expect(seen.at(-1)).toBe(450)
  })

  it('follows the OS pan frame by frame, without waiting for an event WebKit may never send', () => {
    const { getByTestId } = render(<Probe />)
    vv.height = 450
    act(() => getByTestId('field').focus())
    expect(seen.at(-1)).toBe(450)

    // iOS pans the visual viewport to reveal the field — and sends nothing.
    vv.offsetTop = 120
    runFrame()
    expect(seen.at(-1)).toBe(570)

    vv.offsetTop = 0
    runFrame()
    expect(seen.at(-1)).toBe(450)
  })

  it('stops tracking and releases the panel as soon as the field loses the focus', () => {
    const { getByTestId } = render(<Probe />)
    vv.height = 450
    act(() => getByTestId('field').focus())
    act(() => getByTestId('field').blur())
    expect(seen.at(-1)).toBeUndefined()
    runFrame()
    expect(frames).toHaveLength(0)
  })

  it('does not mistake a pinch-zoom for a keyboard', () => {
    const { getByTestId } = render(<Probe />)
    // Zoomed x2: the visual viewport shows half the layout height, no keyboard anywhere.
    vv.scale = 2
    vv.height = LAYOUT_HEIGHT / 2
    act(() => getByTestId('field').focus())
    expect(seen.at(-1)).toBeUndefined()
  })
})
