/**
 * ArchitecturePage — workspace topology as a graph plus a text outline.
 *
 * The graph itself (xyflow) is stubbed: jsdom has no layout engine. That is not
 * a coverage hole for selection, because the outline is the keyboard path to the
 * same state — driving it exercises exactly what a pointer would.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getTopology = vi.fn()
const listProjects = vi.fn()

vi.mock('@/services/workspaces', () => ({
  workspacesApi: {
    getTopology: (...a: unknown[]) => getTopology(...a),
    listProjects: (...a: unknown[]) => listProjects(...a),
  },
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

const item = (
  id: string,
  type: string,
  deps: { to: string; protocol?: string; required?: boolean }[] = [],
  extra: Record<string, unknown> = {},
) => ({
  component: {
    id,
    workspace_id: 'w',
    name: id,
    component_type: type,
    created_at: '',
    tags: [],
    ...extra,
  },
  project_name: null,
  dependencies: deps.map((d) => ({
    to_id: d.to,
    protocol: d.protocol ?? 'http',
    required: d.required ?? true,
  })),
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ArchitecturePage />
    </MemoryRouter>,
  )

/** web → api → db, with the db link marked optional. */
const wiredTopology = {
  components: [
    item('web', 'Frontend', [{ to: 'api', protocol: 'HTTP/WS' }]),
    item('api', 'Service', [{ to: 'db', protocol: 'Bolt', required: false }], {
      description: 'The core API',
      runtime: 'rust',
    }),
    item('db', 'Database'),
  ],
}

describe('ArchitecturePage', () => {
  beforeEach(() => {
    getTopology.mockReset()
    listProjects.mockReset()
    listProjects.mockResolvedValue([])
  })

  it('renders the graph and a tiered outline, accepting PascalCase types', async () => {
    getTopology.mockResolvedValue(wiredTopology)
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
    await waitFor(() => expect(screen.getByText('Failed to load the architecture')).toBeTruthy(), {
      timeout: 2000,
    })
  })

  it('still renders the diagram when the project lookup is unavailable', async () => {
    // The lookup only ever buys a hyperlink. Letting it fail the page would
    // trade the whole architecture view for a link.
    getTopology.mockResolvedValue(wiredTopology)
    listProjects.mockRejectedValue(new Error('nope'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow').textContent).toBe('3 nodes'))
  })

  it('opens a detail panel when a component is selected', async () => {
    getTopology.mockResolvedValue(wiredTopology)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow')).toBeTruthy())

    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^api/ }))

    const panel = await screen.findByRole('complementary', { name: 'api details' })
    expect(panel.textContent).toContain('The core API')
    expect(panel.textContent).toContain('rust')
  })

  it('separates what depends on a component from what it depends on', async () => {
    // This split is the point of the panel: the incoming list is what answers
    // "what breaks if I touch this".
    getTopology.mockResolvedValue(wiredTopology)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^api/ }))

    const panel = await screen.findByRole('complementary', { name: 'api details' })
    expect(panel.textContent).toContain('Depended on by (1)')
    expect(panel.textContent).toContain('Depends on (1)')
    // Protocol and optionality travel with the edge, not just with the canvas.
    expect(panel.textContent).toContain('Bolt')
    expect(panel.textContent).toContain('optional')
  })

  it('navigates between components from within the panel', async () => {
    getTopology.mockResolvedValue(wiredTopology)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^api/ }))

    const panel = await screen.findByRole('complementary', { name: 'api details' })
    const toDb = within(panel).getByRole('button', { name: /db/ })
    fireEvent.click(toDb)

    await screen.findByRole('complementary', { name: 'db details' })
  })

  it('clears the selection with Escape', async () => {
    getTopology.mockResolvedValue(wiredTopology)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^api/ }))
    await screen.findByRole('complementary', { name: 'api details' })

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
  })

  it('selecting the same component twice deselects it', async () => {
    getTopology.mockResolvedValue(wiredTopology)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow')).toBeTruthy())

    const row = screen.getByRole('button', { name: /^api/ })
    fireEvent.click(row)
    await screen.findByRole('complementary', { name: 'api details' })
    fireEvent.click(row)
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
  })

  it('spells out what a dashed edge means', async () => {
    // Dashed vs solid is the only visual vocabulary the diagram carries, so it
    // cannot be left for the reader to guess.
    getTopology.mockResolvedValue(wiredTopology)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('flow')).toBeTruthy())
    expect(screen.getByText(/Optional — the system runs without it/)).toBeTruthy()
  })
})
