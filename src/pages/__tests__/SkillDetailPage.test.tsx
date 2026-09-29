/**
 * SkillDetailPage — PageHeader → key facts → sections. Verifies nothing from
 * the previous card layout was lost: metrics, health, members (with remove),
 * triggers, context template editing, export, delete, activation test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Decision, Note, Skill, SkillHealth } from '@/types'
import { installDomStubs } from '@/components/registry/__tests__/domStubs'

installDomStubs()

const get = vi.fn()
const getHealth = vi.fn()
const getMembers = vi.fn()
const update = vi.fn()
const remove = vi.fn()
const activate = vi.fn()
const removeMember = vi.fn()
const exportSkill = vi.fn()
const listProjects = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  skillsApi: {
    get: (...a: unknown[]) => get(...a),
    getHealth: (...a: unknown[]) => getHealth(...a),
    getMembers: (...a: unknown[]) => getMembers(...a),
    update: (...a: unknown[]) => update(...a),
    delete: (...a: unknown[]) => remove(...a),
    activate: (...a: unknown[]) => activate(...a),
    removeMember: (...a: unknown[]) => removeMember(...a),
    exportSkill: (...a: unknown[]) => exportSkill(...a),
  },
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))

vi.mock('@/hooks', () => ({ useSectionObserver: () => 'skill-vitals', useToast: () => toast, useWorkspaceSlug: () => 'ws' }))

import { SkillDetailPage } from '../SkillDetailPage'

const skill: Skill = {
  id: 's1',
  project_id: 'p1',
  name: 'Auth tokens',
  description: 'JWT handling',
  status: 'active',
  trigger_patterns: [
    { pattern_type: 'regex', pattern_value: 'jwt|token', confidence_threshold: 0.6, quality_score: 0.8 },
    { pattern_type: 'file_glob', pattern_value: 'src/auth/**', confidence_threshold: 0.5, quality_score: 0.1 },
  ],
  context_template: 'Always rotate keys.',
  energy: 0.8,
  cohesion: 0.7,
  coverage: 3,
  note_count: 1,
  decision_count: 1,
  activation_count: 6,
  hit_rate: 0.5,
  last_activated: new Date(Date.now() - 2 * 3600_000).toISOString(),
  version: 2,
  fingerprint: 'abcdef0123456789abcdef',
  is_validated: true,
  tags: ['auth', 'jwt'],
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-02T10:00:00Z',
}

const health: SkillHealth = {
  skill_id: 's1',
  skill_name: 'Auth tokens',
  status: 'active',
  activation_count: 6,
  hit_rate: 0.5,
  energy: 0.8,
  cohesion: 0.7,
  note_count: 1,
  decision_count: 1,
  days_since_import: 3,
  is_validated: false,
  in_probation: true,
  probation_days_remaining: 4,
  recommendation: 'needs_attention',
  explanation: 'Few activations so far.',
}

const note: Note = {
  id: 'n1',
  project_id: 'p1',
  note_type: 'gotcha',
  status: 'active',
  importance: 'high',
  content: 'Rotate keys often',
  tags: ['keys'],
  anchors: [],
  created_at: '2026-01-01T00:00:00Z',
  created_by: 'me',
  staleness_score: 0,
}

const decision: Decision = {
  id: 'd1',
  description: 'Use RS256',
  rationale: 'asymmetric',
  alternatives: [],
  chosen_option: 'RS256',
  decided_by: 'me',
  decided_at: '2026-01-01T00:00:00Z',
  status: 'accepted',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/skills/s1']}>
      <Routes>
        <Route path="/workspace/ws/skills/:id" element={<SkillDetailPage />} />
        <Route path="/workspace/ws/skills" element={<div>skills list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SkillDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue(skill)
    getHealth.mockResolvedValue(health)
    getMembers.mockResolvedValue({ notes: [note], decisions: [decision] })
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Alpha', slug: 'alpha' }])
    update.mockImplementation((_id: string, data: Partial<Skill>) => Promise.resolve({ ...skill, ...data }))
    remove.mockResolvedValue({})
    removeMember.mockResolvedValue({})
  })

  it('renders header facts, tags, section nav and every section', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Auth tokens' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Status: Active/ })).toBeTruthy()
    expect(screen.getByText('2 members')).toBeTruthy()
    expect(screen.getByText('6 activations')).toBeTruthy()
    expect(screen.getByText('used 2h')).toBeTruthy()
    // Version is a key fact in the header AND a row of the Details facts
    expect(screen.getAllByText('v2')).toHaveLength(2)
    expect(within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem')).toHaveLength(2)
    expect(await screen.findByRole('link', { name: 'Project: Alpha' })).toBeTruthy()

    // Vital signs
    const vitals = screen.getByRole('region', { name: 'Vital signs' })
    expect(within(vitals).getByText('80%')).toBeTruthy()
    expect(within(vitals).getByText('70%')).toBeTruthy()
    expect(within(vitals).getByText('1 notes · 1 decisions')).toBeTruthy()

    // Health
    const h = screen.getByRole('region', { name: 'Health' })
    expect(within(h).getByText('Needs attention')).toBeTruthy()
    expect(within(h).getByText('Few activations so far.')).toBeTruthy()
    expect(within(h).getByText('Not validated')).toBeTruthy()
    expect(within(h).getByText(/4 days remaining/)).toBeTruthy()

    // Members
    const m = screen.getByRole('region', { name: /^Members/ })
    expect(within(m).getByRole('button', { name: /^Note: Rotate keys often/, expanded: false })).toBeTruthy()
    expect(within(m).getByText('gotcha')).toBeTruthy()
    expect(within(m).getByText('High')).toBeTruthy()
    expect(within(m).getByRole('link', { name: 'Use RS256' }).getAttribute('href')).toBe('/workspace/ws/decisions/d1')
    expect(within(m).getByText('Chosen: RS256')).toBeTruthy()

    // Triggers
    const t = screen.getByRole('region', { name: /^Triggers/ })
    expect(within(t).getByText('jwt|token')).toBeTruthy()
    expect(within(t).getByText('Regex')).toBeTruthy()
    expect(within(t).getByText('threshold 0.60')).toBeTruthy()
    expect(within(t).getByText(/quality 0.10/).textContent).toMatch(/unreliable, skipped/)

    // Context template + details
    expect(screen.getByText('Always rotate keys.')).toBeTruthy()
    const d = screen.getByRole('region', { name: 'Details' })
    expect(within(d).getByText('Yes')).toBeTruthy()
    expect(within(d).getByText('s1')).toBeTruthy()

    // Section nav
    expect(screen.getByRole('button', { name: /Members/ })).toBeTruthy()
  })

  it('removes a member after confirmation', async () => {
    renderPage()
    const m = await screen.findByRole('region', { name: /^Members/ })
    fireEvent.click(within(m).getByRole('button', { name: 'Actions for Use RS256' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(removeMember).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('s1', 'decision', 'd1'))
    expect(getMembers).toHaveBeenCalledTimes(2)
  })

  it('edits and saves the context template in place', async () => {
    renderPage()
    const section = await screen.findByRole('region', { name: 'Context template' })
    fireEvent.click(within(section).getByRole('button', { name: /Edit/ }))
    const area = within(section).getByRole('textbox', { name: 'Context template' })
    fireEvent.change(area, { target: { value: 'New template' } })
    fireEvent.click(within(section).getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('s1', { context_template: 'New template' }))
    expect(await within(section).findByText('New template')).toBeTruthy()
  })

  it('runs an activation test from the header action', async () => {
    activate.mockResolvedValue({
      skill,
      activated_notes: [{ note, activation_score: 0.9, source: 'direct', entity_type: 'note' }],
      relevant_decisions: [decision],
      context_text: 'ctx',
      confidence: 0.75,
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Test activation/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Activation query' }), { target: { value: 'auth' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Activate/ }))
    await waitFor(() => expect(activate).toHaveBeenCalledWith('s1', 'auth'))
    expect(await within(dialog).findByText('75%')).toBeTruthy()
    expect(within(dialog).getByText('1 note activated')).toBeTruthy()
    expect(within(dialog).getByText('direct member')).toBeTruthy()
  })

  it('exports and deletes from the ⋯ menu', async () => {
    exportSkill.mockResolvedValue({ schema_version: 1 })
    const createObjectURL = vi.fn(() => 'blob:x')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Auth tokens' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export package' }))
    await waitFor(() => expect(exportSkill).toHaveBeenCalledWith('s1'))
    expect(toast.success).toHaveBeenCalledWith('Skill exported')

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Auth tokens' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(remove).toHaveBeenCalledWith('s1'))
    expect(await screen.findByText('skills list')).toBeTruthy()
  })

  it('shows an error state with retry when the skill cannot be loaded', async () => {
    get.mockRejectedValueOnce(new Error('nope'))
    renderPage()
    expect(await screen.findByText('Skill not found')).toBeTruthy()
    get.mockResolvedValue(skill)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Auth tokens' })).toBeTruthy()
  })
})
