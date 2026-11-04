import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TreemapView } from './TreemapView'
import type { TmNode, TmEdge } from './treemapLayout'

const file = (path: string, extra: Record<string, unknown> = {}): TmNode => ({
  id: `file:${path}`,
  data: { entityType: 'file', path, ...extra },
})

const nodes: TmNode[] = [
  file('src/a.ts', { pagerank: 0.5, riskLevel: 'high' }),
  file('src/lib/b.ts', { pagerank: 0.2 }),
  file('src/lib/c.ts', { pagerank: 0.1 }),
  { id: 'n1', data: { entityType: 'note' } },
]
const edges: TmEdge[] = [{ source: 'n1', target: 'file:src/a.ts', type: 'LINKED_TO' }]

const originalRect = HTMLElement.prototype.getBoundingClientRect

beforeEach(() => {
  // jsdom has no layout: give the map a real size so the squarify places tiles.
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() {} } as DOMRect
  }
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  }
})

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect
})

describe('TreemapView', () => {
  it('shows no tile when there is no file', () => {
    render(<TreemapView nodes={[{ id: 'n1', data: { entityType: 'note' } }]} edges={[]} onSelect={vi.fn()} />)
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names.filter((n) => n?.startsWith('Open '))).toEqual([])
  })

  it('drills into a folder, then selects a file on click', () => {
    const onSelect = vi.fn()
    render(<TreemapView nodes={nodes} edges={edges} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open src' }))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open a.ts' }))
    expect(onSelect).toHaveBeenCalledWith('file:src/a.ts')
  })

  it('updates the breadcrumb as the user descends', () => {
    render(<TreemapView nodes={nodes} edges={edges} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open src' }))
    expect(screen.getByText('src', { selector: '[aria-current="page"]' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open lib' }))
    expect(screen.getByText('lib', { selector: '[aria-current="page"]' })).toBeTruthy()
    // going back up through the breadcrumb returns to the parent folder
    fireEvent.click(screen.getByRole('button', { name: 'src' }))
    expect(screen.getByText('src', { selector: '[aria-current="page"]' })).toBeTruthy()
  })

  it('switches the colouring prism and marks it pressed', () => {
    render(<TreemapView nodes={nodes} edges={edges} onSelect={vi.fn()} />)
    const churn = screen.getByRole('button', { name: 'Churn' })
    expect(churn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(churn)
    expect(churn.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Risk' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('renders children inside the map (NodeInspector slot)', () => {
    render(
      <TreemapView nodes={nodes} edges={edges} onSelect={vi.fn()}>
        <div data-testid="inspector-slot" />
      </TreemapView>,
    )
    expect(screen.getByTestId('inspector-slot')).toBeTruthy()
  })

  it('goes fullscreen from the button and leaves on Escape', () => {
    const { container } = render(<TreemapView nodes={nodes} edges={edges} onSelect={vi.fn()} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).not.toContain('fixed')
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))
    expect(root.className).toContain('fixed')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(root.className).not.toContain('fixed')
  })
})
