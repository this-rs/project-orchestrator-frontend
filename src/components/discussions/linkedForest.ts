/**
 * linkedForest — merges the sessions linked to ONE entity (plan, task or run) into
 * a single forest of discussion nodes.
 *
 * The entity routes (`/plans/{id}/sessions`, `/tasks/{id}/sessions`,
 * `/chat/runs/{id}/sessions`) return FLAT lists with no parent. The session tree
 * route (`/chat/sessions/{id}/tree`) gives the descendants of ONE session. We take
 * the union: every listed session is a node; its subtree is hung under it; a
 * session whose parent is not in the set (typically: attached by hand, parent
 * elsewhere) is a ROOT. Nothing listed is ever dropped.
 */

import type { DiscussionNode } from '@/services/discussions'
import type { SessionTreeNode } from '@/types/chat'

export interface LinkedSession {
  id: string
  title?: string | null
  streaming?: boolean
  costUsd?: number | null
  messageCount?: number | null
  createdAt?: string | null
  /** 'runner' | 'manual' | 'transitive' (plan/task routes only) */
  source?: string
  /** One useful line (linked tasks, preview) */
  detail?: string
}

export interface LinkedForest {
  roots: DiscussionNode[]
  /** Distinct sessions in the forest (listed + discovered children) */
  total: number
}

interface Draft {
  id: string
  parent: string | null
  spawn: string | null
  runId: string | null
  taskId: string | null
  title: string | null
  costUsd: number | null
  streaming: boolean
  order: number
}

export function buildLinkedForest(
  linked: LinkedSession[],
  trees: ReadonlyMap<string, SessionTreeNode[]>,
  /** Task the listed sessions belong to (task page): a listed session the tree does not tie to a task gets it. */
  defaultTaskId?: string,
): LinkedForest {
  const drafts = new Map<string, Draft>()
  let order = 0
  const listed = new Map(linked.map((l) => [l.id, l]))

  // Listed sessions first: they exist whatever the tree route says.
  for (const l of linked) {
    if (!drafts.has(l.id)) drafts.set(l.id, { id: l.id, parent: null, spawn: null, runId: null, taskId: null, title: null, costUsd: null, streaming: false, order: order++ })
  }
  // Then what the tree routes know (parent, spawn type, run, task).
  for (const l of linked) {
    for (const f of trees.get(l.id) ?? []) {
      const known = drafts.get(f.session_id)
      if (known) {
        // A tree row is richer than a bare listed one: take its facts, keep the first order.
        if (f.parent_session_id && f.session_id !== f.parent_session_id) known.parent = known.parent ?? f.parent_session_id
        known.spawn = known.spawn ?? f.spawn_type ?? null
        known.runId = known.runId ?? f.run_id ?? null
        known.taskId = known.taskId ?? f.task_id ?? null
        known.title = known.title ?? f.title ?? null
        known.costUsd = known.costUsd ?? f.total_cost_usd ?? null
        known.streaming = known.streaming || f.is_streaming
      } else {
        drafts.set(f.session_id, {
          id: f.session_id,
          parent: f.parent_session_id ?? null,
          spawn: f.spawn_type ?? null,
          runId: f.run_id ?? null,
          taskId: f.task_id ?? null,
          title: f.title ?? null,
          costUsd: f.total_cost_usd ?? null,
          streaming: f.is_streaming,
          order: order++,
        })
      }
    }
  }

  if (defaultTaskId) for (const l of linked) {
    const d = drafts.get(l.id)!
    d.taskId = d.taskId ?? defaultTaskId
  }

  // A parent link that would close a loop is ignored (the node becomes a root).
  const reachesSelf = (id: string): boolean => {
    const seen = new Set<string>([id])
    let cur = drafts.get(id)?.parent ?? null
    while (cur && drafts.has(cur)) {
      if (seen.has(cur)) return true
      seen.add(cur)
      cur = drafts.get(cur)!.parent
    }
    return false
  }
  for (const d of drafts.values()) if (d.parent && reachesSelf(d.id)) d.parent = null

  const nodes = new Map<string, DiscussionNode>()
  for (const d of [...drafts.values()].sort((a, b) => a.order - b.order)) {
    const l = listed.get(d.id)
    nodes.set(d.id, {
      session_id: d.id,
      title: l?.title || d.title || `Session ${d.id.slice(0, 8)}`,
      status: l?.streaming || d.streaming ? 'streaming' : 'idle',
      cost_usd: l?.costUsd ?? d.costUsd ?? 0,
      duration_secs: 0,
      message_count: l?.messageCount ?? 0,
      children: [],
      metadata: {
        type: d.spawn ?? (d.parent && drafts.has(d.parent) ? 'conversation' : 'root'),
        run_id: d.runId ?? undefined,
        task_id: d.taskId ?? undefined,
        source: l?.source,
        linked: Boolean(l),
        detail: l?.detail,
      },
    })
  }

  const roots: DiscussionNode[] = []
  for (const d of [...drafts.values()].sort((a, b) => a.order - b.order)) {
    const node = nodes.get(d.id)!
    const parent = d.parent ? nodes.get(d.parent) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return { roots, total: nodes.size }
}

export function countNodes(roots: DiscussionNode[]): number {
  return roots.reduce((n, r) => n + 1 + countNodes(r.children ?? []), 0)
}
