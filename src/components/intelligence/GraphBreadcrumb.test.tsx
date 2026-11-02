import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { GraphBreadcrumb } from './GraphBreadcrumb'
import { graphScaleAtom, intelligenceNodesAtom, selectedNodeIdAtom } from '@/atoms/intelligence'

const node = (id: string, data: Record<string, unknown>) =>
  ({ id, position: { x: 0, y: 0 }, data }) as never

function setup(scale: number, selectedId: string | null) {
  const store = createStore()
  store.set(intelligenceNodesAtom, [
    node('a', { label: 'alpha.rs', entityType: 'file', layer: 'code' }),
  ])
  store.set(graphScaleAtom, scale)
  store.set(selectedNodeIdAtom, selectedId)
  return { store, ...render(<Provider store={store}><GraphBreadcrumb /></Provider>) }
}

describe('GraphBreadcrumb', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing at detail without a selection', () => {
    const { container } = setup(0, null)
    expect(container.firstChild).toBeNull()
  })

  it('shows the selected node name', () => {
    setup(0, 'a')
    expect(screen.getByText('Entire graph')).toBeTruthy()
    expect(screen.getByText('alpha.rs')).toBeTruthy()
  })

  it('shows "Group N" when aggregated without a selection', () => {
    setup(2, null)
    expect(screen.getByText('Entire graph')).toBeTruthy()
    expect(screen.getByText('Group 2')).toBeTruthy()
  })

  it('clicking "Entire graph" resets the scale to 0 and clears the selection', () => {
    const { store } = setup(1, 'a')
    fireEvent.click(screen.getByRole('button', { name: 'Entire graph' }))
    expect(store.get(graphScaleAtom)).toBe(0)
    expect(store.get(selectedNodeIdAtom)).toBeNull()
  })
})
