import { describe, it, expect } from 'vitest'
import { computeMenuPosition, type Rect } from './menuPosition'

const VIEWPORT = { width: 390, height: 844 } // iPhone 14

function rect(left: number, top: number, width = 32, height = 32): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

describe('computeMenuPosition', () => {
  it('opens below the trigger, right-aligned by default', () => {
    const pos = computeMenuPosition(rect(340, 100), { width: 180, height: 120 }, VIEWPORT)
    expect(pos.placement).toBe('bottom')
    expect(pos.top).toBe(136) // bottom (132) + gap 4
    expect(pos.left).toBe(372 - 180)
  })

  it('aligns start edges when asked', () => {
    const pos = computeMenuPosition(rect(20, 100), { width: 180, height: 120 }, VIEWPORT, { align: 'start' })
    expect(pos.left).toBe(20)
  })

  it('clamps inside the viewport horizontally (8px margin)', () => {
    const right = computeMenuPosition(rect(300, 100), { width: 180, height: 50 }, VIEWPORT, { align: 'start' })
    expect(right.left).toBe(390 - 8 - 180)
    const left = computeMenuPosition(rect(4, 100), { width: 180, height: 50 }, VIEWPORT)
    expect(left.left).toBe(8)
  })

  it('flips above when there is not enough room below', () => {
    const pos = computeMenuPosition(rect(340, 780), { width: 180, height: 200 }, VIEWPORT)
    expect(pos.placement).toBe('top')
    expect(pos.top).toBe(780 - 4 - 200)
  })

  it('caps the height to the available space', () => {
    const pos = computeMenuPosition(rect(340, 400), { width: 180, height: 2000 }, VIEWPORT)
    expect(pos.maxHeight).toBeLessThan(844)
    expect(pos.top).toBeGreaterThanOrEqual(0)
  })
})
