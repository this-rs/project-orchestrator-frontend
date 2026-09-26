import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { NeighborhoodParams } from '@/services/neighborhood'

vi.mock('@/services/neighborhood', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/neighborhood')>()
  return { ...mod, neighborhoodApi: { get: vi.fn() } }
})

import { neighborhoodApi } from '@/services/neighborhood'
import { EntityGraph } from '../EntityGraph'
import { clearNeighborhoodCache } from '../useNeighborhood'
import { AGENT_SENTENCE } from '../EntityGraphExplainer'
import { emptyNeighborhood, noteNeighborhood } from './fixtures'

const get = vi.mocked(neighborhoodApi.get)
const lastParams = (): NeighborhoodParams => get.mock.calls[get.mock.calls.length - 1][0]

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(async () => noteNeighborhood())
  clearNeighborhoodCache()
})

async function renderLoaded(props: Partial<Parameters<typeof EntityGraph>[0]> = {}) {
  const utils = render(
    <EntityGraph entityType="note" entityId="n1" reliefDebounceMs={20} {...props} />
  )
  await screen.findByRole('button', { name: 'Décision : Render on demand' })
  return utils
}

describe('<EntityGraph />', () => {
  it('shows a static skeleton while loading, then the center and its two rings', async () => {
    render(<EntityGraph entityType="note" entityId="n1" />)
    expect(screen.getByTestId('entity-graph-skeleton')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Note : Graph render budget' })
    expect(screen.queryByTestId('entity-graph-skeleton')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-node-id]')).toHaveLength(9)
    expect(screen.getByText('1 saut')).toBeInTheDocument()
    expect(screen.getByText('2 sauts')).toBeInTheDocument()
    expect(lastParams()).toMatchObject({
      entityType: 'note',
      entityId: 'n1',
      depth: 2,
      minWeight: 0.2,
      limit: 150,
      layers: undefined,
    })
  })

  it('shows the truncated notice and layer counts from stats', async () => {
    await renderLoaded()
    expect(screen.getByText('9 nœuds affichés sur 27')).toBeInTheDocument()
    const layers = screen.getByRole('group', { name: 'Couches' })
    expect(within(layers).getByRole('button', { name: /Code/ })).toHaveTextContent('21')
  })

  it('depth, layers and (debounced) relief change the request params', async () => {
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Profondeur 3' }))
    await waitFor(() => expect(lastParams().depth).toBe(3))
    expect(screen.getByRole('button', { name: 'Profondeur 3' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.click(screen.getByRole('button', { name: /Code/ }))
    await waitFor(() =>
      expect(lastParams().layers).toEqual(['behavioral', 'knowledge', 'neural', 'planning'])
    )

    const calls = get.mock.calls.length
    const slider = screen.getByRole('slider', { name: 'Relief' })
    fireEvent.change(slider, { target: { value: '0.4' } })
    fireEvent.change(slider, { target: { value: '0.6' } })
    expect(get.mock.calls.length).toBe(calls) // debounced: nothing yet
    await waitFor(() => expect(lastParams().minWeight).toBe(0.6))
    expect(get.mock.calls.length).toBe(calls + 1) // one request for the whole drag

    // reset restores everything — and the initial params are served from cache
    const beforeReset = get.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser la vue' }))
    expect(screen.getByRole('button', { name: 'Profondeur 2' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: /Code/ })).toHaveAttribute('aria-pressed', 'true')
    expect(slider).toHaveValue('0.2')
    await new Promise((r) => setTimeout(r, 60))
    expect(get.mock.calls.length).toBe(beforeReset)
    expect(screen.getByText('9 nœuds affichés sur 27')).toBeInTheDocument()
  })

  it('never disables the last layer', async () => {
    await renderLoaded({ initialLayers: ['code'] })
    const code = screen.getByRole('button', { name: /Code/ })
    fireEvent.click(code)
    expect(code).toHaveAttribute('aria-pressed', 'true')
    expect(lastParams().layers).toEqual(['code'])
  })

  it('tapping a node shows its info card with the relation to the center', async () => {
    const onOpenNode = vi.fn()
    await renderLoaded({
      onOpenNode,
      hrefForNode: (n) => (n.type === 'plan' ? `/workspace/ws/plans/${n.id}` : null),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan : Mobile perf plan' }))
    const card = screen.getByRole('dialog', { name: 'Détails : Mobile perf plan' })
    expect(within(card).getByText(/à 2 sauts/)).toBeInTheDocument()
    expect(within(card).getByText('linked to')).toBeInTheDocument()
    expect(within(card).getByText('has task')).toBeInTheDocument()
    expect(within(card).getByText('Stop 60 fps idle loop')).toBeInTheDocument()

    const open = within(card).getByRole('link', { name: /Ouvrir/ })
    expect(open).toHaveAttribute('href', '/workspace/ws/plans/p1')
    fireEvent.click(open)
    expect(onOpenNode).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', type: 'plan' }))

    // Node without a page but with onOpenNode → plain button
    fireEvent.click(screen.getByRole('button', { name: 'Fichier : useRenderLoop.ts' }))
    const fileCard = screen.getByRole('dialog', { name: 'Détails : useRenderLoop.ts' })
    expect(within(fileCard).getByText('src/components/intelligence')).toBeInTheDocument()
    fireEvent.click(within(fileCard).getByRole('button', { name: /Ouvrir/ }))
    expect(onOpenNode).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'f1' }))

    // Close
    fireEvent.click(within(fileCard).getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects by keyboard, toggles off, and background tap deselects', async () => {
    await renderLoaded()
    const center = screen.getByRole('button', { name: 'Note : Graph render budget' })
    fireEvent.keyDown(center, { key: 'Enter' })
    const card = screen.getByRole('dialog')
    expect(within(card).getByText(/entité courante/)).toBeInTheDocument()
    expect(within(card).queryByText(/Ouvrir/)).not.toBeInTheDocument()
    fireEvent.click(center) // second tap toggles off
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tâche : Stop 60 fps idle loop' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('group', { name: 'Graphe du voisinage' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hover (mouse) highlights neighbours without selecting', async () => {
    await renderLoaded()
    const node = screen.getByRole('button', { name: 'Décision : Render on demand' })
    fireEvent.pointerEnter(node, { pointerType: 'mouse' })
    fireEvent.pointerLeave(node, { pointerType: 'mouse' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the empty state with ways out', async () => {
    get.mockImplementation(async () => emptyNeighborhood())
    render(<EntityGraph entityType="note" entityId="n1" reliefDebounceMs={0} />)
    expect(await screen.findByText('Aucune relation à ce niveau de relief')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aller à la profondeur 3' }))
    await waitFor(() => expect(lastParams().depth).toBe(3))
    fireEvent.click(await screen.findByRole('button', { name: 'Baisser le relief' }))
    await waitFor(() => expect(lastParams().minWeight).toBe(0))
  })

  it('shows an error with a working retry', async () => {
    get.mockRejectedValueOnce(new Error('backend down'))
    render(<EntityGraph entityType="note" entityId="n1" />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('backend down')
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }))
    await screen.findByRole('button', { name: 'Décision : Render on demand' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains the view and lists the types on screen', async () => {
    await renderLoaded()
    expect(screen.queryByText(AGENT_SENTENCE)).not.toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Légende des types' })
    expect(within(legend).getByText('Décision')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Comment lire ce graphe/ }))
    expect(screen.getByText(AGENT_SENTENCE)).toBeInTheDocument()
    expect(screen.getByText('Anneaux')).toBeInTheDocument()
    expect(screen.getByText('Relief', { selector: 'dt' })).toBeInTheDocument()
  })

  it('pan / zoom only touch the <g> transform — no re-layout, drags are not taps', async () => {
    await renderLoaded()
    const svg = screen.getByRole('group', { name: 'Graphe du voisinage' })
    const g = svg.querySelector(':scope > g')!
    const node = screen.getByRole('button', { name: 'Décision : Render on demand' })
    const before = node.getAttribute('style')

    fireEvent.click(screen.getByRole('button', { name: 'Zoomer' }))
    await waitFor(() => expect(g.getAttribute('transform')).toMatch(/scale\(1\.3/))

    // drag: down → move far → up → the click that follows must not select
    fireEvent.pointerDown(node, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 60, clientY: 40 })
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 60, clientY: 40 })
    fireEvent.click(node)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(g.getAttribute('transform')).toMatch(/translate\((?!0\.00 0\.00)/))

    // pinch with two pointers
    fireEvent.pointerDown(svg, { pointerId: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerDown(svg, { pointerId: 3, clientX: 100, clientY: 0 })
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 200, clientY: 0 })
    fireEvent.pointerUp(svg, { pointerId: 2 })
    fireEvent.pointerUp(svg, { pointerId: 3 })

    // ctrl+wheel zooms, plain wheel scrolls the page
    fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true })
    fireEvent.wheel(svg, { deltaY: -100 })

    // tap (no movement) still selects
    fireEvent.pointerDown(node, { pointerId: 4, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(node, { pointerId: 4, clientX: 5, clientY: 5 })
    fireEvent.click(node)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    expect(node.getAttribute('style')).toBe(before) // nodes never moved

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser la vue' }))
    await waitFor(() => expect(g.getAttribute('transform')).toBeNull())
  })
})
