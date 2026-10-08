import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { LayerControls, type ProjectMeta } from '../LayerControls'
import {
  energyHeatmapAtom,
  touchesHeatmapAtom,
  showCommunityHullsAtom,
  showAllEdgesAtom,
  loadingLayersAtom,
  coChangeThresholdAtom,
} from '@/atoms/intelligence'
import { activationSearchOpenAtom } from '../SpreadingActivation'
import { LAYERS, LAYER_ORDER } from '@/constants/intelligence'
import type { IntelligenceLayer } from '@/types/intelligence'

const metas: ProjectMeta[] = [
  { slug: 'a', name: 'Alpha', node_count: 3 },
  { slug: 'b', name: 'Beta', node_count: 5 },
]

function setup(props: Partial<React.ComponentProps<typeof LayerControls>> = {}, prime?: (s: ReturnType<typeof createStore>) => void) {
  const store = createStore()
  prime?.(store)
  const fns = {
    onToggleLayer: vi.fn(),
    onApplyPreset: vi.fn(),
    onToggleCustom: vi.fn(),
    onToggleProjectFilter: vi.fn(),
    onClearProjectFilters: vi.fn(),
    onHoverProject: vi.fn(),
  }
  render(
    <Provider store={store}>
      <LayerControls
        visibleLayers={new Set<IntelligenceLayer>(['code'])}
        customMode={false}
        {...fns}
        {...props}
      />
    </Provider>,
  )
  return { store, ...fns }
}

describe('LayerControls', () => {
  it('applies a preset and leaves custom mode', () => {
    const h = setup({ customMode: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }))
    expect(h.onApplyPreset).toHaveBeenCalledWith('code_only')
    expect(h.onToggleCustom).toHaveBeenCalled()
  })

  it('applies a preset without toggling custom when not in custom mode', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }))
    expect(h.onApplyPreset).toHaveBeenCalled()
    expect(h.onToggleCustom).not.toHaveBeenCalled()
  })

  it('opens custom mode once, and ignores a click on Custom when already custom', () => {
    const a = setup()
    fireEvent.click(screen.getByText('Custom'))
    expect(a.onToggleCustom).toHaveBeenCalledTimes(1)
  })

  it('does nothing when Custom is clicked in custom mode', () => {
    const a = setup({ customMode: true })
    fireEvent.click(screen.getByText('Custom'))
    expect(a.onToggleCustom).not.toHaveBeenCalled()
  })

  it('toggles budgeted edges and shows the hidden count', () => {
    const { store } = setup()
    const btn = screen.getByTitle('Show all edges (0 hidden)')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    expect(store.get(showAllEdgesAtom)).toBe(true)
    expect(screen.getByText('All edges')).toBeTruthy()
    expect(screen.getByTitle('Show only priority edges (budget mode)')).toBeTruthy()
  })

  it('filters by project: toggle, hover, clear', () => {
    const h = setup({ projectMetas: metas, activeProjectFilters: new Set(['a']) })
    const alpha = screen.getByTitle('Alpha (3 nodes) — click to deselect')
    fireEvent.click(alpha)
    expect(h.onToggleProjectFilter).toHaveBeenCalledWith('a')
    fireEvent.mouseEnter(alpha)
    expect(h.onHoverProject).toHaveBeenCalledWith('a')
    fireEvent.mouseLeave(alpha)
    expect(h.onHoverProject).toHaveBeenLastCalledWith(null)
    fireEvent.click(screen.getByLabelText('Clear project filters'))
    fireEvent.click(screen.getByTitle('Show all projects'))
    expect(h.onClearProjectFilters).toHaveBeenCalledTimes(2)
  })

  it('hides the project views with one project or no filter callbacks, and the clear button without filters', () => {
    setup({ projectMetas: metas, activeProjectFilters: new Set() })
    expect(screen.getByRole('group', { name: 'Project views' })).toBeTruthy()
    expect(screen.queryByLabelText('Clear project filters')).toBeNull()
  })

  it('does not show project views for a single project', () => {
    setup({ projectMetas: [metas[0]] })
    expect(screen.queryByRole('group', { name: 'Project views' })).toBeNull()
  })

  it('lists layers in custom mode, toggles them and shows loading', () => {
    const loading = LAYER_ORDER[1]
    const h = setup({ customMode: true }, (s) => s.set(loadingLayersAtom, new Set([loading])))
    expect(screen.getByRole('group', { name: 'Layers' })).toBeTruthy()
    expect(screen.getByRole('status', { name: `Loading ${LAYERS[loading].label}` })).toBeTruthy()
    fireEvent.click(screen.getByTitle(LAYERS[LAYER_ORDER[0]].description))
    expect(h.onToggleLayer).toHaveBeenCalledWith(LAYER_ORDER[0])
  })

  it('toggles the overlays and opens the activation search', () => {
    const { store } = setup({ customMode: true })
    fireEvent.click(screen.getByText('Energy heatmap'))
    expect(store.get(energyHeatmapAtom)).toBe(true)
    fireEvent.click(screen.getByText('Churn heatmap'))
    expect(store.get(touchesHeatmapAtom)).toBe(true)
    fireEvent.click(screen.getByText('Communities'))
    expect(store.get(showCommunityHullsAtom)).toBe(false)
    fireEvent.click(screen.getByText('Activation'))
    expect(store.get(activationSearchOpenAtom)).toBe(true)
  })

  it('shows the co-change slider only with the fabric layer', () => {
    const { store } = setup({ customMode: true, visibleLayers: new Set<IntelligenceLayer>(['fabric']) })
    const slider = screen.getByLabelText(/Co-change/) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '7' } })
    expect(store.get(coChangeThresholdAtom)).toBe(7)
  })

  it('omits the slider without the fabric layer', () => {
    setup({ customMode: true })
    expect(screen.queryByLabelText(/Co-change/)).toBeNull()
  })
})
