import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, configure } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FeatureGraphDetail } from '@/types'
import { installMatchMedia } from './testEnv'

const get = vi.fn()
const remove = vi.fn()
const projectsList = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }
const flowMounted = vi.fn()

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    nodes,
    edges,
    children,
    onNodeClick,
  }: {
    nodes: { id: string; data: unknown }[]
    edges: unknown[]
    children?: React.ReactNode
    onNodeClick?: (e: unknown, n: unknown) => void
  }) => {
    flowMounted(nodes.length, edges.length)
    return (
      <div data-testid="react-flow" data-nodes={nodes.length} data-edges={edges.length}>
        <button type="button" onClick={() => onNodeClick?.({}, nodes[0])}>
          click first node
        </button>
        {children}
      </div>
    )
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))
vi.mock('@xyflow/react/dist/style.css', () => ({}))

vi.mock('@/services', () => ({
  featureGraphsApi: {
    get: (...a: unknown[]) => get(...a),
    delete: (...a: unknown[]) => remove(...a),
    addEntity: vi.fn(),
  },
  projectsApi: { list: (...a: unknown[]) => projectsList(...a) },
}))

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

installMatchMedia()
// Large-list tests render hundreds of rows: stay green when the whole suite loads the CPU.
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

import { FeatureGraphDetailPage } from '../FeatureGraphDetailPage'

const detail: FeatureGraphDetail = {
  id: 'g1',
  name: 'Chat streaming',
  description: 'WebSocket flow',
  project_id: 'p1',
  created_at: new Date().toISOString(),
  entry_function: 'handle_ws',
  build_depth: 3,
  entities: [
    { entity_type: 'function', entity_id: 'src/ws.rs::handle_ws', name: 'handle_ws', role: 'entry_point' },
    { entity_type: 'struct', entity_id: 'ChatEvent', role: 'data_model' },
    { entity_type: 'file', entity_id: 'src/ws.rs', role: 'core_logic' },
  ],
  relations: [{ source_id: 'src/ws.rs::handle_ws', target_id: 'ChatEvent', relation_type: 'CALLS' }],
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/workspace/ws/feature-graphs/g1']}>
      <Routes>
        <Route path="/workspace/:slug/feature-graphs/:id" element={<FeatureGraphDetailPage />} />
        <Route path="/workspace/:slug/feature-graphs" element={<p>list page</p>} />
      </Routes>
    </MemoryRouter>,
  )

/** Real backend shape (GET /api/feature-graphs/:id): no created_at / entry_function here, labels as relation types. */
function bigDetail(n: number): FeatureGraphDetail {
  const roles = ['core_logic', 'support', 'data_model', 'entry_point']
  const entities = Array.from({ length: n }, (_, i) => ({
    entity_type: i % 3 === 0 ? 'file' : 'function',
    entity_id: `src/mod${i}.rs::f${i}`,
    name: `f${i}`,
    role: i === 0 ? 'entry_point' : roles[i % 3],
  }))
  const relations = Array.from({ length: n * 2 }, (_, i) => ({
    source_type: 'Function',
    source_id: entities[i % n].entity_id,
    target_type: 'Function',
    target_id: entities[(i * 7 + 1) % n].entity_id,
    relation_type: 'CALLS',
  }))
  return { id: 'big', name: 'Huge feature', project_id: 'p1', entities, relations } as unknown as FeatureGraphDetail
}

