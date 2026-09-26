import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { installMatchMedia } from './testEnv'

const admin = vi.hoisted(() => ({
  getWatchStatus: vi.fn(),
  startWatch: vi.fn(),
  stopWatch: vi.fn(),
  syncDirectory: vi.fn(),
  getMeilisearchStats: vi.fn(),
  deleteMeilisearchOrphans: vi.fn(),
  getBackfillEmbeddingsStatus: vi.fn(),
  startBackfillEmbeddings: vi.fn(),
  cancelBackfillEmbeddings: vi.fn(),
  getBackfillSynapsesStatus: vi.fn(),
  startBackfillSynapses: vi.fn(),
  cancelBackfillSynapses: vi.fn(),
  updateStaleness: vi.fn(),
  cleanupCrossProjectCalls: vi.fn(),
}))
const ws = vi.hoisted(() => ({ list: vi.fn(), listProjects: vi.fn() }))
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({ adminApi: admin, workspacesApi: ws }))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

installMatchMedia()

import { AdminPage } from '../AdminPage'

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    admin.getWatchStatus.mockResolvedValue({ running: true, watched_paths: ['/code/po'] })
    admin.getMeilisearchStats.mockResolvedValue({ code_documents: 1234, is_indexing: false })
    admin.getBackfillEmbeddingsStatus.mockResolvedValue({ status: 'idle' })
    admin.getBackfillSynapsesStatus.mockResolvedValue({ status: 'failed', error: 'OOM' })
    admin.stopWatch.mockResolvedValue({})
    admin.updateStaleness.mockResolvedValue({ notes_updated: 7 })
    admin.cleanupCrossProjectCalls.mockResolvedValue({ deleted_count: 3 })
    ws.list.mockResolvedValue({ items: [{ name: 'Main', slug: 'main' }] })
    // No project in the current workspace → project-scoped actions disabled
    ws.listProjects.mockImplementation((slug: string) =>
      Promise.resolve(slug === 'main' ? [{ id: 'p1', name: 'Orchestrator', slug: 'po', root_path: '/code/po' }] : []),
    )
  })

  it('shows watchers as switches per project and stops one', async () => {
    render(<AdminPage />)
    const sw = await screen.findByRole('switch', { name: 'Watch Orchestrator' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    await waitFor(() => expect(admin.stopWatch).toHaveBeenCalledWith('p1'))
  })

  it('explains each maintenance action with its cost; global ones work without a project', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Knowledge Fabric' }))
    expect(screen.getByText(/Several minutes/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Bootstrap — Bootstrap Knowledge Fabric' }) as HTMLButtonElement).disabled).toBe(true)
    const staleness = screen.getByRole('button', { name: 'Run — Update staleness scores' }) as HTMLButtonElement
    expect(staleness.disabled).toBe(false)
    fireEvent.click(staleness)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated staleness for 7 notes'))
  })

  it('confirms destructive cleanups', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cleanup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clean — Cross-project calls' }))
    expect(admin.cleanupCrossProjectCalls).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(admin.cleanupCrossProjectCalls).toHaveBeenCalled())
  })

  it('shows backfill status and errors', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Embeddings & backfills' }))
    expect(await screen.findByText('OOM')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('Idle')).toBeTruthy()
  })
})
