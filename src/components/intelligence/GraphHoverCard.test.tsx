import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { GraphHoverCard } from './GraphHoverCard'
import { hoveredNodeIdAtom, intelligenceNodesAtom } from '@/atoms/intelligence'

const node = (id: string, data: Record<string, unknown>) => ({ id, position: { x: 0, y: 0 }, data }) as never

function setup(hover: string | null, coarse = false) {
  window.matchMedia = ((q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} })) as never
  const store = createStore()
  store.set(intelligenceNodesAtom, [
    node('a', { label: 'alpha.rs', entityType: 'file', layer: 'code', community_id: 7 }),
    node('b', { label: 'beta', entityType: 'note', layer: 'knowledge' }),
  ])
  store.set(hoveredNodeIdAtom, hover)
  return render(<Provider store={store}><GraphHoverCard /></Provider>)
}

describe('GraphHoverCard', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('renders nothing without hover', () => {
    const { container } = setup(null)
    expect(container.firstChild).toBeNull()
  })

  it('shows label, type, layer, community and counter, without clicks', () => {
    setup('a')
    const el = screen.getByRole('status')
    expect(el.className).toContain('pointer-events-none')
    expect(screen.getByText('alpha.rs')).toBeTruthy()
    expect(screen.getByText('file · code')).toBeTruthy()
    expect(screen.getByText('c7')).toBeTruthy()
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })

  it('omits the community line when unknown (no undefined, no empty line)', () => {
    setup('b')
    const el = screen.getByRole('status')
    expect(el.textContent).not.toMatch(/undefined|null/)
    expect(el.children.length).toBe(3)
  })

  it('shows nothing on a coarse pointer', () => {
    const { container } = setup('a', true)
    expect(container.firstChild).toBeNull()
  })
})
