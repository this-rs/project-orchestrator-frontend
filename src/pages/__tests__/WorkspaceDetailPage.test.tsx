/**
 * WorkspaceDetailPage — overview dashboard.
 *
 * Regression (kept): intelligence sections must never be blank while the
 * intelligence summary is loading / failed / empty (IntelFallback).
 * Migration: every list (projects, milestones, resources, components) keeps
 * its information and actions, destructive actions are confirmed, actions are
 * reachable without hover.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installMatchMedia } from './testUtils'

const getOverview = vi.fn()
const getMilestoneProgress = vi.fn()
const removeProject = vi.fn()
const deleteResource = vi.fn()
const deleteComponent = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }
const intel = {
  summary: null as unknown,
  health: null,
  project: null,
  loading: false,
  error: null as string | null,
  refreshing: false,
  healthScore: 72,
  handleRefresh: vi.fn(),
  getAction: (key: string) => ({ key, status: 'idle' as const }),
  runAction: vi.fn(),
}

vi.mock('@/services', () => ({
  workspacesApi: {
    getOverview: (...a: unknown[]) => getOverview(...a),
    getMilestoneProgress: (...a: unknown[]) => getMilestoneProgress(...a),
    removeProject: (...a: unknown[]) => removeProject(...a),
    deleteResource: (...a: unknown[]) => deleteResource(...a),
    deleteComponent: (...a: unknown[]) => deleteComponent(...a),
    list: vi.fn().mockResolvedValue({ items: [] }),
  },
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
}))
vi.mock('@/services/admin', () => ({
  adminApi: { getWatchStatus: vi.fn().mockResolvedValue({ watched_paths: [] }) },
}))
vi.mock('@/components/intelligence/useWorkspaceIntelligenceData', () => ({
  useWorkspaceIntelligenceData: () => intel,
}))
vi.mock('@/components/intelligence/WorkspaceGraphPage', () => ({ default: () => <div>graph</div> }))
vi.mock('@/components/intelligence/WorkspaceLearningTimeline', () => ({ default: () => <div>timeline</div> }))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

installMatchMedia()

import { WorkspaceDetailPage } from '../WorkspaceDetailPage'
import { IntelFallback } from '@/components/intelligence/IntelligenceDashboard'

const overview = {
  workspace: { id: 'w1', name: 'Main WS', slug: 'ws', description: 'The workspace', created_at: '2026-01-01' },
  projects: [{ id: 'p1', name: 'Backend', slug: 'backend', root_path: '/src/backend', created_at: '2026-01-01' }],
  milestones: [
    { id: 'm1', workspace_id: 'w1', title: 'v1 launch', status: 'in_progress', created_at: '2026-01-01', tags: ['launch'], target_date: '2026-12-01' },
  ],
  resources: [{ id: 'r1', name: 'API spec', resource_type: 'api_contract', file_path: 'specs/api.yaml', created_at: '2026-01-01' }],
  components: [{ id: 'c1', workspace_id: 'w1', name: 'Gateway', component_type: 'service', runtime: 'docker', created_at: '2026-01-01', tags: [] }],
  progress: { completed_tasks: 3, total_tasks: 8, percentage: 37.5 },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkspaceDetailPage />
    </MemoryRouter>,
  )
}

describe('IntelFallback (regression: intel sections must never be blank)', () => {
  const handleRefresh = vi.fn()
  it('shows a loading placeholder', () => {
    render(<IntelFallback intelligence={{ loading: true, error: null, summary: null, handleRefresh }} />)
    expect(screen.getByTestId('intel-loading')).toBeTruthy()
    expect(screen.getByText('Loading intelligence data…')).toBeTruthy()
  })
  it('shows the error and a working Retry', () => {
    render(<IntelFallback intelligence={{ loading: false, error: 'Network timeout', summary: null, handleRefresh }} />)
    expect(screen.getByTestId('intel-error')).toBeTruthy()
    expect(screen.getByText('Network timeout')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(handleRefresh).toHaveBeenCalledOnce()
  })
  it('shows the empty state', () => {
    render(<IntelFallback intelligence={{ loading: false, error: null, summary: null, handleRefresh }} />)
    expect(screen.getByTestId('intel-empty')).toBeTruthy()
    expect(screen.getByText('No intelligence data available. Sync your projects first.')).toBeTruthy()
  })
})

describe('WorkspaceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getOverview.mockResolvedValue(overview)
    getMilestoneProgress.mockResolvedValue({ total: 4, completed: 1, in_progress: 1, pending: 2, percentage: 25 })
    removeProject.mockResolvedValue({})
    deleteResource.mockResolvedValue({})
    deleteComponent.mockResolvedValue({})
    intel.summary = null
  })

  it('renders header facts and every section with its content', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Main WS' })).toBeTruthy()
    expect(screen.getByText('1 project')).toBeTruthy()
    expect(screen.getByText(/3 \/ 8 tasks completed/)).toBeTruthy()
    // intel not ready → fallback rendered in the Health section
    expect(screen.getByTestId('intel-empty')).toBeTruthy()

    const project = screen.getByRole('link', { name: 'Backend' })
    expect(project.getAttribute('href')).toBe('/workspace/ws/projects/backend')
    expect(within(project.closest('li')!).getByText('/src/backend')).toBeTruthy()

    const ms = (await screen.findByRole('link', { name: 'v1 launch' })).closest('li')!
    expect(within(ms).getByText('In progress')).toBeTruthy()
    await waitFor(() => expect(within(ms).getByText('25%')).toBeTruthy())
    expect(within(ms).getByText('#launch')).toBeTruthy()
    expect(within(ms).getByRole('progressbar')).toBeTruthy()

    expect(screen.getByText('API spec')).toBeTruthy()
    expect(screen.getByText('specs/api.yaml')).toBeTruthy()
    expect(screen.getByText('Gateway')).toBeTruthy()
    expect(screen.getByText('docker')).toBeTruthy()
  })

  it('removes a project from the workspace only after confirmation', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Backend' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Backend' }))
    expect(screen.getByRole('menuitem', { name: 'Move to another workspace' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from workspace' }))
    expect(removeProject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeProject).toHaveBeenCalledWith('ws', 'p1'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Backend' })).toBeNull())
  })

  it('deletes a resource after confirmation', async () => {
    renderPage()
    await screen.findByText('API spec')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for API spec' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(deleteResource).toHaveBeenCalledWith('r1'))
  })

  it('shows stats, health and maintenance when intelligence is ready', async () => {
    intel.summary = {
      code: { files: 10, functions: 90, communities: 2, orphans: 0, hotspots: [] },
      knowledge: { notes: 5, decisions: 2, stale_count: 3, types_distribution: {} },
      neural: { active_synapses: 40, avg_energy: 0.5, weak_synapses_ratio: 0.2, dead_notes_count: 0 },
      skills: { total: 4, active: 2, emerging: 1, avg_cohesion: 0.5, total_activations: 0 },
      fabric: { co_changed_pairs: 0 },
      behavioral: { protocols: 0, system_protocols: 0, business_protocols: 0, skill_linked: 0, states: 0, transitions: 0 },
    }
    renderPage()
    expect(await screen.findByText('Health 72')).toBeTruthy()
    expect(screen.getByText('Code entities')).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByRole('meter', { name: 'Note freshness' })).toBeTruthy()
    // attention: 3 stale notes
    expect(screen.getByRole('region', { name: /Attention needed/ })).toBeTruthy()
    // maintenance collapsed by default, reachable by tap
    fireEvent.click(screen.getByRole('button', { name: /Maintenance/ }))
    expect(screen.getByRole('button', { name: 'Run: Backfill synapses' })).toBeTruthy()
  })
})
