/**
 * DecisionDetailPage — header facts, context, alternatives, affected code with
 * links, timeline, and every action (status, edit, add / remove affects,
 * delete). Also the not-found / error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/services/api'

const { api, toast, navigate } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    listAffects: vi.fn(),
    getTimeline: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addAffects: vi.fn(),
    removeAffects: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  navigate: vi.fn(),
}))

vi.mock('@/services', () => ({ decisionsApi: api }))
vi.mock('@/hooks', async () => {
  const { useFormDialog } = await import('@/hooks/useFormDialog')
  return { useToast: () => toast, useWorkspaceSlug: () => 'ws', useFormDialog }
})
vi.mock('@/hooks/useViewTransition', () => ({ useViewTransition: () => ({ navigate }) }))

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

import { DecisionDetailPage } from '../DecisionDetailPage'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

const decision = {
  id: 'd1',
  description: 'Use Neo4j for the knowledge graph\n\nGraph queries dominate the workload.',
  rationale: 'Traversals are **cheap** in a native graph store.',
  alternatives: ['Postgres', 'Neo4j', 'Dgraph'],
  chosen_option: 'Neo4j',
  decided_by: 'agent',
  decided_at: iso(3600e3),
  status: 'accepted',
}

const affects = [
  { entity_type: 'File', entity_id: 'src/graph/store.rs', entity_name: 'store.rs', impact_description: 'All queries go through it' },
  { entity_type: 'Function', entity_id: 'run_query' },
]

const timeline = [
  { decision: { ...decision }, supersedes_chain: ['d0'] },
  { decision: { ...decision, id: 'other', description: 'Unrelated' } },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/decisions/d1']}>
      <Routes>
        <Route path="/workspace/:slug/decisions/:decisionId" element={<DecisionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DecisionDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(structuredClone(decision))
    api.listAffects.mockResolvedValue(structuredClone(affects))
    api.getTimeline.mockResolvedValue(structuredClone(timeline))
    api.update.mockResolvedValue(undefined)
    api.delete.mockResolvedValue(undefined)
    api.addAffects.mockResolvedValue(undefined)
    api.removeAffects.mockResolvedValue(undefined)
  })

  it('shows the facts, the context, the alternatives, the affected code and the timeline', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Use Neo4j for the knowledge graph' })).toBeTruthy()
    // key facts
    expect(screen.getByRole('button', { name: /Status: Accepted/ })).toBeTruthy()
    expect(screen.getByText('by agent')).toBeTruthy()
    expect(screen.getByText('3 alternatives')).toBeTruthy()
    expect(screen.getByText('affects 2 entities')).toBeTruthy()
    // context keeps the full description (it is longer than the title) and the rationale
    expect(screen.getByText('Graph queries dominate the workload.')).toBeTruthy()
    expect(screen.getByText('cheap')).toBeTruthy()
    // alternatives, chosen one marked
    const alts = screen.getByRole('list', { name: 'Alternatives' })
    expect(within(alts).getAllByRole('listitem')).toHaveLength(3)
    expect(within(alts).getByText('chosen')).toBeTruthy()
    // affects rows link to the code page and show the impact
    const aff = screen.getByRole('list', { name: 'Affected entities' })
    expect(within(aff).getByRole('link', { name: 'store.rs' }).getAttribute('href')).toBe(
      '/workspace/ws/code?file=src%2Fgraph%2Fstore.rs',
    )
    expect(within(aff).getByText('All queries go through it')).toBeTruthy()
    expect(within(aff).getByText('run_query')).toBeTruthy()
    // timeline filtered to this decision
    const tl = screen.getByRole('list', { name: 'Timeline' })
    expect(within(tl).getAllByRole('listitem')).toHaveLength(1)
    expect(within(tl).getByText('supersedes 1 previous decision')).toBeTruthy()
    // details
    expect(screen.getByText('d1')).toBeTruthy()
  })

  it('changes the status from the header', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Status: Accepted/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Superseded' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('d1', { status: 'superseded' }))
    expect(await screen.findByText(/has been superseded/)).toBeTruthy()
  })

  it('edits the context through a dialog', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const description = screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement
    expect(description.value).toBe(decision.description)
    fireEvent.change(description, { target: { value: 'Use Neo4j everywhere' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Chosen option' }), { target: { value: 'Neo4j 5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('d1', {
        description: 'Use Neo4j everywhere',
        rationale: decision.rationale,
        chosen_option: 'Neo4j 5',
      }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Use Neo4j everywhere' })).toBeTruthy()
  })

  it('adds an affected entity through a dialog', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Entity' }), { target: { value: 'src/api/mod.rs' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Impact' }), { target: { value: 'Exposes the graph' } })
    // the dialog's submit is the last "Add" button (the section action is the first)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' }).at(-1)!)
    await waitFor(() =>
      expect(api.addAffects).toHaveBeenCalledWith('d1', {
        entity_type: 'File',
        entity_id: 'src/api/mod.rs',
        impact_description: 'Exposes the graph',
      }),
    )
    await waitFor(() => expect(api.listAffects).toHaveBeenCalledTimes(2))
  })

  it('removes an affected entity after confirmation', async () => {
    renderPage()
    await screen.findByRole('list', { name: 'Affected entities' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for run_query' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(api.removeAffects).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1)!)
    await waitFor(() => expect(api.removeAffects).toHaveBeenCalledWith('d1', 'Function', 'run_query'))
    await waitFor(() => expect(screen.queryByText('run_query')).toBeNull())
  })

  it('deletes after confirmation and goes back to the list', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: /^Actions for Use Neo4j/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('d1'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/workspace/ws/decisions', { type: 'back-button' }))
  })

  it('shows a not-found state for a missing decision', async () => {
    api.get.mockRejectedValue(new ApiError(404, 'Not found'))
    renderPage()
    expect(await screen.findByText('Decision not found')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to decisions' }).getAttribute('href')).toBe('/workspace/ws/decisions')
  })

  it('shows a retryable error for other failures', async () => {
    api.get.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Use Neo4j for the knowledge graph' })).toBeTruthy()
  })
})