describe('FeatureGraphDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue(detail)
    projectsList.mockResolvedValue({ items: [{ id: 'p1', slug: 'po', name: 'Orchestrator' }] })
    remove.mockResolvedValue({})
  })

  it('shows key facts and the entities grouped by role, with the full id visible', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat streaming' })).toBeTruthy()
    expect(screen.getByText('3 entities')).toBeTruthy()
    expect(screen.getByText('1 relation')).toBeTruthy()
    expect(screen.getByText('depth 3')).toBeTruthy()
    const entry = screen.getByRole('region', { name: /Entry Points/ })
    expect(within(entry).getByText('handle_ws')).toBeTruthy()
    // full identifier stays visible (was only in the side panel before)
    expect(within(entry).getByText('src/ws.rs::handle_ws')).toBeTruthy()
    expect(screen.getByRole('region', { name: /Data Models/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: /Core Logic/ })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('link', { name: /Orchestrator/ })).toBeTruthy())
  })

  it('does not mount the heavy canvas until asked', async () => {
    renderPage()
    await screen.findByText('3 entities')
    expect(screen.queryByTestId('react-flow')).toBeNull()
    expect(flowMounted).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show graph' }))
    expect(await screen.findByTestId('react-flow')).toBeTruthy()
    expect(flowMounted).toHaveBeenCalledWith(3, 1)
    expect(screen.getByLabelText('Legend')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide graph' }))
    expect(screen.queryByTestId('react-flow')).toBeNull()
  })

  it('deletes from the header ⋯ menu after confirmation, then goes back to the list', async () => {
    renderPage()
    await screen.findByText('3 entities')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Chat streaming' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('g1'))
    expect(await screen.findByText('list page')).toBeTruthy()
  })

  it('explains what the page shows (intro + role glossary)', async () => {
    renderPage()
    await screen.findByText('3 entities')
    expect(screen.getByText('How to read this feature graph')).toBeTruthy()
    expect(screen.getByText('Where the feature starts (the function you built from).', { exact: false })).toBeTruthy()
  })

  describe('large graph (3000 entities, 6000 relations)', () => {
    beforeEach(() => get.mockResolvedValue(bigDetail(3000)))

    it('renders only a capped, most-important-first subset of rows', async () => {
      renderPage()
      await screen.findByRole('heading', { level: 1, name: 'Huge feature' })
      // 4 role groups x at most 40 rows each, never the 3000 entities
      const rows = screen.getAllByRole('listitem')
      expect(rows.length).toBeLessThanOrEqual(4 * 40 + 10)
      expect(screen.getAllByRole('button', { name: /Load .* more/ }).length).toBeGreaterThan(0)
    })

    it('mounts the canvas with at most 120 nodes and says how many are hidden', async () => {
      const t0 = performance.now()
      renderPage()
      await screen.findByText('3,000 entities')
      fireEvent.click(screen.getByRole('button', { name: 'Show graph' }))
      // loading skeleton first, then the canvas
      expect(screen.getByLabelText('Computing layout')).toBeTruthy()
      const flow = await screen.findByTestId('react-flow')
      expect(Number(flow.dataset.nodes)).toBe(120)
      expect(Number(flow.dataset.edges)).toBeLessThanOrEqual(900)
      expect(screen.getByText(/Showing 120 of 3,000 entities/)).toBeTruthy()
      // the entry point always survives the cap
      expect(flowMounted).not.toHaveBeenCalledWith(3000, expect.anything())
      expect(performance.now() - t0).toBeLessThan(5000)
    })

    it('reveals more nodes progressively up to a hard ceiling, then resets', async () => {
      renderPage()
      await screen.findByText('3,000 entities')
      fireEvent.click(screen.getByRole('button', { name: 'Show graph' }))
      await screen.findByTestId('react-flow')
      fireEvent.click(screen.getByRole('button', { name: /Show 120 more/ }))
      await waitFor(() => expect(screen.getByTestId('react-flow').dataset.nodes).toBe('240'))
      fireEvent.click(screen.getByRole('button', { name: /Show 120 more/ }))
      await waitFor(() => expect(screen.getByTestId('react-flow').dataset.nodes).toBe('360'))
      fireEvent.click(screen.getByRole('button', { name: /Show 120 more/ }))
      await waitFor(() => expect(screen.getByTestId('react-flow').dataset.nodes).toBe('480'))
      expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull()
      expect(screen.getByText(/stops at 480 entities/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await waitFor(() => expect(screen.getByTestId('react-flow').dataset.nodes).toBe('120'))
    })

    it('searches the whole list, not just the visible rows', async () => {
      renderPage()
      await screen.findByText('3,000 entities')
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search entities' }), { target: { value: 'f2999' } })
      expect(screen.getByText('1 of 3,000 entities match')).toBeTruthy()
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search entities' }), { target: { value: 'zzz' } })
      expect(screen.getByText('No matching entities')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
      expect(screen.getAllByRole('button', { name: /Load .* more/ }).length).toBeGreaterThan(0)
    })

    it('loads more rows inside a role group on demand', async () => {
      renderPage()
      await screen.findByText('3,000 entities')
      const before = screen.getAllByRole('listitem').length
      fireEvent.click(screen.getAllByRole('button', { name: /Load .* more/ })[0])
      expect(screen.getAllByRole('listitem').length).toBe(before + 40)
    })
  })

  it('shows the selected node details from the canvas', async () => {
    renderPage()
    await screen.findByText('3 entities')
    fireEvent.click(screen.getByRole('button', { name: 'Show graph' }))
    await screen.findByTestId('react-flow')
    fireEvent.click(screen.getByRole('button', { name: 'click first node' }))
    expect(screen.getByRole('button', { name: 'Close entity details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close entity details' }))
    expect(screen.queryByRole('button', { name: 'Close entity details' })).toBeNull()
  })

  it('has an empty state that explains how to fill the graph', async () => {
    get.mockResolvedValue({ ...detail, entities: [], relations: [] })
    renderPage()
    expect(await screen.findByText('No entities yet')).toBeTruthy()
    expect(screen.getByText(/create a new one with Auto-build/)).toBeTruthy()
  })

  it('shows an error state with retry when the graph cannot be loaded', async () => {
    get.mockRejectedValueOnce(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    expect(await screen.findByText('Failed to load feature graph')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat streaming' })).toBeTruthy()
    spy.mockRestore()
  })
})
