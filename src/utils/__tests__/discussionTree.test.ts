import { describe, it, expect, vi } from 'vitest'
import type { DiscussionNode } from '@/services/discussions'
import type { InterruptOutcome } from '@/types/chat'
import { modelBreakdown, stopSubtree, subtreeCost, treeLimits } from '../discussionTree'

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

/** claude (reported $1) -> deepseek (priced $0.5) + local (free) + mystery (unknown). */
const tree = () =>
  n('root', { cost_usd: 1, cost_basis: 'reported', model: 'opus', input_tokens: 1000, output_tokens: 200 }, [
    n('a', { provider_id: 'deepseek', model: 'deepseek-chat', cost_usd: 0.5, cost_basis: 'priced', input_tokens: 2000 }),
    n('b', { provider_id: 'local-llama', model: 'qwen3', cost_usd: null, cost_basis: 'free' }),
    n('c', { provider_id: 'mystery', model: 'm1', cost_usd: null, cost_basis: 'unknown' }),
  ])

describe('subtreeCost', () => {
  it('prefers the server figure', () => {
    expect(subtreeCost(n('x', { subtree_cost_usd: 3.5 }, [n('y')]))).toEqual({ text: '$3.50', partial: false })
  })

  it('adds the known costs locally and marks the total as a floor when one is unknown', () => {
    expect(subtreeCost(tree())).toEqual({ text: '≥ $1.50', partial: true })
  })

  it('is exact when everything is known, and says "local" for a free-only tree', () => {
    expect(subtreeCost(n('r', { cost_usd: 1, cost_basis: 'reported' }, [n('k', { cost_usd: 2, cost_basis: 'reported' })])).text).toBe('$3.00')
    expect(subtreeCost(n('r', { cost_basis: 'free' }, [n('k', { cost_basis: 'free' })])).text).toBe('local')
  })

  it('has no figure at all when no node has one — never $0', () => {
    expect(subtreeCost(n('r', {}, [n('k')])).text).toBeNull()
    expect(subtreeCost(n('r', { cost_basis: 'free' }, [n('k', { cost_basis: 'unknown' })])).text).toBeNull()
  })
})

describe('modelBreakdown', () => {
  it('groups by provider and model; a node without provider is Claude Code', () => {
    const rows = modelBreakdown(tree())
    expect(rows.map((r) => `${r.provider}/${r.model}`)).toEqual(['claude-code/opus', 'deepseek/deepseek-chat', 'local-llama/qwen3', 'mystery/m1'])
    const ds = rows.find((r) => r.provider === 'deepseek')!
    expect(ds.cost.usd).toBe(0.5)
    expect(ds.inputTokens).toBe(2000)
    expect(ds.outputTokens).toBeUndefined()
    expect(rows.find((r) => r.provider === 'local-llama')!.costText).toBe('local')
    expect(rows.find((r) => r.provider === 'mystery')!.cost.unknown).toBe(1)
  })
})

describe('treeLimits', () => {
  it('is null when the server states no limit', () => {
    expect(treeLimits(tree())).toBeNull()
  })
  it('reports depth, running children and limits when stated', () => {
    const t = tree()
    t.max_depth = 3
    t.max_children = 4
    t.children[0].status = 'streaming'
    expect(treeLimits(t)).toEqual({ depth: 1, maxDepth: 3, live: 1, maxChildren: 4 })
  })
})

describe('stopSubtree', () => {
  const live = () => {
    const t = tree()
    t.status = 'streaming'
    t.children[0].status = 'streaming'
    t.children[0].children = [n('a1', { status: 'streaming' })]
    return t
  }
  const outcome = (extra: Partial<InterruptOutcome> = {}): InterruptOutcome => ({ delivered: true, routed: 'local', cli_pid: null, killed_pids: [], ...extra })

  it('lets the server cascade when it knows how', async () => {
    const interrupt = vi.fn().mockResolvedValue(outcome({ cascade: { stopped: 3, total: 3 } }))
    expect(await stopSubtree(live(), interrupt)).toEqual({ stopped: 3, total: 3, mode: 'server' })
    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(interrupt).toHaveBeenCalledWith('root', { cascade: true })
  })

  it('falls back to one call per live descendant, leaves first, when the server does not report a cascade', async () => {
    const interrupt = vi.fn().mockResolvedValue(outcome())
    const result = await stopSubtree(live(), interrupt)
    expect(result).toEqual({ stopped: 3, total: 3, mode: 'client' })
    expect(interrupt.mock.calls.map((c) => c[0])).toEqual(['root', 'a1', 'a'])
  })

  it('falls back too when the server refuses the field, root last, and counts what failed', async () => {
    const interrupt = vi.fn(async (id: string, options?: { cascade?: boolean }) => {
      if (options?.cascade) throw new Error('422 unknown field')
      if (id === 'a') throw new Error('gone')
      return outcome()
    })
    const result = await stopSubtree(live(), interrupt)
    expect(result).toEqual({ stopped: 2, total: 3, mode: 'client' })
    expect(interrupt.mock.calls.map((c) => c[0])).toEqual(['root', 'a1', 'a', 'root'])
  })

  it('does nothing when nothing is running', async () => {
    const interrupt = vi.fn()
    expect(await stopSubtree(tree(), interrupt)).toEqual({ stopped: 0, total: 0, mode: 'none' })
    expect(interrupt).not.toHaveBeenCalled()
  })
})
