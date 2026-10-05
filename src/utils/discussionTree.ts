// ============================================================================
// DISCUSSION TREE — what a multi-provider tree adds up to, and how to stop it
// ============================================================================
//
// A tree of conversations can run on several providers at once, some priced,
// some free, some of unknown cost. Totals are floors, never invented figures,
// and stopping a subtree must work against a server that cannot cascade.

import type { DiscussionNode } from '@/services/discussions'
import type { InterruptOutcome } from '@/types/chat'
import { CLAUDE_CODE_PROVIDER_ID } from '@/types/provider'
import { COST_FREE_TEXT, COST_SUBSCRIPTION_TEXT, costReport, formatCostSum, formatUsd2, sumCosts, type CostSum } from './cost'

/** The node and every descendant, depth-first. */
export function flattenSubtree(node: DiscussionNode): DiscussionNode[] {
  const out: DiscussionNode[] = []
  const walk = (n: DiscussionNode) => {
    out.push(n)
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return out
}

export function hasLiveNode(node: DiscussionNode): boolean {
  return flattenSubtree(node).some((n) => n.status === 'streaming')
}

export interface SubtreeCostText {
  /** `$1.20`, `≥ $1.20`, or `null` when nothing in the subtree has a figure. */
  text: string | null
  /** The total is a floor: some part of the subtree has no known cost. */
  partial: boolean
}

/**
 * Cost of a node plus its descendants. The server's own `subtree_cost_usd`
 * wins; without it the known figures are added up and the result is marked
 * as a floor ("≥") when any descendant has none.
 */
export function subtreeCost(node: DiscussionNode): SubtreeCostText {
  if (node.subtree_cost_usd != null) return { text: formatUsd2(node.subtree_cost_usd), partial: false }
  return describeNodesCost(flattenSubtree(node))
}

/**
 * Cost of a set of nodes, without pretending:
 * - some real figures → their sum, "≥" when other nodes have none;
 * - no figure, and every node is free / on a plan → "local" / "subscription";
 * - no figure otherwise → `null` (unknown). A free node never adds up to "$0.00".
 */
export function describeNodesCost(nodes: DiscussionNode[]): SubtreeCostText {
  const reports = nodes.map((n) => costReport(n.cost_usd, n.cost_basis))
  const figures = reports.filter((r) => r && r.usd != null && (r.basis === 'reported' || r.basis === 'priced'))
  const sum = sumCosts(reports)
  if (figures.length > 0) return { text: formatCostSum({ ...sum, known: figures.length }), partial: sum.unknown > 0 }
  if (sum.unknown === 0 && sum.known > 0) {
    const bases = new Set(reports.map((r) => r?.basis))
    return { text: bases.size === 1 && bases.has('subscription') ? COST_SUBSCRIPTION_TEXT : bases.size === 1 ? COST_FREE_TEXT : 'no charge', partial: false }
  }
  return { text: null, partial: false }
}

export interface ModelBreakdownRow {
  provider: string
  /** `null` when the sessions of this provider named no model. */
  model: string | null
  sessions: number
  cost: CostSum
  /** Cost of the row in words: a sum (or a floor), "local", "subscription", or `null` when unknown. */
  costText: string | null
  /** `undefined` = no session of the row reported it. */
  inputTokens?: number
  outputTokens?: number
}

/** Cost and tokens of a subtree, one row per (provider, model). */
export function modelBreakdown(root: DiscussionNode): ModelBreakdownRow[] {
  const groups = new Map<string, DiscussionNode[]>()
  for (const n of flattenSubtree(root)) {
    const key = `${n.provider_id || CLAUDE_CODE_PROVIDER_ID}\u0000${n.model || ''}`
    const list = groups.get(key)
    if (list) list.push(n)
    else groups.set(key, [n])
  }
  const rows: ModelBreakdownRow[] = []
  for (const [key, nodes] of groups) {
    const [provider, model] = key.split('\u0000')
    const row: ModelBreakdownRow = {
      provider,
      model: model || null,
      sessions: nodes.length,
      cost: sumCosts(nodes.map((n) => costReport(n.cost_usd, n.cost_basis))),
      costText: describeNodesCost(nodes).text,
    }
    for (const n of nodes) {
      if (typeof n.input_tokens === 'number') row.inputTokens = (row.inputTokens ?? 0) + n.input_tokens
      if (typeof n.output_tokens === 'number') row.outputTokens = (row.outputTokens ?? 0) + n.output_tokens
    }
    rows.push(row)
  }
  return rows.sort((a, b) => b.cost.usd - a.cost.usd || a.provider.localeCompare(b.provider))
}

/** Limits and usage of the tree, from whatever the server sent (nothing sent = `null`). */
export function treeLimits(root: DiscussionNode): { depth: number; maxDepth: number | null; live: number; maxChildren: number | null } | null {
  const nodes = flattenSubtree(root)
  const maxDepth = nodes.find((n) => n.max_depth != null)?.max_depth ?? null
  const maxChildren = nodes.find((n) => n.max_children != null)?.max_children ?? null
  if (maxDepth === null && maxChildren === null) return null
  const depthOf = (n: DiscussionNode): number => 1 + Math.max(-1, ...(n.children ?? []).map(depthOf))
  const live = (root.children ?? []).filter((c) => c.status === 'streaming').length
  return { depth: depthOf(root), maxDepth, live, maxChildren }
}

export interface StopSubtreeResult {
  stopped: number
  /** Sessions that were live when asked. */
  total: number
  /** Who did the work: the server (`cascade`) or one call per session from here. */
  mode: 'server' | 'client' | 'none'
}

export type InterruptFn = (sessionId: string, options?: { cascade?: boolean }) => Promise<InterruptOutcome>

/**
 * Stop a session and everything below it.
 *
 * The server is asked to cascade first. A server that does not know `cascade`
 * answers without a `cascade` report (it interrupted the session only) or
 * refuses the field: either way the live descendants are interrupted from here,
 * leaves first so a parent never respawns what was just stopped.
 */
export async function stopSubtree(root: DiscussionNode, interrupt: InterruptFn): Promise<StopSubtreeResult> {
  const live: Array<{ node: DiscussionNode; depth: number }> = []
  const walk = (n: DiscussionNode, depth: number) => {
    if (n.status === 'streaming') live.push({ node: n, depth })
    for (const c of n.children ?? []) walk(c, depth + 1)
  }
  walk(root, 0)
  const total = live.length
  if (total === 0) return { stopped: 0, total: 0, mode: 'none' }

  let rootStopped = false
  try {
    const outcome = await interrupt(root.session_id, { cascade: true })
    if (outcome.cascade) return { stopped: outcome.cascade.stopped, total: outcome.cascade.total, mode: 'server' }
    rootStopped = outcome.delivered
  } catch {
    // Refused (unknown field) or unreachable: fall through to the client path.
  }

  let stopped = rootStopped && root.status === 'streaming' ? 1 : 0
  const rest = live
    .filter(({ node }) => node.session_id !== root.session_id || !rootStopped)
    .sort((a, b) => b.depth - a.depth)
  for (const { node } of rest) {
    try {
      const outcome = await interrupt(node.session_id)
      if (outcome.delivered) stopped++
    } catch {
      // Counted as not stopped: the report says "n of m".
    }
  }
  return { stopped, total, mode: 'client' }
}
