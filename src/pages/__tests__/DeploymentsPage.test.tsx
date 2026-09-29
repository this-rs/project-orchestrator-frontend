/**
 * DeploymentsPage — per project, environments with what was shipped last.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listProjects = vi.fn()
const matrix = vi.fn()

vi.mock('@/services/workspaces', () => ({
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))
vi.mock('@/services/environments', () => ({
  environmentsApi: { matrix: (...a: unknown[]) => matrix(...a) },
}))
vi.mock('@/hooks', () => ({ useWorkspaceSlug: () => 'ws' }))

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

import { DeploymentsPage } from '../DeploymentsPage'

const entry = (name: string, kind: string, dep: object | null, recent: string[] = []) => ({
  environment: { id: name, project_id: 'p1', name, kind, url: null, created_at: '' },
  latest_deployment: dep,
  recent_statuses: recent,
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <DeploymentsPage />
    </MemoryRouter>,
  )

describe('DeploymentsPage', () => {
  beforeEach(() => {
    listProjects.mockReset()
    matrix.mockReset()
  })

  it('shows status, version and commit per environment, production after dev', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([
      entry('prod', 'production', { id: 'd', status: 'failed', version: 'v1.2.0', commit_sha: 'abcdef123456', started_at: new Date().toISOString(), created_by: 'x', environment_id: 'prod' }, ['failed', 'succeeded']),
      entry('dev', 'dev', null),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Backend')).toBeTruthy())
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('v1.2.0')).toBeTruthy()
    expect(screen.getByText('abcdef1')).toBeTruthy()
    expect(screen.getByText('Never deployed')).toBeTruthy()
    const titles = screen.getAllByText(/^(dev|prod)$/).map((n) => n.textContent)
    expect(titles).toEqual(['dev', 'prod'])
  })

  it('shows an empty state when no project has an environment', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('No environment yet')).toBeTruthy())
  })

  it('shows an error state', async () => {
    listProjects.mockRejectedValueOnce(new Error('down'))
    renderPage()
    await waitFor(() => expect(screen.getByText('Failed to load deployments')).toBeTruthy())
  })
})
