/**
 * The composer floats over the bottom of the transcript (so the text scrolls UNDER its
 * glass). The transcript therefore needs to know how tall the dock is — it changes with
 * the queue bar, attachments, the compaction banner — to keep its last line reachable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ComposerDock } from './ComposerDock'

type RoCallback = () => void
const observers: RoCallback[] = []
let height = 120

afterEach(() => {
  observers.length = 0
  height = 120
  vi.unstubAllGlobals()
})

function stubResizeObserver() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: RoCallback) {
        observers.push(cb)
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ height, width: 300, top: 0, left: 0, right: 300, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect,
  )
}

describe('ComposerDock', () => {
  it('reports its height on mount and every time it resizes', () => {
    stubResizeObserver()
    const onHeight = vi.fn()
    render(<ComposerDock onHeight={onHeight}><div>composer</div></ComposerDock>)
    expect(onHeight).toHaveBeenLastCalledWith(120)
    height = 187.4
    act(() => observers.forEach((cb) => cb()))
    expect(onHeight).toHaveBeenLastCalledWith(188) // rounded up: never under-reserve a pixel
  })

  it('is pinned to the bottom, over the transcript', () => {
    stubResizeObserver()
    render(<ComposerDock onHeight={() => {}}><div>composer</div></ComposerDock>)
    const dock = screen.getByText('composer').parentElement!
    expect(dock.className).toMatch(/\babsolute\b/)
    expect(dock.className).toMatch(/\bbottom-0\b/)
  })

  it('lets clicks through its empty margins but not through its content', () => {
    stubResizeObserver()
    render(<ComposerDock onHeight={() => {}}><div>composer</div></ComposerDock>)
    const content = screen.getByText('composer')
    const dock = content.parentElement!
    expect(dock.className).toContain('pointer-events-none')
    expect(dock.className).toContain('[&>*]:pointer-events-auto')
  })

  it('still renders where ResizeObserver does not exist (reports once)', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height: 64 }) as DOMRect,
    )
    const onHeight = vi.fn()
    render(<ComposerDock onHeight={onHeight}><div>composer</div></ComposerDock>)
    expect(onHeight).toHaveBeenCalledWith(64)
  })
})
