/**
 * DeploymentsPage — per project, environments with what was shipped last, and
 * the forms that let a human declare them without going through an agent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listProjects = vi.fn()
const matrix = vi.fn()
const create = vi.fn()
const update = vi.fn()
const remove = vi.fn()
const deploy = vi.fn()
const updateDeployment = vi.fn()

vi.mock('@/services/workspaces', () => ({
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))
vi.mock('@/services/environments', () => ({
  ENVIRONMENT_KINDS: ['dev', 'staging', 'production', 'other'],
  DEPLOYMENT_STATUSES: ['pending', 'running', 'succeeded', 'failed', 'rolled_back'],
  environmentsApi: {
    matrix: (...a: unknown[]) => matrix(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    remove: (...a: unknown[]) => remove(...a),
    deploy: (...a: unknown[]) => deploy(...a),
    updateDeployment: (...a: unknown[]) => updateDeployment(...a),
  },
}))
vi.mock('@/services/api', () => ({
  apiErrorMessage: (err: unknown, fallback: string) =>
    (err instanceof Error && err.message) || fallback,
}))
vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'ws',
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
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
    create.mockReset().mockResolvedValue({})
    update.mockReset().mockResolvedValue({})
    remove.mockReset().mockResolvedValue(undefined)
    deploy.mockReset().mockResolvedValue({})
    updateDeployment.mockReset().mockResolvedValue({})
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

  it('creates an environment for the selected project and reloads the matrix', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('No environment yet')).toBeTruthy())

    fireEvent.click(screen.getAllByRole('button', { name: /New environment/ })[0])
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: '  production  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    // Name trimmed, kind defaulted, no empty optional field sent.
    expect(create).toHaveBeenCalledWith('p1', { name: 'production', kind: 'dev' })
    await waitFor(() => expect(matrix).toHaveBeenCalledTimes(2))
  }, 15000)

  it('refuses an empty name without calling the API', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('No environment yet')).toBeTruthy())

    fireEvent.click(screen.getAllByRole('button', { name: /New environment/ })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New environment' })).toBeTruthy())
    expect(create).not.toHaveBeenCalled()
  }, 15000)

  it('keeps the form open when the name is already taken', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([])
    create.mockRejectedValueOnce(new Error("An environment named 'dev' already exists in this project"))
    renderPage()
    await waitFor(() => expect(screen.getByText('No environment yet')).toBeTruthy())

    fireEvent.click(screen.getAllByRole('button', { name: /New environment/ })[0])
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'dev' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('heading', { name: 'New environment' })).toBeTruthy()
  }, 15000)

  it('refuses a config that is not JSON', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('No environment yet')).toBeTruthy())

    fireEvent.click(screen.getAllByRole('button', { name: /New environment/ })[0])
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'dev' } })
    fireEvent.change(screen.getByLabelText('Config'), { target: { value: 'host: launchd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New environment' })).toBeTruthy())
    expect(create).not.toHaveBeenCalled()
  }, 15000)

  it('records a deployment from the row menu', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([entry('dev', 'dev', null)])
    renderPage()
    await waitFor(() => expect(screen.getByText('Backend')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for dev' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record a deployment' }))
    fireEvent.change(screen.getByLabelText('Version'), { target: { value: 'v0.0.15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(() => expect(deploy).toHaveBeenCalledTimes(1))
    expect(deploy).toHaveBeenCalledWith('dev', { status: 'succeeded', created_by: 'ui', version: 'v0.0.15' })
  }, 15000)

  it('sends every field on edit, so an emptied one is cleared server-side', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([
      {
        environment: {
          id: 'e1',
          project_id: 'p1',
          name: 'dev',
          kind: 'dev',
          url: 'https://dev.example',
          description: 'old',
          created_at: '',
        },
        latest_deployment: null,
        recent_statuses: [],
      },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Backend')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for dev' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith('e1', {
      name: 'dev',
      kind: 'dev',
      url: '',
      description: 'old',
      config: '',
    })
  }, 15000)

  it('deletes an environment only after confirmation', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([entry('dev', 'dev', null)])
    renderPage()
    await waitFor(() => expect(screen.getByText('Backend')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for dev' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()

    expect(screen.getByText('Delete dev?')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('dev'))
  }, 15000)

  it('offers to settle an in-flight deployment, and only then', async () => {
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Backend' }])
    matrix.mockResolvedValue([
      entry('dev', 'dev', {
        id: 'd1',
        status: 'running',
        started_at: new Date().toISOString(),
        created_by: 'ui',
        environment_id: 'dev',
      }),
      entry('prod', 'production', {
        id: 'd2',
        status: 'succeeded',
        started_at: new Date().toISOString(),
        created_by: 'ui',
        environment_id: 'prod',
      }),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Backend')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Actions for prod' }))
    expect(screen.queryByRole('menuitem', { name: 'Mark succeeded' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Actions for dev' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark succeeded' }))
    await waitFor(() => expect(updateDeployment).toHaveBeenCalledWith('d1', { status: 'succeeded' }))
  }, 15000)
})
