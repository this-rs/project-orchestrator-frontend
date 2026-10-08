/**
 * NotesPage — rows carry every fact of the old cards, filters and both search
 * modes work, and each row action (status, confirm, invalidate, delete) is
 * reachable from the always-visible ⋯ menu. The knowledge graph opens as an
 * overlay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'jotai'

const { api, workspacesApi, toast } = vi.hoisted(() => ({
  api: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    confirm: vi.fn(),
    invalidate: vi.fn(),
    searchSemantic: vi.fn(),
  },
  workspacesApi: { listProjects: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/services', () => ({ notesApi: api, workspacesApi }))
vi.mock('@/hooks', async () => {
  const { useFormDialog } = await import('@/hooks/useFormDialog')
  const { useConfirmDialog } = await import('@/hooks/useConfirmDialog')
  const { useMultiSelect } = await import('@/hooks/useMultiSelect')
  const { useInfiniteList } = await import('@/hooks/useInfiniteList')
  return { useToast: () => toast, useWorkspaceSlug: () => 'ws', useFormDialog, useConfirmDialog, useMultiSelect, useInfiniteList }
})
vi.mock('@/components/knowledge/NeuronExplorer', () => ({ NeuronExplorer: () => <div data-testid="neuron-explorer" /> }))

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
// useInfiniteList observes a sentinel — jsdom has no IntersectionObserver
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
window.IntersectionObserver = IO as unknown as typeof IntersectionObserver

import { NotesPage } from '../NotesPage'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

const notes = [
  {
    id: 'n1',
    project_id: 'p1',
    note_type: 'gotcha',
    status: 'active',
    importance: 'high',
    content: '# Retries double-charge payments\n\nThe HTTP client retries POST requests.',
    tags: ['payments', 'http'],
    anchors: [{ entity_type: 'file', entity_id: 'src/api/client.ts' }],
    created_at: iso(3600e3),
    created_by: 'agent',
    staleness_score: 0.1,
  },
  {
    id: 'n2',
    project_id: 'p1',
    note_type: 'guideline',
    status: 'needs_review',
    importance: 'medium',
    content: 'Always use the shared logger',
    tags: [],
    anchors: [],
    created_at: iso(3 * 86400e3),
    created_by: 'agent',
    staleness_score: 0.8,
    superseded_by: 'n9',
  },
]

function renderPage() {
  return render(
    <Provider>
      <MemoryRouter>
        <NotesPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('NotesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue({ items: structuredClone(notes), total: 2, limit: 25, offset: 0 })
    api.searchSemantic.mockResolvedValue([{ note: structuredClone(notes[0]), score: 0.91, highlights: null }])
    api.update.mockResolvedValue({})
    api.confirm.mockResolvedValue({})
    api.invalidate.mockResolvedValue({})
    api.delete.mockResolvedValue(undefined)
    workspacesApi.listProjects.mockResolvedValue([])
  })

  it('lists every note as a row with its facts, linking to the detail page', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: 'Retries double-charge payments' })
    expect(link.getAttribute('href')).toBe('/workspace/ws/notes/n1')
    const row = link.closest('li')!
    expect(within(row).getByRole('button', { name: /Status: Active/ })).toBeTruthy()
    expect(within(row).getByText('Gotcha')).toBeTruthy()
    expect(within(row).getByText('High')).toBeTruthy()
    expect(within(row).getByText('#payments #http')).toBeTruthy()
    expect(within(row).getByText('1 link')).toBeTruthy()
    expect(within(row).getByText('The HTTP client retries POST requests.')).toBeTruthy()
    expect(within(row).getByText('1h')).toBeTruthy()
    // stale + superseded signals survive
    const row2 = screen.getByRole('link', { name: 'Always use the shared logger' }).closest('li')!
    expect(within(row2).getByText('stale 80%')).toBeTruthy()
    expect(within(row2).getByText('superseded')).toBeTruthy()
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ workspace_slug: 'ws' }))
  })

  it('filters by type through the filter panel and can clear', async () => {
    renderPage()
    await screen.findByText('Always use the shared logger')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const [typeSelect] = screen.getAllByRole('combobox')
    fireEvent.click(typeSelect)
    fireEvent.click(screen.getByRole('option', { name: 'Gotcha', hidden: true }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ note_type: 'gotcha' })))
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ note_type: undefined })))
  })

  it('searches by meaning (debounced) and shows the match score', async () => {
    renderPage()
    await screen.findByText('Always use the shared logger')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'double charge' } })
    await waitFor(() => expect(api.searchSemantic).toHaveBeenCalledWith({ query: 'double charge', workspace_slug: 'ws', limit: 20 }))
    const results = await screen.findByRole('list', { name: 'Search results' })
    expect(within(results).getAllByRole('listitem')).toHaveLength(1)
    expect(within(results).getByText('91%')).toBeTruthy()
    expect(screen.queryByText('Always use the shared logger')).toBeNull()
  })

  it('switches to exact search, filtering the loaded notes client-side', async () => {
    renderPage()
    await screen.findByText('Always use the shared logger')
    fireEvent.click(screen.getByRole('button', { name: /Search mode: semantic/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'logger' } })
    expect(screen.getByText('Always use the shared logger')).toBeTruthy()
    expect(screen.queryByText('Retries double-charge payments')).toBeNull()
    expect(api.searchSemantic).not.toHaveBeenCalled()
  })

  it('changes a status from the row', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Always use the shared logger' })).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: /Status: Needs review/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Active' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('n2', { status: 'active' }))
    expect(toast.success).toHaveBeenCalled()
  })

  it('confirms, invalidates (with a reason) and deletes from the ⋯ menu', async () => {
    renderPage()
    await screen.findByText('Always use the shared logger')
    const menu = () => screen.getByRole('button', { name: 'Actions for Always use the shared logger' })

    fireEvent.click(menu())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledWith('n2'))

    fireEvent.click(menu())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invalidate' }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Logger removed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invalidate' }))
    await waitFor(() => expect(api.invalidate).toHaveBeenCalledWith('n2', 'Logger removed'))

    fireEvent.click(menu())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('n2'))
    await waitFor(() => expect(screen.queryByText('Always use the shared logger')).toBeNull())
  })

  it('opens the note graph as an overlay and closes it with Escape', async () => {
    renderPage()
    await screen.findByText('Always use the shared logger')
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
    const dialog = screen.getByRole('dialog', { name: 'Note graph' })
    expect(within(dialog).getByTestId('neuron-explorer')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Note graph' })).toBeNull()
  })

  it('shows the pristine empty state with the create action', async () => {
    api.list.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
    renderPage()
    expect(await screen.findByText('No notes yet')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New note' }).length).toBeGreaterThan(0)
  })
})
