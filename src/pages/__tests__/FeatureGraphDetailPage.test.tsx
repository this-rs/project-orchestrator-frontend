import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FeatureGraphDetail } from '@/types'
import { installMatchMedia } from './testEnv'

const get = vi.fn()
const remove = vi.fn()
const projectsList = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }
const flowMounted = vi.fn()

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, children }: { nodes: unknown[]; children?: React.ReactNode }) => {
    flowMounted(nodes.length)
    return <div data-testid="react-flow">{children}</div>
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
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la visualisation' }))
    expect(screen.getByTestId('react-flow')).toBeTruthy()
    expect(flowMounted).toHaveBeenCalledWith(3)
    expect(screen.getByLabelText('Legend')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }))
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
})
