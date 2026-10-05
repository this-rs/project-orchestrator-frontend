/**
 * The provider badge of a conversation row, on three sessions: one created
 * before providers existed, one on a native instance, one whose instance was
 * deleted since.
 *
 * Run with: npx vitest run src/components/chat/SessionList.providerBadge.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ChatSession } from '@/types'
import type { ProviderInstance } from '@/types/provider'

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

import { PROVIDER_BADGE_UNAVAILABLE_HELP, describeSessionProvider, shouldShowProviderBadge } from '@/constants/providers'
import { SessionRow } from './SessionList'
import { ProviderBadge } from './ProviderBadge'

const instance = (id: string, kind: string, label: string): ProviderInstance => ({
  id,
  kind,
  label,
  health: { status: 'healthy' },
  models: [],
})

const CLAUDE = instance('claude-code', 'claude_code', 'Claude Code')
const LLAMA = instance('local-llama', 'openai_compatible', 'Local llama-server')

const session = (partial: Partial<ChatSession> & { id: string }): ChatSession => ({
  cwd: '/repo',
  model: 'claude-opus-4-5-20251101',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T11:00:00Z',
  message_count: 3,
  title: partial.id,
  ...partial,
})

const LEGACY = session({ id: 'legacy' })
const NATIVE = session({ id: 'native', provider_id: 'local-llama', provider_kind: 'openai_compatible', model: 'qwen2.5-coder-32b' })
const DELETED = session({ id: 'deleted', provider_id: 'old-deepseek', provider_kind: 'openai_compatible', model: 'deepseek-chat' })

const noop = () => {}

function renderRows(providers: readonly ProviderInstance[] | null) {
  render(
    <ul>
      {[LEGACY, NATIVE, DELETED].map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          isActive={false}
          status={null}
          isEditing={false}
          isMenuOpen={false}
          isConfirmingDelete={false}
          wsSlug="ws"
          providers={providers}
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
      ))}
    </ul>,
  )
  const row = (id: string) => screen.getByRole('button', { name: id })
  const badge = (id: string) => within(row(id)).queryByTestId('provider-badge')
  return { badge }
}

describe('SessionRow — provider badge', () => {
  it('several instances: the old session is Claude Code, the native one carries its label, the deleted one is unavailable', () => {
    const { badge } = renderRows([CLAUDE, LLAMA])

    expect(badge('legacy')?.textContent).toBe('Claude Code')
    expect(badge('legacy')?.getAttribute('data-unavailable')).toBeNull()

    expect(badge('native')?.textContent).toBe('Local llama-server')
    expect(badge('native')?.getAttribute('data-unavailable')).toBeNull()

    const gone = badge('deleted')!
    expect(gone.getAttribute('data-unavailable')).toBe('true')
    expect(gone.textContent).toContain('unavailable')
    // The consequence is tied to the badge, not left to a tooltip.
    const help = document.getElementById(gone.getAttribute('aria-describedby')!)
    expect(help?.textContent).toBe(PROVIDER_BADGE_UNAVAILABLE_HELP)
  })

  it('a single instance: an all-Claude list stays as light as before, only non-Claude rows get a badge', () => {
    const { badge } = renderRows([CLAUDE])
    expect(badge('legacy')).toBeNull()
    expect(badge('native')).not.toBeNull()
    expect(badge('deleted')?.getAttribute('data-unavailable')).toBe('true')
  })

  it('list not loaded (or a backend without providers): no instance is ever declared missing', () => {
    const { badge } = renderRows(null)
    expect(badge('legacy')).toBeNull()
    // Named by its kind, since no label is known.
    expect(badge('native')?.textContent).toBe('OpenAI-compatible')
    expect(badge('deleted')?.getAttribute('data-unavailable')).toBeNull()
  })
})

describe('describeSessionProvider / ProviderBadge', () => {
  it('a session without provider is Claude Code and never unavailable', () => {
    expect(describeSessionProvider(null, [LLAMA])).toEqual({ label: 'Claude Code', isClaudeCode: true, unavailable: false })
    expect(describeSessionProvider({ id: null }, [])).toEqual({ label: 'Claude Code', isClaudeCode: true, unavailable: false })
  })

  it('the built-in instance is never declared missing, even absent from the list', () => {
    expect(describeSessionProvider({ id: 'claude-code' }, [LLAMA]).unavailable).toBe(false)
  })

  it('the badge is shown when there is more than one instance or the session is not Claude Code', () => {
    const claude = describeSessionProvider(null, [CLAUDE])
    expect(shouldShowProviderBadge(claude, [CLAUDE])).toBe(false)
    expect(shouldShowProviderBadge(claude, [CLAUDE, LLAMA])).toBe(true)
    expect(shouldShowProviderBadge(describeSessionProvider({ id: 'local-llama' }, null), null)).toBe(true)
  })

  it('shows the short model next to the label when asked', () => {
    render(<ProviderBadge description={describeSessionProvider(null, null)} model="claude-opus-4-5-20251101" />)
    expect(screen.getByTestId('provider-badge').textContent).toBe('Claude Code· opus-4-5')
  })
})
