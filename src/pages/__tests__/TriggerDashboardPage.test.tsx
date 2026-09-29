/**
 * TriggerDashboardPage — triggers as EntityRows. Verifies that every fact of
 * the former trigger card (name, enabled state, entity / action patterns,
 * cooldown, conditions, protocol) and both actions (toggle, delete with
 * confirmation) are still there, plus filters and empty states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { EventTrigger, TriggerStats } from '@/services/triggers'

const list = vi.fn()
const stats = vi.fn()
const enable = vi.fn()
const disable = vi.fn()
const remove = vi.fn()
const getProtocol = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services/triggers', () => ({
  triggersApi: {
    list: (...a: unknown[]) => list(...a),
    stats: (...a: unknown[]) => stats(...a),
    enable: (...a: unknown[]) => enable(...a),
    disable: (...a: unknown[]) => disable(...a),
    delete: (...a: unknown[]) => remove(...a),
  },
}))
vi.mock('@/services', () => ({
  protocolApi: { getProtocol: (...a: unknown[]) => getProtocol(...a) },
}))
vi.mock('@/hooks', () => ({
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

// ConfirmDialog → useReducedMotion → matchMedia (absent in jsdom)
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

import { TriggerDashboardPage } from '../TriggerDashboardPage'

const triggers: EventTrigger[] = [
  {
    id: 'tr-1',
    name: 'Review on task completion',
    protocol_id: 'proto-1',
    entity_type_pattern: 'Task',
    action_pattern: 'StatusChanged',
    payload_conditions: { status: 'completed', priority: 8 },
    cooldown_secs: 30,
    enabled: true,
    project_scope: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tr-2',
    name: 'Archive stale notes',
    protocol_id: 'proto-2',
    entity_type_pattern: 'Note',
    action_pattern: null,
    payload_conditions: null,
    cooldown_secs: 0,
    enabled: false,
    project_scope: 'proj-a',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]
const triggerStats: TriggerStats = {
  total: 2,
  enabled: 1,
  disabled: 1,
  by_entity_type: [
    { entity_type: 'Task', count: 1 },
    { entity_type: 'Note', count: 1 },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TriggerDashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  list.mockReset().mockResolvedValue([...triggers, triggers[0]]) // duplicate from two scopes
  stats.mockReset().mockResolvedValue(triggerStats)
  enable.mockReset().mockResolvedValue({ ok: true })
  disable.mockReset().mockResolvedValue({ ok: true })
  remove.mockReset().mockResolvedValue({ ok: true })
  getProtocol.mockReset().mockImplementation((id: string) =>
    id === 'proto-1' ? Promise.resolve({ id, name: 'Code review', created_at: '' }) : Promise.reject(new Error('gone')),
  )
  toast.success.mockReset()
  toast.error.mockReset()
})

describe('TriggerDashboardPage', () => {
  it('renders deduplicated rows with state, patterns, cooldown, conditions, scope and protocol link', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Review on task completion')).toBeTruthy())
    expect(screen.getAllByText('Review on task completion')).toHaveLength(1)
    expect(screen.getByText('Task')).toBeTruthy()
    expect(screen.getByText('StatusChanged')).toBeTruthy()
    expect(screen.getByText('30s cooldown')).toBeTruthy()
    expect(screen.getByText('2 conditions')).toBeTruthy()
    expect(screen.getByText('scope proj-a')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Code review')).toBeTruthy())
    expect(screen.getByRole('link', { name: /starts code review/i }).getAttribute('href')).toBe('/workspace/ws/protocols/proto-1')
    // protocol that could not be loaded → short id
    expect(screen.getByText(/protocol proto-2/)).toBeTruthy()
    // groups + summary
    expect(screen.getByRole('heading', { name: /enabled\s*1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /disabled\s*1/i })).toBeTruthy()
    expect(screen.getByText('1 enabled')).toBeTruthy()
    expect(screen.getByText('2 entity types')).toBeTruthy()
  })

  it('toggles a trigger from its ⋯ menu', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Review on task completion')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Review on task completion' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /disable/i }))
    await waitFor(() => expect(disable).toHaveBeenCalledWith('tr-1'))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(screen.getByText('0 enabled')).toBeTruthy()
  })

  it('deletes a trigger after confirmation', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Review on task completion')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Review on task completion' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('tr-1'))
    await waitFor(() => expect(screen.queryByText('Review on task completion')).toBeNull())
  })

  it('search narrows the list and offers to clear on no match', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Archive stale notes')).toBeTruthy())
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing here' } })
    expect(screen.getByText('No matching triggers')).toBeTruthy()
  })

  it('shows the pristine empty state', async () => {
    list.mockResolvedValue([])
    stats.mockResolvedValue({ total: 0, enabled: 0, disabled: 0, by_entity_type: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText('No triggers yet')).toBeTruthy())
  })
})
