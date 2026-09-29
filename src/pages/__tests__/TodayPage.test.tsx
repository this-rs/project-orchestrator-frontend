/**
 * TodayPage — the task list cut by what needs a decision now:
 * in progress, blocked, up next. Empty sections are not rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const list = vi.fn()
const update = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  tasksApi: { list: (...a: unknown[]) => list(...a), update: (...a: unknown[]) => update(...a) },
}))
vi.mock('@/hooks', () => ({
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
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

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
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
})
