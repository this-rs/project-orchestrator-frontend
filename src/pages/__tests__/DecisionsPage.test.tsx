/**
 * DecisionsPage — worked example of the UI foundation (EntityRow, FilterBar,
 * StatusMenu, OverflowMenu confirm). Verifies no information / action was
 * lost in the migration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Decision } from '@/types'

const search = vi.fn()
const update = vi.fn()
const remove = vi.fn()
const listProjects = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  decisionsApi: {
    search: (...a: unknown[]) => search(...a),
    update: (...a: unknown[]) => update(...a),
    delete: (...a: unknown[]) => remove(...a),
  },
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))

vi.mock('@/hooks', () => ({
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

// ConfirmDialog → useReducedMotion → matchMedia (absent in jsdom)
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

import { DecisionsPage } from '../DecisionsPage'

const now = Date.now()
const decisions: Decision[] = [
  {
    id: 'd1',
    description: 'Use Neo4j for the knowledge graph',
    rationale: 'graph queries',
    alternatives: ['Postgres', 'Dgraph'],
    chosen_option: 'Neo4j',
    decided_by: 'agent',
    decided_at: new Date(now - 60 * 60 * 1000).toISOString(),
    status: 'accepted',
  },
  {
    id: 'd2',
    description: 'Adopt jotai for state',
    rationale: 'simple',
    alternatives: [],
    decided_by: 'agent',
    decided_at: new Date(now - 90 * 24 * 3600 * 1000).toISOString(),
    status: 'proposed',
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <DecisionsPage />
    </MemoryRouter>,
  )
}

describe('DecisionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    search.mockResolvedValue(decisions)
    listProjects.mockResolvedValue([
      { slug: 'a', name: 'Alpha' },
      { slug: 'b', name: 'Beta' },
    ])
    update.mockResolvedValue({})
    remove.mockResolvedValue({})
  })

  it('shows every decision with status, chosen option, alternatives and date, grouped by recency', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Use Neo4j for the knowledge graph' })).closest('li')!
    expect(row.getAttribute('class')).toBeTruthy()
    expect(within(row).getByRole('button', { name: /Status: Accepted/ })).toBeTruthy()
    expect(within(row).getByText('Neo4j')).toBeTruthy()
    expect(within(row).getByText('2 alternatives')).toBeTruthy()
    expect(within(row).getByText('1h')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Adopt jotai for state' }).getAttribute('href')).toBe('/workspace/ws/decisions/d2')
    // 1h ago is 'Today' except just after midnight
    expect(screen.getByRole('region', { name: /Today|Yesterday/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: /Older/ })).toBeTruthy()
  })

  it('filters by status client-side and can clear filters', async () => {
    renderPage()
    await screen.findByText('Adopt jotai for state')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    // second select = status (first = project, since there are 2 projects)
    const combos = screen.getAllByRole('combobox')
    expect(combos).toHaveLength(2)
    fireEvent.click(combos[1])
    // native popover content is treated as hidden by jsdom
    fireEvent.click(screen.getByRole('option', { name: 'Accepted', hidden: true }))
    expect(screen.queryByText('Adopt jotai for state')).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Adopt jotai for state')).toBeTruthy()
  })

  it('searches server-side (debounced)', async () => {
    renderPage()
    await screen.findByText('Adopt jotai for state')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search decisions' }), { target: { value: 'neo' } })
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'neo', workspace_slug: 'ws' })))
  })

  it('changes status from the row without navigating', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Adopt jotai for state' })).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: /Status: Proposed/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Accepted' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('d2', { status: 'accepted' }))
    expect(toast.success).toHaveBeenCalled()
  })

  it('deletes through the always-visible ⋯ menu after confirmation', async () => {
    renderPage()
    await screen.findByText('Adopt jotai for state')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Adopt jotai for state' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByText('Delete Decision')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('d2'))
    await waitFor(() => expect(screen.queryByText('Adopt jotai for state')).toBeNull())
  })

  it('shows the empty state', async () => {
    search.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No decisions yet')).toBeTruthy()
  })
})
