/**
 * ProjectDetailPage — project hub.
 *
 * Header facts, single progress line, section order (work before
 * diagnostics), milestone / release rows, ⋯ menu with confirmed delete,
 * intelligence fallback and ready states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { installMatchMedia } from './testUtils'

const get = vi.fn()
const getRoadmap = vi.fn()
const sync = vi.fn()
const remove = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }
const intel = {
  summary: null as unknown,
  health: null,
  project: null,
  loading: false,
  error: null as string | null,
  refreshing: false,
  healthScore: 64,
  handleRefresh: vi.fn(),
  getAction: (key: string) => ({ key, status: 'idle' as const }),
  runAction: vi.fn(),
}

vi.mock('@/services', () => ({
  projectsApi: {
    get: (...a: unknown[]) => get(...a),
    getRoadmap: (...a: unknown[]) => getRoadmap(...a),
    sync: (...a: unknown[]) => sync(...a),
    delete: (...a: unknown[]) => remove(...a),
    getMilestone: vi.fn().mockResolvedValue({ plans: [] }),
    update: vi.fn(),
    createMilestone: vi.fn(),
    createRelease: vi.fn(),
  },
  tasksApi: { listSteps: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue({ items: [] }) },
}))
vi.mock('@/services/admin', () => ({
  adminApi: { getWatchStatus: vi.fn().mockResolvedValue({ watched_paths: [] }) },
}))
vi.mock('@/components/intelligence/IntelligenceDashboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/intelligence/IntelligenceDashboard')>()),
  useIntelligenceData: () => intel,
}))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

installMatchMedia()

import { ProjectDetailPage } from '../ProjectDetailPage'

const project = {
  id: 'p1',
  name: 'Backend',
  slug: 'backend',
  root_path: '/src/backend',
  description: 'Rust API',
  created_at: '2026-01-01T00:00:00Z',
  last_synced: new Date(Date.now() - 3600_000).toISOString(),
}

const roadmap = {
  milestones: [
    {
      milestone: { id: 'm1', title: 'v1 launch', status: 'in_progress', target_date: '2026-12-01', created_at: '2026-01-01', project_id: 'p1' },
      tasks: [],
      progress: { total: 4, completed: 1, in_progress: 1, pending: 2, percentage: 25 },
    },
  ],
  releases: [
    {
      release: { id: 'r1', version: '1.0', title: 'First', status: 'planned', target_date: '2026-11-01', created_at: '2026-01-01', project_id: 'p1' },
      tasks: [{ id: 't1' }, { id: 't2' }],
      commits: [],
    },
  ],
  progress: { total_tasks: 8, completed_tasks: 3, in_progress_tasks: 2, pending_tasks: 3, percentage: 37.5 },
  dependency_graph: { nodes: [], edges: [] },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/projects/backend']}>
      <Routes>
        <Route path="/workspace/:slug/projects/:projectSlug" element={<ProjectDetailPage />} />
        <Route path="/workspace/:slug/projects" element={<div>projects list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue(project)
    getRoadmap.mockResolvedValue(roadmap)
    sync.mockResolvedValue({})
    remove.mockResolvedValue({})
    intel.summary = null
  })

  it('renders header facts, one progress line and every section in hub order', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Backend' })).toBeTruthy()
    expect(screen.getByText('backend')).toBeTruthy()
    expect(screen.getByText('synced 1h')).toBeTruthy()
    expect(await screen.findByText('1 milestone')).toBeTruthy()
    expect(screen.getByText('1 release')).toBeTruthy()

    // progress once: bar + counts
    expect(screen.getByRole('progressbar', { name: 'Project progress' })).toBeTruthy()
    expect(screen.getByText(/3 \/ 8 tasks completed · 38%/)).toBeTruthy()
    expect(screen.getByText(/2 in progress/)).toBeTruthy()

    // milestone row
    const ms = screen.getByRole('link', { name: 'v1 launch' })
    expect(ms.getAttribute('href')).toBe('/workspace/ws/project-milestones/m1')
    expect(within(ms.closest('li')!).getByText('25%')).toBeTruthy()

    // releases collapsed, then opened
    const releases = screen.getByRole('button', { name: /Releases/ })
    expect(releases.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(releases)
    expect(screen.getByText('v1.0 — First')).toBeTruthy()
    expect(screen.getByText('Planned')).toBeTruthy()
    expect(screen.getByText('2 tasks')).toBeTruthy()

    // intelligence not ready → fallback inside Health, never blank
    expect(screen.getByTestId('intel-empty')).toBeTruthy()

    // details + explore
    expect(screen.getByTitle('Copy path')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Intelligence' }).getAttribute('href')).toBe('/workspace/ws/projects/backend/intelligence')

    // order: the pulse (health) leads the page, before the milestones; details come after
    const milestones = screen.getByRole('heading', { name: /Milestones/ })
    const health = screen.getByRole('heading', { name: 'Health' })
    const details = screen.getByRole('heading', { name: 'Details' })
    expect(health.compareDocumentPosition(milestones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(health.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('syncs the codebase from the header button', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Backend' })
    fireEvent.click(screen.getByRole('button', { name: 'Sync codebase' }))
    await waitFor(() => expect(sync).toHaveBeenCalledWith('backend'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Codebase synced'))
  })

  it('deletes the project from the ⋯ menu only after confirmation, then leaves the page', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Backend' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Backend' }))
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Copy root path' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('backend'))
    expect(await screen.findByText('projects list')).toBeTruthy()
  })

  it('shows key numbers, health, attention and maintenance when intelligence is ready', async () => {
    intel.summary = {
      code: { files: 10, functions: 90, communities: 2, orphans: 0, hotspots: [] },
      knowledge: { notes: 5, decisions: 2, stale_count: 3, types_distribution: {} },
      neural: { active_synapses: 40, avg_energy: 0.5, weak_synapses_ratio: 0.2, dead_notes_count: 0 },
      skills: { total: 4, active: 2, emerging: 1, avg_cohesion: 0.5, total_activations: 0 },
      fabric: { co_changed_pairs: 0 },
      behavioral: { protocols: 0, system_protocols: 0, business_protocols: 0, skill_linked: 0, states: 0, transitions: 0 },
    }
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Backend' })
    expect(screen.getByText('Code entities')).toBeTruthy()
    expect(screen.getByRole('meter', { name: 'Note freshness' })).toBeTruthy()
    expect(screen.getByRole('region', { name: /Attention needed/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh intelligence data' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Maintenance/ }))
    expect(screen.getByRole('button', { name: 'Run: Backfill synapses' })).toBeTruthy()
  })
})
