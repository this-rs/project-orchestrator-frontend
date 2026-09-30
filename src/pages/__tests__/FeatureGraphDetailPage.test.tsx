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
      <div
        data-testid="react-flow"
        data-nodes={nodes.length}
        data-edges={edges.length}
        data-first-label={(nodes[0]?.data as { label?: string } | undefined)?.label}
      >
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

/** Enriched backend shape: docstring, signature, file_path, line_start, importance. */
const enriched: FeatureGraphDetail = {
  ...detail,
  entities: [
    {
      entity_type: 'function',
      entity_id: 'src/chat/manager.rs::build_system_prompt',
      name: 'build_system_prompt',
      role: 'entry_point',
      importance_score: 0.92,
      file_path: 'src/chat/manager.rs',
      line_start: 42,
      signature: 'pub async fn build_system_prompt(session: &Session) -> String',
      docstring: '/// Assembles the system prompt for a chat session. It also caches the result.\n/// Second line.',
      visibility: 'pub',
    },
    {
      entity_type: 'function',
      entity_id: 'src/chat/manager.rs::send',
      name: 'send',
      role: 'support',
      importance_score: 0.1,
      file_path: 'src/chat/manager.rs',
      line_start: 90,
    },
    { entity_type: 'struct', entity_id: 'ChatManager', role: 'data_model', importance_score: 0.5, file_path: 'src/chat/mod.rs' },
  ],
  relations: [
    { source_type: 'Function', source_id: 'src/chat/manager.rs::send', target_type: 'Function', target_id: 'src/chat/manager.rs::build_system_prompt', relation_type: 'CALLS' },
    { source_type: 'Function', source_id: 'src/chat/manager.rs::build_system_prompt', target_type: 'Struct', target_id: 'ChatManager', relation_type: 'CALLS' },
  ],
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

  it('shows key facts and each entity speaking: human title, code name, plain sentence (old shape)', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat streaming' })).toBeTruthy()
    expect(screen.getByText('3 entities')).toBeTruthy()
    expect(screen.getByText('1 relation')).toBeTruthy()
    expect(screen.getByText('depth 3')).toBeTruthy()
    const list = screen.getByRole('region', { name: 'Entities grouped by role' })
    const row = within(list).getByRole('article', { name: 'Handle ws' })
    expect(within(row).getByText('handle_ws')).toBeTruthy() // exact code name, secondary
    expect(within(row).getByText('Function in src/ws.rs · entry point of the feature')).toBeTruthy()
    expect(within(row).getByText('Entry point').getAttribute('title')).toMatch(/Where the feature starts/)
    expect(within(row).getByRole('meter', { name: 'Importance Key' })).toBeTruthy()
    expect(within(row).getByText('src/ws.rs')).toBeTruthy() // file derived from the entity id
    // a bare struct without any file still gets a title + sentence
    const evt = within(list).getByRole('article', { name: 'Chat event' })
    expect(within(evt).getByText('Data structure · data carried by the feature')).toBeTruthy()
    expect(within(list).getByRole('heading', { name: /Entry Points/ })).toBeTruthy()
    expect(within(list).getByRole('heading', { name: /Data Models/ })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('link', { name: /Orchestrator/ })).toBeTruthy())
  })

  it('uses the enriched fields: docstring sentence, file:line, importance word', async () => {
    get.mockResolvedValue(enriched)
    renderPage()
    const list = await screen.findByRole('region', { name: 'Entities grouped by role' })
    const row = within(list).getByRole('article', { name: 'Build system prompt' })
    expect(within(row).getByText('Assembles the system prompt for a chat session.')).toBeTruthy()
    expect(within(row).getByText('src/chat/manager.rs:42')).toBeTruthy()
    expect(within(row).getByRole('meter', { name: 'Importance Key' })).toBeTruthy()
    const minor = within(list).getByRole('article', { name: 'Send' })
    expect(within(minor).getByRole('meter', { name: 'Importance Minor' })).toBeTruthy()
  })

  it('switches grouping between role, file and type', async () => {
    get.mockResolvedValue(enriched)
    renderPage()
    await screen.findByRole('region', { name: 'Entities grouped by role' })
    fireEvent.click(screen.getByRole('tab', { name: 'File' }))
    const byFile = screen.getByRole('region', { name: 'Entities grouped by file' })
    const header = within(byFile).getByRole('heading', { name: /manager\.rs/ })
    expect(header.textContent).toContain('src')
    expect(header.textContent).toContain('chat')
    expect(header.textContent).toContain('2') // two entities in that file
    expect(within(byFile).getByRole('heading', { name: /mod\.rs/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Type' }))
    const byType = screen.getByRole('region', { name: 'Entities grouped by type' })
    expect(within(byType).getByRole('heading', { name: /Functions/ })).toBeTruthy()
    expect(within(byType).getByRole('heading', { name: /Structs/ })).toBeTruthy()
  })

  it('groups by file from the entity id alone on the old shape', async () => {
    renderPage()
    await screen.findByText('3 entities')
    fireEvent.click(screen.getByRole('tab', { name: 'File' }))
    const byFile = screen.getByRole('region', { name: 'Entities grouped by file' })
    expect(within(byFile).getByRole('heading', { name: /ws\.rs/ })).toBeTruthy()
    expect(within(byFile).getByRole('heading', { name: /No file information/ })).toBeTruthy()
  })

  it('opens a detail panel from a row with signature, location, callers and callees', async () => {
    get.mockResolvedValue(enriched)
    renderPage()
    const list = await screen.findByRole('region', { name: 'Entities grouped by role' })
    fireEvent.click(within(within(list).getByRole('article', { name: 'Build system prompt' })).getByRole('button', { name: 'Build system prompt' }))
    const panel = screen.getByRole('complementary', { name: 'Details of Build system prompt' })
    expect(within(panel).getByText(/Assembles the system prompt for a chat session\. It also caches/)).toBeTruthy()
    expect(within(panel).getByLabelText('Signature').textContent).toContain('pub async fn build_system_prompt')
    expect(within(panel).getByText('src/chat/manager.rs:42')).toBeTruthy()
    expect(within(panel).getByText('Called by')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /Send/ })).toBeTruthy()
    // follow a callee
    fireEvent.click(within(panel).getByRole('button', { name: /Chat manager/ }))
    expect(screen.getByRole('complementary', { name: 'Details of Chat manager' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close entity details' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('does not mount the heavy canvas until asked', async () => {
    renderPage()
    await screen.findByText('3 entities')
    expect(screen.queryByTestId('react-flow')).toBeNull()
    expect(flowMounted).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show graph' }))
    expect(await screen.findByTestId('react-flow')).toBeTruthy()
    expect(flowMounted).toHaveBeenCalledWith(3, 1)
    // node labels are humanized, not raw identifiers
    expect(screen.getByTestId('react-flow').dataset.firstLabel).toBe('Handle ws')
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

    it('lists ALL 3000 entities in an internal scroller, windowed (not capped, no Load more)', async () => {
      const t0 = performance.now()
      renderPage()
      await screen.findByRole('heading', { level: 1, name: 'Huge feature' })
      expect(screen.queryByRole('button', { name: /Load .* more/ })).toBeNull()
      const list = screen.getByRole('region', { name: 'Entities grouped by role' })
      expect(screen.getByText(/3,000 entities — scroll the list/)).toBeTruthy()
      // only the window is in the DOM...
      expect(within(list).getAllByRole('article').length).toBeLessThan(40)
      // ...but scrolling to the bottom reaches the very last one
      list.scrollTop = 1e9
      fireEvent.scroll(list)
      const last = within(list).getAllByRole('article').at(-1)!
      expect(last.getAttribute('aria-posinset')).toBe('3000')
      expect(last.getAttribute('aria-setsize')).toBe('3000')
      expect(performance.now() - t0).toBeLessThan(5000)
    })

    it('searches across everything: an entity at index 2900 is found', async () => {
      renderPage()
      await screen.findByText('3,000 entities')
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search entities' }), { target: { value: 'f2900' } })
      expect(screen.getByText('1 of 3,000 entities match')).toBeTruthy()
      expect(screen.getByRole('article', { name: 'F2900' })).toBeTruthy()
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search entities' }), { target: { value: 'zzz' } })
      expect(screen.getByText('No matching entities')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
      expect(screen.getByText(/3,000 entities — scroll the list/)).toBeTruthy()
    })

    it('draws every entity on the canvas (no 120/480 cap), after a loading skeleton', async () => {
      const t0 = performance.now()
      renderPage()
      await screen.findByText('3,000 entities')
      fireEvent.click(screen.getByRole('button', { name: 'Show graph' }))
      expect(screen.getByLabelText('Computing layout')).toBeTruthy()
      const flow = await screen.findByTestId('react-flow')
      expect(Number(flow.dataset.nodes)).toBe(3000)
      expect(Number(flow.dataset.edges)).toBeLessThanOrEqual(1500)
      expect(screen.getByText(/3,000 entities · /)).toBeTruthy()
      expect(screen.getByText(/more relations are not drawn/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull()
      expect(performance.now() - t0).toBeLessThan(5000)
    })
  })

  it('shows the selected node details from the canvas', async () => {
    renderPage()
    await screen.findByText('3 entities')
    fireEvent.click(screen.getByRole('button', { name: 'Show graph' }))
    await screen.findByTestId('react-flow')
    fireEvent.click(screen.getByRole('button', { name: 'click first node' }))
    expect(screen.getByRole('complementary', { name: /Details of/ })).toBeTruthy()
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
