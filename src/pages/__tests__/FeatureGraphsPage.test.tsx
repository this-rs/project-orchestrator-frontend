import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FeatureGraph } from '@/types'
import { installMatchMedia } from './testEnv'

const list = vi.fn()
const remove = vi.fn()
const listProjects = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  featureGraphsApi: {
    list: (...a: unknown[]) => list(...a),
    delete: (...a: unknown[]) => remove(...a),
    create: vi.fn(),
    autoBuild: vi.fn(),
  },
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

installMatchMedia()

import { FeatureGraphsPage } from '../FeatureGraphsPage'

const now = Date.now()
const graphs: FeatureGraph[] = [
  {
    id: 'g1',
    name: 'Chat streaming',
    description: 'WebSocket flow',
    project_id: 'p1',
    created_at: new Date(now - 3600_000).toISOString(),
    entity_count: 12,
    entry_function: 'handle_ws',
    build_depth: 3,
  },
  { id: 'g2', name: 'Auth flow', project_id: 'p2', created_at: new Date(now - 90 * 86400_000).toISOString(), entity_count: 1 },
]

const renderPage = () =>
  render(
    <MemoryRouter>
      <FeatureGraphsPage />
    </MemoryRouter>,
  )

describe('FeatureGraphsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ feature_graphs: graphs })
    listProjects.mockResolvedValue([
      { id: 'p1', name: 'Backend', slug: 'backend' },
      { id: 'p2', name: 'Frontend', slug: 'frontend' },
    ])
    remove.mockResolvedValue({})
  })

  it('lists graphs as rows with every card fact (entities, entry, depth, project, date)', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: 'Chat streaming' })
    expect(link.getAttribute('href')).toBe('/workspace/ws/feature-graphs/g1')
    const row = link.closest('li')!
    expect(within(row).getByText('WebSocket flow')).toBeTruthy()
    expect(within(row).getByText('12 entities')).toBeTruthy()
    expect(within(row).getByText('handle_ws')).toBeTruthy()
    expect(within(row).getByText('depth 3')).toBeTruthy()
    await waitFor(() => expect(within(row).getByText('Backend')).toBeTruthy())
    expect(within(row).getByText('1h')).toBeTruthy()
    expect(screen.getByText('1 entity')).toBeTruthy()
  })

  it('filters client-side by search', async () => {
    renderPage()
    await screen.findByText('Auth flow')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search feature graphs' }), { target: { value: 'handle_ws' } })
    expect(screen.queryByText('Auth flow')).toBeNull()
    expect(screen.getByText('Chat streaming')).toBeTruthy()
  })

  it('deletes from the always-visible ⋯ menu after confirmation', async () => {
    renderPage()
    await screen.findByText('Auth flow')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Auth flow' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('g2'))
    await waitFor(() => expect(screen.queryByText('Auth flow')).toBeNull())
  })

  it('distinguishes load errors from an empty list', async () => {
    list.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText('Impossible de charger les feature graphs.')).toBeTruthy()
    list.mockResolvedValue({ feature_graphs: [] })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('No feature graph yet')).toBeTruthy()
  })
})
