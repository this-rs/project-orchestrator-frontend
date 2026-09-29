/**
 * ArchitecturePage — workspace topology as a graph plus a text outline.
 * The graph itself (xyflow) is stubbed: jsdom has no layout engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getTopology = vi.fn()

vi.mock('@/services/workspaces', () => ({
  workspacesApi: { getTopology: (...a: unknown[]) => getTopology(...a) },
}))
vi.mock('@/hooks', () => ({ useWorkspaceSlug: () => 'ws' }))
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes }: { nodes: unknown[] }) => <div data-testid="flow">{nodes.length} nodes</div>,
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))

import { ArchitecturePage } from '../ArchitecturePage'

const item = (id: string, type: string, deps: string[] = []) => ({
  component: { id, workspace_id: 'w', name: id, component_type: type, created_at: '', tags: [] },
  project_name: null,
  dependencies: deps.map((to_id) => ({ to_id, protocol: 'http', required: true })),
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ArchitecturePage />
    </MemoryRouter>,
  )

describe('ArchitecturePage', () => {
  beforeEach(() => getTopology.mockReset())

  it('renders the graph and a tiered outline, accepting PascalCase types', async () => {
    getTopology.mockResolvedValue({
      components: [item('web', 'Frontend', ['api']), item('api', 'Service', ['db']), item('db', 'Database')],
    })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow').textContent).toBe('3 nodes'))
    expect(screen.getByRole('region', { name: 'Architecture outline' })).toBeTruthy()
    expect(screen.getByText('Data & external')).toBeTruthy()
  })

  it('shows an empty state when the workspace has no components', async () => {
    getTopology.mockResolvedValue({ components: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('No architecture yet')).toBeTruthy())
  })

  it('shows an error state on failure', async () => {
    getTopology.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await waitFor(() => expect(screen.getByText('Failed to load the architecture')).toBeTruthy(), { timeout: 2000 })
  })
})
