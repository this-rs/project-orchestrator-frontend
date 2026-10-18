/**
 * A session that runs in the server's neutral folder (`execution_place: neutral`, plan « Chat sans
 * dépendance au cwd », T1-bis) is never shown as a project folder: the conversation list and the
 * linked-session rows say "Neutral place" instead of the path the server made.
 *
 * Run with: npx vitest run src/components/chat/SessionList.neutralPlace.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ChatSession, SessionWithLinks } from '@/types'

vi.hoisted(() => {
  // jsdom has no CSS.supports — Select probes it at module load.
  const g = globalThis as { CSS?: { supports?: unknown } }
  g.CSS = { ...(g.CSS ?? {}), supports: () => false }
})

vi.mock('@/services', () => ({
  chatApi: {},
  workspacesApi: {},
  getEventBus: () => ({ on: () => () => {} }),
}))
vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'ws',
  useActiveRunTracker: () => new Map(),
  useDetachedRuns: () => ({ runs: [], isLoading: false, hasActiveRuns: false, refresh: () => {} }),
}))

import { SessionRow } from './SessionList'
import { SessionRow as LinkedSessionRow } from '@/components/tasks/DetailRows'

const NEUTRAL_DIR = '/Users/me/Library/Application Support/project-orchestrator/chat-neutral/4f1c0b8e-0000-4000-8000-000000000001'

const session = (partial: Partial<ChatSession> & { id: string }): ChatSession => ({
  cwd: '/repo/app',
  model: 'claude-haiku-5-5',
  created_at: '2026-10-18T10:00:00Z',
  updated_at: '2026-10-18T11:00:00Z',
  message_count: 2,
  title: partial.id,
  ...partial,
})

const NEUTRAL = session({ id: 'neutral', cwd: NEUTRAL_DIR, execution_place: 'neutral' })
const PROJECT = session({ id: 'project' })
const noop = () => {}

function renderRow(s: ChatSession) {
  render(
    <ul>
      <SessionRow
        session={s}
        isActive={false}
        status={null}
        isEditing={false}
        isMenuOpen={false}
        isConfirmingDelete={false}
        wsSlug="ws"
        providers={null}
        onSelect={noop}
        onClose={noop}
        onStartRename={noop}
        onCommitRename={noop}
        onCancelRename={noop}
        onOpenMenu={noop}
        onCloseMenu={noop}
        onRequestDelete={noop}
        onDelete={noop}
      />
    </ul>,
  )
  return screen.getByRole('button', { name: s.id })
}

const linked = (s: ChatSession): SessionWithLinks =>
  ({ session: s, links: { linked_plans: [], linked_tasks: [], linked_rfcs: [] }, source: 'chat' }) as unknown as SessionWithLinks

describe('neutral place — conversation list', () => {
  it('a neutral session shows "Neutral place", never the folder the server made', () => {
    const row = renderRow(NEUTRAL)
    const place = within(row).getByTestId('neutral-place')
    expect(place.textContent).toContain('Neutral place')
    expect(place.getAttribute('title')).toMatch(/empty folder made by the server/)
    expect(row.textContent).not.toContain('chat-neutral')
  })

  it('a project session (execution_place absent) still shows its folder', () => {
    const row = renderRow(PROJECT)
    expect(within(row).queryByTestId('neutral-place')).toBeNull()
    expect(row.textContent).toContain('app')
  })
})

describe('neutral place — linked session rows', () => {
  it('a neutral session says so; a project one keeps its path', () => {
    render(
      <MemoryRouter>
        <LinkedSessionRow item={linked(NEUTRAL)} onOpen={noop} />
        <LinkedSessionRow item={linked(PROJECT)} onOpen={noop} />
      </MemoryRouter>,
    )
    expect(screen.getAllByTestId('neutral-place')).toHaveLength(1)
    expect(document.body.textContent).not.toContain('chat-neutral')
    expect(screen.getByTitle('/repo/app')).toBeTruthy()
  })
})
