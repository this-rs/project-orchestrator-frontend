/**
 * WorkspaceSelectorPage — list of workspaces as EntityRows, not-found
 * alert, single-workspace redirect, onboarding and inline creation,
 * error + retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'

const list = vi.fn()
const create = vi.fn()

vi.mock('@/services/workspaces', () => ({
  workspacesApi: { list: (...a: unknown[]) => list(...a), create: (...a: unknown[]) => create(...a) },
}))

import { WorkspaceSelectorPage } from '../WorkspaceSelectorPage'

function Landed() {
  const { slug } = useParams()
  return <div>overview {slug}</div>
}

function renderAt(path = '/workspace-selector') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workspace-selector" element={<WorkspaceSelectorPage />} />
        <Route path="/workspace/:slug/overview" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  )
}

const workspaces = [
  { id: 'a', name: 'Alpha', slug: 'alpha', description: 'First one', created_at: '2026-01-01', updated_at: new Date(Date.now() - 86400_000 * 2).toISOString() },
  { id: 'b', name: 'Beta', slug: 'beta', created_at: '2026-01-01' },
]

describe('WorkspaceSelectorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ items: workspaces })
    create.mockResolvedValue({ id: 'n', name: 'New', slug: 'new', created_at: '' })
  })

  it('lists workspaces with description and slug, warns about a missing one, and opens on tap', async () => {
    renderAt('/workspace-selector?notFound=old')
    const alpha = await screen.findByRole('button', { name: 'Alpha' })
    const row = alpha.closest('li')!
    expect(within(row).getByText('First one')).toBeTruthy()
    expect(within(row).getByText('alpha')).toBeTruthy()
    expect(within(row).getByText('updated 2d')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Beta' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('"old"')
    fireEvent.click(alpha)
    expect(await screen.findByText('overview alpha')).toBeTruthy()
  })

  it('redirects straight to the only workspace', async () => {
    list.mockResolvedValue({ items: [{ id: 's', name: 'Solo', slug: 'solo', created_at: '' }] })
    renderAt()
    expect(await screen.findByText('overview solo')).toBeTruthy()
  })

  it('creates a workspace inline from the list', async () => {
    renderAt()
    await screen.findByRole('button', { name: 'Alpha' })
    fireEvent.click(screen.getByRole('button', { name: 'Create new workspace' }))
    const input = screen.getByRole('textbox', { name: 'Workspace name' })
    expect(input.className).toContain('text-base')
    fireEvent.change(input, { target: { value: '  New ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'New' }))
    expect(await screen.findByText('overview new')).toBeTruthy()
  })

  it('shows onboarding when there is no workspace at all', async () => {
    list.mockResolvedValue({ items: [] })
    renderAt()
    expect(await screen.findByText('Welcome to Project Orchestrator')).toBeTruthy()
    const submit = screen.getByRole('button', { name: 'Create workspace' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), { target: { value: 'New' } })
    fireEvent.click(submit)
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'New' }))
    expect(await screen.findByText('overview new')).toBeTruthy()
  })

  it('shows a connection error with a working retry', async () => {
    list.mockRejectedValueOnce(new Error('down'))
    renderAt()
    expect(await screen.findByText('Connection error')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Alpha' })).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(2)
  })
})
