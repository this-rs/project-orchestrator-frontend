import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, configure } from '@testing-library/react'
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
// Large-list tests render hundreds of rows: stay green when the whole suite loads the CPU.
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

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

  it('makes identifiers speak: humanized title, code name secondary, plain sentence', async () => {
    list.mockResolvedValue({
      feature_graphs: [
        { id: 'g9', name: 'build_system_prompt', project_id: 'p1', created_at: new Date(now).toISOString(), entry_function: 'ChatManager', build_depth: 2 },
        { id: 'g8', name: 'Plain name', project_id: 'p1', created_at: new Date(now - 1000).toISOString(), entry_function: 'go', build_depth: 1 },
      ],
    })
    renderPage()
    const link = await screen.findByRole('link', { name: 'Build system prompt' })
    const row = link.closest('li')!
    expect(within(row).getByText('build_system_prompt')).toBeTruthy() // exact name stays, secondary
    expect(within(row).getByText(/Starts from “Chat manager” and follows its calls 2 levels deep\./)).toBeTruthy()
    expect(within(row).getByText('ChatManager')).toBeTruthy()
    const plain = screen.getByRole('link', { name: 'Plain name' }).closest('li')!
    expect(within(plain).getByText(/follows its calls 1 level deep/)).toBeTruthy()
    expect(within(plain).queryByText('Plain_name')).toBeNull()
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
    expect(await screen.findByText('Feature graphs could not be loaded.')).toBeTruthy()
    list.mockResolvedValue({ feature_graphs: [] })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('No feature graphs yet')).toBeTruthy()
  })

  it('explains what a feature graph is and how Auto-build works', async () => {
    renderPage()
    await screen.findByText('Auth flow')
    expect(screen.getByText('What is a feature graph?')).toBeTruthy()
    expect(screen.getByText(/follows its calls/)).toBeTruthy()
  })

  it('explains the empty state and offers both creation paths', async () => {
    list.mockResolvedValue({ feature_graphs: [] })
    renderPage()
    expect(await screen.findByText('No feature graphs yet')).toBeTruthy()
    expect(screen.getByText(/gathers the files, functions and types/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Auto-build/ }).length).toBeGreaterThan(1)
  })

  it('filters by project through the API', async () => {
    renderPage()
    await screen.findByText('Auth flow')
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    fireEvent.click(screen.getAllByRole('combobox')[0])
    fireEvent.click(await screen.findByRole('option', { name: 'Backend', hidden: true }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ project_id: 'p1' }))
  })

  describe('huge list (400 graphs)', () => {
    const many: FeatureGraph[] = Array.from({ length: 400 }, (_, i) => ({
      id: `g${i}`,
      name: `Graph ${String(i).padStart(3, '0')}`,
      project_id: 'p1',
      created_at: new Date(now - i * 3600_000).toISOString(),
      entity_count: i % 97,
    }))
    beforeEach(() => list.mockResolvedValue({ feature_graphs: many }))

    it('renders at most one page of rows and loads more on demand', async () => {
      renderPage()
      await screen.findByText('Graph 000')
      expect(screen.getAllByRole('listitem').length).toBe(50)
      expect(screen.getByText('Showing 50 of 400')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Load 350 more' }))
      expect(screen.getAllByRole('listitem').length).toBe(100)
      expect(screen.getByText('Showing 100 of 400')).toBeTruthy()
    })

    it('searches the full list and resets paging', async () => {
      renderPage()
      await screen.findByText('Graph 000')
      fireEvent.click(screen.getByRole('button', { name: 'Load 350 more' }))
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search feature graphs' }), { target: { value: 'Graph 399' } })
      expect(screen.getAllByRole('listitem').length).toBe(1)
      expect(screen.getByText('Showing 1 of 1')).toBeTruthy()
    })

    it('sorts by name and by entity count', async () => {
      renderPage()
      await screen.findByText('Graph 000')
      fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
      fireEvent.click(screen.getAllByRole('combobox')[0])
      fireEvent.click(await screen.findByRole('option', { name: 'Most entities', hidden: true }))
      // entity_count 96 comes first (i = 96, 193, 290, 387 → Graph 096 is the most recent of them)
      await waitFor(() => expect(screen.getAllByRole('link')[0].textContent).toBe('Graph 096'))
      fireEvent.click(screen.getAllByRole('combobox')[0])
      fireEvent.click(await screen.findByRole('option', { name: 'Name (A–Z)', hidden: true }))
      await waitFor(() => expect(screen.getAllByRole('link')[0].textContent).toBe('Graph 000'))
    })
  })
})
