/**
 * A tree on three providers (FC9): a badge per node, the subtree cost with its
 * unknown part, the breakdown table, and "Stop subtree" with its confirmation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { providersAtom, providersLoadStateAtom } from '@/atoms'
import type { DiscussionNode } from '@/services/discussions'
import type { ProvidersResponse } from '@/types/provider'

const interruptSession = vi.fn()
vi.mock('@/services/chat', () => ({
  chatApi: { interruptSession: (...a: unknown[]) => interruptSession(...a) },
}))
vi.mock('../InlineConversationPanel', () => ({ InlineConversationPanel: () => <div /> }))

import { DiscussionForestView } from '../DiscussionTreeView'

const n = (id: string, extra: Partial<DiscussionNode> = {}, children: DiscussionNode[] = []): DiscussionNode => ({
  session_id: id,
  title: id,
  status: 'idle',
  cost_usd: null,
  duration_secs: 0,
  message_count: 0,
  children,
  metadata: { type: 'conversation' },
  ...extra,
})

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', health: { status: 'healthy' }, models: [] },
    { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', health: { status: 'healthy' }, models: [] },
    { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama', health: { status: 'healthy' }, models: [] },
  ],
  default: { provider: 'claude-code', routed_by: 'default' },
}

const threeProviders = () =>
  n('root', { cost_usd: 1, cost_basis: 'reported', model: 'claude-opus-4' }, [
    n('ds', { provider_id: 'deepseek', model: 'deepseek-chat', cost_usd: 0.5, cost_basis: 'priced', input_tokens: 2000, output_tokens: 500 }),
    n('loc', { provider_id: 'local-llama', model: 'qwen3', cost_basis: 'free' }),
    n('mystery', { provider_id: 'local-llama', model: 'qwen3', cost_usd: null, cost_basis: 'unknown' }),
  ])

function mount(root: DiscussionNode, onRefresh = vi.fn()) {
  const store = createStore()
  store.set(providersAtom, PROVIDERS)
  store.set(providersLoadStateAtom, 'ready')
  render(
    <Provider store={store}>
      <DiscussionForestView roots={[root]} onRefresh={onRefresh} />
    </Provider>,
  )
  return onRefresh
}

beforeEach(() => interruptSession.mockReset())

describe('multi-provider tree', () => {
  it('puts a provider badge on each node; a node without provider is Claude Code', () => {
    mount(threeProviders())
    const badges = screen.getAllByTestId('provider-badge').map((b) => b.textContent)
    expect(badges).toContain('Claude Code· opus-4')
    expect(badges).toContain('DeepSeek· deepseek-chat')
    expect(badges.filter((b) => b?.startsWith('Local llama'))).toHaveLength(2)
  })

  it('shows the subtree cost as a floor ("≥") because one descendant has no known cost', () => {
    mount(threeProviders())
    expect(screen.getByTestId('subtree-total').textContent).toBe('≥ $1.50')
    expect(screen.getByTestId('node-subtree-cost').textContent).toBe('Σ ≥ $1.50')
  })

  it('breaks the cost down by provider and model in an accessible table', () => {
    mount(threeProviders())
    const table = screen.getByRole('table', { name: 'Cost and tokens by provider and model' })
    const rows = within(table).getAllByRole('row').slice(1)
    const text = rows.map((r) => r.textContent)
    expect(text.some((t) => t!.includes('DeepSeek / deepseek-chat') && t!.includes('$0.50') && t!.includes('2k in · 500 out'))).toBe(true)
    // free + unknown on the same model: not "$0.00".
    const local = rows.find((r) => r.textContent!.includes('qwen3'))!
    expect(local.textContent).toContain('unknown')
    expect(local.textContent).not.toContain('$0')
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Provider / model', 'Sessions', 'Cost', 'Tokens'])
  })

  it('shows depth and children limits only when the server sends them', () => {
    const { unmount } = render(<div />)
    unmount()
    mount(threeProviders())
    expect(screen.queryByTestId('subtree-limits')).toBeNull()
  })

  it('shows the limits when sent', () => {
    const root = threeProviders()
    root.max_depth = 3
    root.max_children = 4
    mount(root)
    expect(screen.getByTestId('subtree-limits').textContent).toBe('Depth 1 of 3 · 0 of 4 children running')
  })
})

describe('Stop subtree', () => {
  const running = () => {
    const root = threeProviders()
    root.status = 'streaming'
    root.children[0].status = 'streaming'
    return root
  }

  it('asks before stopping more than one session, then reports "stopped n of m" (server cascade)', async () => {
    interruptSession.mockResolvedValue({ delivered: true, routed: 'local', cli_pid: null, killed_pids: [], cascade: { stopped: 2, total: 2 } })
    const onRefresh = mount(running())
    fireEvent.click(screen.getAllByRole('button', { name: /^Stop subtree: root/ })[0])
    expect(interruptSession).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Confirm stopping the subtree' }).textContent).toContain('Stop 2 running sessions?')
    fireEvent.click(screen.getByRole('button', { name: 'Stop all' }))
    await waitFor(() => expect(screen.getAllByRole('status').some((s) => s.textContent === 'Stopped 2 of 2')).toBe(true))
    expect(interruptSession).toHaveBeenCalledTimes(1)
    expect(interruptSession).toHaveBeenCalledWith('root', 'turn_and_tools', { cascade: true })
    expect(onRefresh).toHaveBeenCalled()
  })

  it('falls back to one interrupt per running session when the server does not cascade', async () => {
    interruptSession.mockResolvedValue({ delivered: true, routed: 'local', cli_pid: null, killed_pids: [] })
    mount(running())
    fireEvent.click(screen.getAllByRole('button', { name: /^Stop subtree: root/ })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Stop all' }))
    await waitFor(() => expect(screen.getAllByRole('status').some((s) => s.textContent === 'Stopped 2 of 2')).toBe(true))
    expect(interruptSession.mock.calls.map((c) => c[0])).toEqual(['root', 'ds'])
  })

  it('stops a single running session without asking', async () => {
    interruptSession.mockResolvedValue({ delivered: true, routed: 'local', cli_pid: null, killed_pids: [], cascade: { stopped: 1, total: 1 } })
    const root = threeProviders()
    root.children[0].status = 'streaming'
    mount(root)
    fireEvent.click(screen.getByRole('button', { name: /^Stop: ds/ }))
    await waitFor(() => expect(interruptSession).toHaveBeenCalled())
    expect(screen.queryByRole('group', { name: 'Confirm stopping the subtree' })).toBeNull()
  })

  it('offers no stop when nothing runs', () => {
    mount(threeProviders())
    expect(screen.queryByRole('button', { name: /^Stop/ })).toBeNull()
  })
})
