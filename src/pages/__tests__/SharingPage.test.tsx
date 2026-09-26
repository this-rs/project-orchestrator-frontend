import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { installMatchMedia } from './testEnv'

const sharing = vi.hoisted(() => ({
  getStatus: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  setPolicy: vi.fn(),
  setConsent: vi.fn(),
  getHistory: vi.fn(),
  listTombstones: vi.fn(),
  retract: vi.fn(),
  getLastReport: vi.fn(),
  preview: vi.fn(),
  suggest: vi.fn(),
}))
const listProjects = vi.hoisted(() => vi.fn())
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({ sharingApi: sharing, workspacesApi: { listProjects } }))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

installMatchMedia()

import { SharingPage } from '../SharingPage'

const policy = { enabled: false, mode: 'manual', min_shareability_score: 0.5, type_overrides: { gotcha: 'never' }, l3_scan_enabled: true }

describe('SharingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listProjects.mockResolvedValue([{ slug: 'po', name: 'Orchestrator' }])
    sharing.getStatus.mockResolvedValue({ enabled: false, policy })
    sharing.enable.mockResolvedValue({ enabled: true, policy: { ...policy, enabled: true } })
    sharing.setPolicy.mockResolvedValue({ ...policy, mode: 'auto' })
    sharing.setConsent.mockResolvedValue({ updated: true })
    sharing.getHistory.mockResolvedValue([])
    sharing.listTombstones.mockResolvedValue([])
    sharing.getLastReport.mockResolvedValue({
      stats: { consent_allowed: 4, consent_denied: 1, consent_pending: 2, denied_reasons: [] },
      generated_at: new Date().toISOString(),
    })
    sharing.preview.mockResolvedValue([
      { note_id: 'n1aaaaaaaa', note_type: 'pattern', content_preview: 'Use retries', consent: 'policy_auto', shareability_score: 0.9, decision: 'allow' },
    ])
    sharing.suggest.mockResolvedValue([
      { note_id: 'n2bbbbbbbb', note_type: 'tip', content_preview: 'Cache the graph', shareability_score: 0.8, reason: 'high score' },
    ])
  })

  it('shows policy rows, overrides and the privacy report with meaning', async () => {
    render(<SharingPage />)
    expect(await screen.findByRole('switch', { name: 'Sharing' })).toBeTruthy()
    expect(screen.getByText(/Rien ne part sans votre accord/)).toBeTruthy()
    expect(screen.getByText('gotcha')).toBeTruthy()
    expect(screen.getByText('never')).toBeTruthy()
    expect(await screen.findByText('notes autorisées')).toBeTruthy()
    expect(screen.getByText('en attente de décision')).toBeTruthy()
  })

  it('confirms before enabling sharing', async () => {
    render(<SharingPage />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Sharing' }))
    expect(sharing.enable).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
    await waitFor(() => expect(sharing.enable).toHaveBeenCalledWith('po'))
  })

  it('allows a suggested note and lists the preview decision', async () => {
    render(<SharingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Suggestions/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(sharing.setConsent).toHaveBeenCalledWith('n2bbbbbbbb', { consent: 'explicit_allow' }))
    fireEvent.click(screen.getByRole('button', { name: /Preview/ }))
    expect(await screen.findByText('Use retries')).toBeTruthy()
    expect(screen.getByText('Shared')).toBeTruthy()
    expect(screen.getByText('Auto (policy)')).toBeTruthy()
  })
})
