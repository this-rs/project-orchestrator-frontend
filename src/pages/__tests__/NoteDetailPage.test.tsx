/**
 * NoteDetailPage — the note itself, its links, its health explained, related
 * notes, history and lifecycle actions. Also covers missing-note / error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/services/api'

const { api, toast, navigate } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    update: vi.fn(),
    confirm: vi.fn(),
    delete: vi.fn(),
    invalidate: vi.fn(),
    supersede: vi.fn(),
    linkToEntity: vi.fn(),
    unlinkFromEntity: vi.fn(),
    getContextNotes: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  navigate: vi.fn(),
}))

vi.mock('@/services', () => ({ notesApi: api }))
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

import { NoteDetailPage } from '../NoteDetailPage'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

const note = {
  id: 'n1',
  project_id: 'p1',
  note_type: 'gotcha',
  status: 'needs_review',
  importance: 'high',
  scope: { type: 'file', path: 'src/api/client.ts' },
  content: '# Retries double-charge payments\n\nThe HTTP client retries **POST** requests.\n\n- Use an idempotency key',
  tags: ['payments', 'http'],
  anchors: [
    { entity_type: 'file', entity_id: 'src/api/client.ts', last_verified: iso(3600e3), is_valid: true },
    { entity_type: 'task', entity_id: 't42', last_verified: iso(3600e3), is_valid: false },
  ],
  created_at: iso(10 * 86400e3),
  created_by: 'agent-7',
  last_confirmed_at: iso(5 * 86400e3),
  staleness_score: 0.62,
  energy: 0.41,
  activation_count: 12,
  reactivation_count: 3,
  last_activated: iso(2 * 3600e3),
  memory_horizon: 'operational',
  scar_intensity: 0,
  superseded_by: undefined,
  changes: [
    { timestamp: iso(10 * 86400e3), change_type: 'created', actor: 'agent-7' },
    { timestamp: iso(86400e3), change_type: 'status_changed', actor: 'system', details: { from: 'active', to: 'needs_review' } },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/notes/n1']}>
      <Routes>
        <Route path="/workspace/:slug/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('NoteDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(structuredClone(note))
    api.getContextNotes.mockResolvedValue({
      direct_notes: [structuredClone(note), { ...note, id: 'n2', content: 'Client timeouts are 30s', note_type: 'context', status: 'active' }],
      propagated_notes: [
        { note: { ...note, id: 'n3', content: 'Payments API is idempotent', status: 'active' }, relevance_score: 0.8, distance: 2, source_entity: 'src/api/payments.ts' },
      ],
      total_count: 3,
    })
    api.update.mockResolvedValue({})
    api.confirm.mockResolvedValue({})
    api.delete.mockResolvedValue(undefined)
    api.unlinkFromEntity.mockResolvedValue(undefined)
    api.invalidate.mockResolvedValue({})
  })

  it('shows the note, its facts, links, health explanations, related notes and history', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Retries double-charge payments' })).toBeTruthy()
    // key facts
    expect(screen.getByRole('button', { name: /Status: Needs review/ })).toBeTruthy()
    expect(screen.getAllByText('Gotcha').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Importance: high/ })).toBeTruthy()
    expect(screen.getByText('#payments')).toBeTruthy()
    // full markdown content
    const article = screen.getByRole('article', { name: 'Note content' })
    expect(within(article).getByText('POST')).toBeTruthy()
    expect(within(article).getByText('Use an idempotency key')).toBeTruthy()
    // linked entities with links
    const links = screen.getByRole('list', { name: 'Linked entities' })
    expect(within(links).getByRole('link', { name: 'client.ts' }).getAttribute('href')).toBe(
      '/workspace/ws/code?file=src%2Fapi%2Fclient.ts',
    )
    expect(within(links).getByRole('link', { name: 't42' }).getAttribute('href')).toBe('/workspace/ws/tasks/t42')
    expect(within(links).getByText('Broken anchor')).toBeTruthy()
    // health, in words
    expect(screen.getByText('41%')).toBeTruthy()
    expect(screen.getByText(/Stale — likely out of date/)).toBeTruthy()
    expect(screen.getByText('1/2 valid')).toBeTruthy()
    // related notes: self excluded, direct + propagated
    const related = await screen.findByRole('list', { name: 'Related notes' })
    expect(within(related).getAllByRole('listitem')).toHaveLength(2)
    expect(within(related).getByRole('link', { name: 'Payments API is idempotent' }).getAttribute('href')).toBe('/workspace/ws/notes/n3')
    expect(api.getContextNotes).toHaveBeenCalledWith('file', 'src/api/client.ts', { max_depth: 2 })
    // history
    expect(screen.getByText('Status changed')).toBeTruthy()
    expect(screen.getByText('active → needs_review')).toBeTruthy()
  })

  it('confirms the note with the primary action', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledWith('n1'))
    expect(toast.success).toHaveBeenCalled()
  })

  it('changes the status from the header', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Status: Needs review/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Active' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('n1', { status: 'active' }))
  })

  it('deletes after confirmation and goes back to the list', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: /^Actions for Retries/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('n1'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/workspace/ws/notes', { type: 'back-button' }))
  })

  it('invalidates with a reason (dialog, not window.prompt)', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: /^Actions for Retries/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invalidate' }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Client rewritten' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invalidate' }))
    await waitFor(() => expect(api.invalidate).toHaveBeenCalledWith('n1', 'Client rewritten'))
  })

  it('unlinks an entity after confirmation', async () => {
    renderPage()
    await screen.findByRole('list', { name: 'Linked entities' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for t42' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' }).at(-1)!)
    await waitFor(() => expect(api.unlinkFromEntity).toHaveBeenCalledWith('n1', 'task', 't42'))
  })

  it('shows a not-found state for a missing note', async () => {
    api.get.mockRejectedValue(new ApiError(404, 'Note not found'))
    renderPage()
    expect(await screen.findByText('Note not found')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to notes' }).getAttribute('href')).toBe('/workspace/ws/notes')
  })

  it('shows a retryable error for other failures', async () => {
    api.get.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Retries double-charge payments' })).toBeTruthy()
  })
})
