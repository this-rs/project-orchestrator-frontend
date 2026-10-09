/**
 * Placement of the mobile reference sheet from the VISUAL viewport.
 * jsdom has no layout: the anchor rectangle and the visualViewport are stand-ins,
 * so this proves the arithmetic and the subscriptions, not what a screen shows
 * (that is the browser check).
 *
 * Run with: npx vitest run src/hooks/useSheetPlacement.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSheetPlacement } from './useSheetPlacement'

class FakeVisualViewport extends EventTarget {
  height = 740
  offsetTop = 0
}

let vv: FakeVisualViewport
let anchor: HTMLElement
let top = 660

beforeEach(() => {
  vv = new FakeVisualViewport()
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 740, configurable: true, writable: true })
  anchor = document.createElement('div')
  top = 660
  anchor.getBoundingClientRect = () => ({ top, bottom: top + 80, left: 0, right: 360, width: 360, height: 80, x: 0, y: top, toJSON: () => ({}) })
  document.body.append(anchor)
})
afterEach(() => {
  anchor.remove()
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
})

describe('useSheetPlacement', () => {
  it('sits right above the anchor, in fixed coordinates of the layout viewport', () => {
    const { result } = renderHook(() => useSheetPlacement(anchor, true))
    expect(result.current.bottom).toBe(740 - 660)
  })

  it('never takes more than half of what the visual viewport leaves visible', () => {
    const { result } = renderHook(() => useSheetPlacement(anchor, true))
    expect(result.current.maxHeight).toBe(370)
  })

  it('follows the visual viewport when the virtual keyboard opens (resize event)', () => {
    const { result } = renderHook(() => useSheetPlacement(anchor, true))
    const before = result.current.maxHeight
    act(() => {
      // Keyboard up: the visible area is 400px high and the composer rides on top of it.
      vv.height = 400
      top = 320
      vv.dispatchEvent(new Event('resize'))
    })
    expect(result.current.maxHeight).toBeLessThan(before)
    expect(result.current.maxHeight).toBe(200)
    // The sheet never extends above the visible area: it stays under the top edge of the visual viewport.
    expect(result.current.maxHeight).toBeLessThanOrEqual(320 - vv.offsetTop - 8)
  })

  it('follows a visual viewport that is panned (scroll event, offsetTop)', () => {
    const { result } = renderHook(() => useSheetPlacement(anchor, true))
    act(() => {
      vv.height = 300
      vv.offsetTop = 250
      top = 500
      vv.dispatchEvent(new Event('scroll'))
    })
    // available above the anchor inside the visible area: 500 - 250 - 8 = 242, half of 300 = 150
    expect(result.current.maxHeight).toBe(150)
  })

  it('keeps a usable minimum when almost nothing is left above the composer', () => {
    top = 40
    const { result } = renderHook(() => useSheetPlacement(anchor, true))
    expect(result.current.maxHeight).toBeGreaterThanOrEqual(88)
  })

  it('does not listen when closed, and stops listening on unmount', () => {
    let listeners = 0
    const add = vv.addEventListener.bind(vv)
    vv.addEventListener = ((...a: Parameters<typeof add>) => {
      listeners++
      return add(...a)
    }) as typeof vv.addEventListener
    renderHook(() => useSheetPlacement(anchor, false))
    expect(listeners).toBe(0)
    const { unmount } = renderHook(() => useSheetPlacement(anchor, true))
    expect(listeners).toBeGreaterThan(0)
    const removed: string[] = []
    const rm = vv.removeEventListener.bind(vv)
    vv.removeEventListener = ((t: string, ...r: never[]) => {
      removed.push(t)
      return (rm as (...a: unknown[]) => void)(t, ...r)
    }) as typeof vv.removeEventListener
    unmount()
    expect(removed).toContain('resize')
  })

  it('falls back on the window when there is no visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    const { result } = renderHook(() => useSheetPlacement(anchor, true))
    expect(result.current.maxHeight).toBe(370)
    act(() => {
      ;(window as { innerHeight: number }).innerHeight = 500
      top = 420
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.maxHeight).toBe(250)
  })
})
