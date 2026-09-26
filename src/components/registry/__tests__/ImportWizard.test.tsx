/**
 * ImportWizard — preview → importing → success / error, in a dialog whose
 * every step stacks on a phone (destination + strategy selects, footer
 * buttons that wrap).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PublishedSkill, PublishedSkillSummary } from '@/types'
import { installDomStubs } from './domStubs'

installDomStubs()

const get = vi.fn()
const importFn = vi.fn()
vi.mock('@/services', () => ({
  registryApi: { get: (...a: unknown[]) => get(...a), import: (...a: unknown[]) => importFn(...a) },
}))

import { ImportWizard } from '../ImportWizard'

const summary: PublishedSkillSummary = {
  id: 'r1',
  name: 'Auth tokens',
  description: 'JWT handling',
  tags: ['auth'],
  trust_score: 0.82,
  trust_level: 'high',
  source_project_name: 'Origin',
  published_at: '2026-01-01T00:00:00Z',
  note_count: 2,
  protocol_count: 0,
  import_count: 1,
  is_remote: false,
}

const full: PublishedSkill = {
  ...summary,
  source_project_id: 'sp',
  published_by: 'me',
  trust_components: { energy_score: 1, cohesion_score: 1, activation_score: 1, success_rate_score: 1, source_diversity_score: 1 },
  package: {
    schema_version: 1,
    metadata: { format: 'skill', exported_at: '2026-01-01', stats: { note_count: 2, decision_count: 1, trigger_count: 0, activation_count: 0 } },
    skill: { name: 'Auth tokens', trigger_patterns: [], tags: ['auth'], cohesion: 0.5 },
    notes: [
      { note_type: 'gotcha', importance: 'high', content: 'Rotate keys often', tags: [] },
      { note_type: 'tip', importance: 'low', content: 'Prefer short TTLs', tags: [] },
    ],
    decisions: [{ description: 'Use RS256', rationale: 'r', alternatives: [] }],
    protocols: [],
  },
}

const projects = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Beta' },
]

describe('ImportWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue(full)
  })

  it('renders nothing while closed', () => {
    const { container } = render(<ImportWizard skill={null} projects={projects} onImported={vi.fn()} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('previews the package (trust, contents, notes) then imports into the chosen project', async () => {
    const onImported = vi.fn()
    render(<ImportWizard skill={summary} projects={projects} defaultProjectId="p2" onImported={onImported} onClose={vi.fn()} />)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('High trust')).toBeTruthy()
    expect(await screen.findByText('Rotate keys often')).toBeTruthy()
    expect(screen.getByText('2 notes')).toBeTruthy()
    expect(screen.getByText('1 decision')).toBeTruthy()
    expect(screen.getByText('from Origin')).toBeTruthy()
    expect(screen.getByText('imported 1×')).toBeTruthy()

    const result = { skill_id: 's9', notes_created: 2, decisions_imported: 1, synapses_created: 4, was_merged: false }
    importFn.mockResolvedValue(result)
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }))
    await waitFor(() => expect(importFn).toHaveBeenCalledWith('r1', { project_id: 'p2', conflict_strategy: 'skip' }))
    expect(await screen.findByText('“Auth tokens” imported')).toBeTruthy()
    expect(screen.getByText('2 notes created')).toBeTruthy()
    expect(screen.getByText('4 synapses')).toBeTruthy()
    expect(onImported).toHaveBeenCalledWith(result)
  })

  it('shows the error step with retry', async () => {
    importFn.mockRejectedValueOnce(new Error('boom'))
    render(<ImportWizard skill={summary} projects={projects} onImported={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Import skill' }))
    expect(await screen.findByText('Import failed')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
    importFn.mockResolvedValueOnce({ skill_id: 's9', notes_created: 0, decisions_imported: 0, synapses_created: 0, was_merged: false })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('“Auth tokens” imported')).toBeTruthy()
  })
})
