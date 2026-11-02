import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { selectedNodeIdAtom } from '@/atoms/intelligence'
import { activationSearchOpenAtom } from '../SpreadingActivation'
import { graphCacheClear } from '../graphCache'

// jsdom has no layout: give the map a real size so the treemap places tiles,
// and stub ResizeObserver (the code map and the 3D container measure with it).
const originalRect = HTMLElement.prototype.getBoundingClientRect
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() {} } as DOMRect
  }
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  }
  graphCacheClear()
})
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect
})

const intelligenceApi = vi.hoisted(() => ({ getGraph: vi.fn(), getSummary: vi.fn() }))
vi.mock('@/services/intelligence', () => ({ intelligenceApi }))
vi.mock('../useGraphWebSocket', () => ({ useGraphWebSocket: () => {} }))
vi.mock('../useProtocolRunEvents', () => ({ useProtocolRunEvents: () => {} }))
vi.mock('@/services/code', () => ({
  codeApi: {
    getNodeImportance: vi.fn(() => Promise.reject(new Error('no importance'))),
    getFileSymbols: vi.fn(() => Promise.resolve({ functions: [] })),
  },
}))
vi.mock('@/services/notes', () => ({ notesApi: { getEntityNotes: vi.fn(() => Promise.resolve({ items: [] })) } }))
vi.mock('@/services/commits', () => ({ commitsApi: { getFileCoChangers: vi.fn(() => Promise.resolve({ items: [] })) } }))
// The 3D canvas needs WebGL/three.js — replace it with a stub that simulates a
// node click (a 3D node click sets selectedNodeIdAtom, exactly like the real
// component's onNodeClick / custom pick).
vi.mock('../graph3d/IntelligenceGraph3D', () => ({
  default: function Fake3D() {
    const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
    return <button type="button" onClick={() => setSelectedNodeId('file:src/a.ts')}>3d-node-a</button>
  },
}))

import IntelligenceGraphPage from '../IntelligenceGraphPage'

function graphResponse() {
  return {
    nodes: [
      { id: 'file:README.md', type: 'file', label: 'README.md', layer: 'code', attributes: { path: 'README.md' } },
      { id: 'file:src/a.ts', type: 'file', label: 'a.ts', layer: 'code', attributes: { path: 'src/a.ts' } },
    ],
    edges: [],
    communities: [],
    stats: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  intelligenceApi.getGraph.mockImplementation((_slug: string, params: { layers?: string[] }) => {
    const layers = params?.layers ?? []
    if (layers.includes('code')) return Promise.resolve(graphResponse())
    return Promise.resolve({ nodes: [], edges: [], communities: [], stats: {} })
  })
  intelligenceApi.getSummary.mockResolvedValue({ layers: {}, totalNodes: 2, totalEdges: 0 })
})

describe('IntelligenceGraphPage — the node "fiche" opens', () => {
  it('shows the inspector content when a code-map cell is clicked', async () => {
    render(
      <Provider store={createStore()}><MemoryRouter><IntelligenceGraphPage projectSlug="p" /></MemoryRouter></Provider>,
    )
    // The default view is the code map (treemap). Click the root file cell.
    fireEvent.click(await screen.findByRole('button', { name: 'Open README.md' }))
    // The inspector header + entity id footer must both show.
    expect(await screen.findByText('file:README.md')).toBeTruthy()
  })

  it('clears a stale selection when the page (re)loads its graph', async () => {
    const store = createStore()
    store.set(selectedNodeIdAtom, 'file:gone.ts')
    render(
      <Provider store={store}><MemoryRouter><IntelligenceGraphPage projectSlug="p" /></MemoryRouter></Provider>,
    )
    // The graph hook clears the selected node when it loads/reloads a project:
    // a stale id must not leave an empty "fiche" on screen.
    await waitFor(() => expect(store.get(selectedNodeIdAtom)).toBeNull())
  })

  it('shows the inspector content when a 3D node is clicked', async () => {
    render(
      <Provider store={createStore()}><MemoryRouter><IntelligenceGraphPage projectSlug="p" /></MemoryRouter></Provider>,
    )
    // Switch to the 3D view, then click the stubbed node.
    fireEvent.click(screen.getByRole('button', { name: '3D' }))
    fireEvent.click(await screen.findByRole('button', { name: '3d-node-a' }))
    // The inspector header (label "a.ts") and footer (entity id) must show.
    // The breadcrumb also echoes the selected label, so allow either copy.
    expect((await screen.findAllByText('a.ts')).length).toBeGreaterThan(0)
    expect(screen.getByText('file:src/a.ts')).toBeTruthy()
  })

  it('clears the selection when Escape is pressed with a node selected', async () => {
    const store = createStore()
    render(
      <Provider store={store}><MemoryRouter><IntelligenceGraphPage projectSlug="p" /></MemoryRouter></Provider>,
    )
    // Select a code-map cell (the default view), then press Escape.
    fireEvent.click(await screen.findByRole('button', { name: 'Open README.md' }))
    expect(store.get(selectedNodeIdAtom)).toBe('file:README.md')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(store.get(selectedNodeIdAtom)).toBeNull()
    // The inspector closes with the selection.
    await waitFor(() => expect(screen.queryByText('file:README.md')).toBeNull())
  })

  it('ignores Escape while focus is in a text field', async () => {
    const store = createStore()
    render(
      <Provider store={store}><MemoryRouter><IntelligenceGraphPage projectSlug="p" /></MemoryRouter></Provider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Open README.md' }))
    expect(store.get(selectedNodeIdAtom)).toBe('file:README.md')

    // Open the spreading-activation search and focus its input.
    act(() => store.set(activationSearchOpenAtom, true))
    const input = await screen.findByRole('textbox')
    input.focus()
    expect(document.activeElement).toBe(input)

    // Escape here closes the field — it must NOT clear the selection.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(store.get(selectedNodeIdAtom)).toBe('file:README.md')
  })
})
