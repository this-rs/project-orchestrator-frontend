/**
 * RfcDashboardPage — the proposals list speaks the product's words (never
 * "RFC"), shows each state as dot + text, offers the next steps in the ⋯ menu,
 * and tells "nothing yet" apart from "no match".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { rfcApi, workspacesApi, toast } = vi.hoisted(() => ({
  rfcApi: { list: vi.fn(), transition: vi.fn() },
  workspacesApi: { listProjects: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/services/rfcApi', () => ({ rfcApi }))
vi.mock('@/services', () => ({ workspacesApi }))
vi.mock('@/hooks', () => ({ useToast: () => toast, useWorkspaceSlug: () => 'ws' }))

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

import { RfcDashboardPage } from '../RfcDashboardPage'

const rfc = (id: string, title: string, status: string, extra = {}) => ({
  id,
  title,
  status,
  importance: 'medium',
  sections: [{ title: 'Content', content: `${title} — the gist of it.` }],
  created_at: new Date().toISOString(),
  tags: [],
  ...extra,
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <RfcDashboardPage />
    </MemoryRouter>,
  )

describe('RfcDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspacesApi.listProjects.mockResolvedValue([])
    rfcApi.list.mockResolvedValue({
      items: [rfc('r1', 'Split the billing service', 'under_review'), rfc('r2', 'Drop the legacy importer', 'rejected')],
      total: 2,
    })
  })

  it('lists the proposals grouped by state, each state as a word', async () => {
    renderPage()
    const row = (await screen.findByRole('link', { name: 'Split the billing service' })).closest('li')!
    expect(within(row).getByText('Under review')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: /Proposals/ })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Search proposals' })).toBeTruthy()
    expect(screen.getByText('What is this?')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\bRFCs\b/)
  })

  it('offers the next steps in the ⋯ menu and reports the new state', async () => {
    rfcApi.transition.mockResolvedValue(rfc('r1', 'Split the billing service', 'accepted'))
    renderPage()
    await screen.findByText('Split the billing service')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Split the billing service' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Accept → Accepted' }))
    await waitFor(() => expect(rfcApi.transition).toHaveBeenCalledWith('r1', 'accept'))
    expect(toast.success).toHaveBeenCalledWith('Accept: Accepted')
  })

  it('tells "nothing yet" apart from "no match"', async () => {
    rfcApi.list.mockResolvedValue({ items: [], total: 0 })
    renderPage()
    expect(await screen.findByText('No proposals yet')).toBeTruthy()
  })

  it('offers to clear a search that matches nothing', async () => {
    renderPage()
    await screen.findByText('Split the billing service')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search proposals' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No matching proposals')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Split the billing service')).toBeTruthy()
  })
})
