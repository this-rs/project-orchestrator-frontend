/**
 * TodayPage — the task list cut by what needs a decision now:
 * in progress, blocked, up next. Empty sections are not rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { workspacesAtom } from '@/atoms'

const list = vi.fn()
const update = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  tasksApi: { list: (...a: unknown[]) => list(...a), update: (...a: unknown[]) => update(...a) },
}))
vi.mock('@/hooks', () => ({
  useToast: () => toast,
}))

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

import { TodayPage } from '../TodayPage'

const task = (id: string, title: string, status: string) => ({
  id,
  title,
  description: title,
  status,
  priority: 5,
  tags: [],
  acceptance_criteria: [],
  affected_files: [],
  created_at: new Date().toISOString(),
  plan_id: 'p1',
  plan_title: 'Ship v1',
})

const workspaces = [
  { id: 'w1', slug: 'ws', name: 'Studio' },
  { id: 'w2', slug: 'other', name: 'Client B' },
] as never

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}

/** Both entries mount the same component, as in App.tsx. */
function renderPage(entry = '/workspace/ws/today') {
  const store = createStore()
  store.set(workspacesAtom, workspaces)
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route path="/workspace/:slug/today" element={<TodayPage />} />
          <Route path="/today" element={<TodayPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('TodayPage', () => {
  beforeEach(() => {
    list.mockReset()
  })

  it('shows only the sections that have tasks, with their plan', async () => {
    list.mockImplementation(async (params: { status: string }) => {
      if (params.status === 'in_progress') return { items: [task('t1', 'Write the brief', 'in_progress')], total: 1 }
      if (params.status === 'pending') return { items: [task('t2', 'Book the venue', 'pending')], total: 9 }
      return { items: [], total: 0 }
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Write the brief')).toBeTruthy())
    expect(screen.getByText('Book the venue')).toBeTruthy()
    expect(screen.getByRole('region', { name: /^In progress/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: /^Up next/ })).toBeTruthy()
    expect(screen.queryByRole('region', { name: /^Blocked/ })).toBeNull()
    expect(screen.getAllByText('Ship v1').length).toBe(2)
  })

  it('shows an empty state when nothing is pending anywhere', async () => {
    list.mockResolvedValue({ items: [], total: 0 })
    renderPage()
    await waitFor(() => expect(screen.getByText('Nothing on your plate')).toBeTruthy())
  })

  describe('lane filter', () => {
    const emptyList = async () => ({ items: [], total: 0 })
    const slugsAsked = () => [...new Set(list.mock.calls.map((c) => (c[0] as { workspace_slug: string }).workspace_slug))].sort()

    it('/workspace/:slug/today starts on that lane only', async () => {
      list.mockImplementation(emptyList)
      renderPage('/workspace/ws/today')
      await waitFor(() => expect(list).toHaveBeenCalled())
      expect(slugsAsked()).toEqual(['ws'])
      expect(screen.getByText('Studio', { selector: 'span span' })).toBeTruthy()
    })

    it('/today reads every workspace and links each task to its own workspace', async () => {
      list.mockImplementation(async (p: { status: string; workspace_slug: string }) =>
        p.status === 'in_progress'
          ? { items: [task(`t-${p.workspace_slug}`, `Task of ${p.workspace_slug}`, 'in_progress')], total: 1 }
          : { items: [], total: 0 },
      )
      renderPage('/today')
      await waitFor(() => expect(screen.getByText('Task of other')).toBeTruthy())
      expect(slugsAsked()).toEqual(['other', 'ws'])
      expect(screen.getByText('Task of ws').closest('a')?.getAttribute('href')).toBe('/workspace/ws/tasks/t-ws')
      expect(screen.getByText('Task of other').closest('a')?.getAttribute('href')).toBe('/workspace/other/tasks/t-other')
    })

    it('widening from the workspace entry is one visible click and lands on /today', async () => {
      list.mockImplementation(emptyList)
      renderPage('/workspace/ws/today')
      await waitFor(() => expect(list).toHaveBeenCalled())
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
      expect(screen.getByTestId('where').textContent).toBe('/today')
      await waitFor(() => expect(slugsAsked()).toEqual(['other', 'ws']))
    })

    it('narrowing on /today is reflected in the query string', async () => {
      list.mockImplementation(emptyList)
      renderPage('/today?workspace=other')
      await waitFor(() => expect(list).toHaveBeenCalled())
      expect(slugsAsked()).toEqual(['other'])
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
      expect(screen.getByTestId('where').textContent).toBe('/today')
    })

    it('ignores an unknown workspace in the URL instead of showing nothing', async () => {
      list.mockImplementation(emptyList)
      renderPage('/today?workspace=ghost')
      await waitFor(() => expect(list).toHaveBeenCalled())
      expect(slugsAsked()).toEqual(['other', 'ws'])
    })
  })
})
