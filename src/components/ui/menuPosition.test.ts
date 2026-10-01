import { describe, it, expect } from 'vitest'
import { computeMenuPosition, positionFloating, type Rect } from './menuPosition'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// vitest runs with css: false, so read the stylesheet as text.
const indexCss = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

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

describe('positionFloating — data-placement for the entrance motion', () => {
  function place(triggerTop: number) {
    const trigger = document.createElement('button')
    const menu = document.createElement('div')
    trigger.getBoundingClientRect = () => ({ ...rect(340, triggerTop), x: 340, y: triggerTop, toJSON: () => ({}) }) as DOMRect
    Object.defineProperty(menu, 'offsetWidth', { value: 180 })
    Object.defineProperty(menu, 'scrollHeight', { value: 200 })
    positionFloating(trigger, menu)
    return menu
  }

  it('marks a menu opened below its trigger as bottom', () => {
    window.innerHeight = 844
    window.innerWidth = 390
    expect(place(100).dataset.placement).toBe('bottom')
  })

  it('marks a menu flipped above its trigger as top', () => {
    window.innerHeight = 844
    window.innerWidth = 390
    expect(place(780).dataset.placement).toBe('top')
  })

  it('the pop-in CSS grows a flipped menu from its bottom edge, rising', () => {
    const rule = indexCss.match(/\.ui-pop-in\[data-placement="top"\]\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/transform-origin:\s*bottom/)
    expect(rule?.[1]).toMatch(/--pop-from-y:\s*4px/)
    expect(indexCss).toMatch(/translateY\(var\(--pop-from-y/)
  })
})
