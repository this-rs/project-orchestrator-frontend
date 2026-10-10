/**
 * Where choosing an item leads. Pure, so the rule is tested without a router.
 *
 * - a call or a permission that has a block in the transcript → scroll to it;
 * - a plan, a task, a step → its page (a step belongs to its task);
 * - a detached run → its own conversation;
 * - anything else (a request, a routing decision, a marker, an error) → the
 *   timeline page on that item, where its chain and detail are.
 *
 * `blockInPage` says whether the transcript block is actually loaded: the
 * transcript is paged, so an old call may have an anchor and no block. Then the
 * page is the answer, instead of a click that does nothing.
 *
 * `fallback: 'conversation'` (the timeline page itself): what has no block in
 * the page opens the conversation it happened in instead of the timeline page.
 */
import type { TimelineItem } from './model'

export type TimelineTarget =
  | { type: 'scroll'; anchorId: string }
  | { type: 'navigate'; to: string }

export function resolveTarget(
  item: TimelineItem,
  ctx: { workspaceSlug: string; sessionId: string; blockInPage: (anchorId: string) => boolean; byId?: ReadonlyMap<string, TimelineItem>; fallback?: 'timeline' | 'conversation' },
): TimelineTarget {
  const base = `/workspace/${ctx.workspaceSlug}`
  if (item.anchorId && ctx.blockInPage(item.anchorId)) return { type: 'scroll', anchorId: item.anchorId }
  if (item.kind === 'plan') return { type: 'navigate', to: `${base}/plans/${item.id}` }
  if (item.kind === 'task') return { type: 'navigate', to: `${base}/tasks/${item.id}` }
  if (item.kind === 'step' && item.parentId) return { type: 'navigate', to: `${base}/tasks/${item.parentId}` }
  if (item.kind === 'run' && item.sessionId) return { type: 'navigate', to: `${base}/chat/${item.sessionId}` }
  if (ctx.fallback === 'conversation') return { type: 'navigate', to: `${base}/chat/${item.laneId || ctx.sessionId}` }
  return { type: 'navigate', to: `${base}/chat/${ctx.sessionId}/timeline?item=${encodeURIComponent(item.id)}` }
}
