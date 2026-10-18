/**
 * What the timeline needs besides the messages: how the session was opened
 * (provider, model, the rule that chose them), the routing decisions recorded
 * for it, and the plan → task → step it serves.
 *
 * Every piece is best effort — a server without routing routes, a task that
 * was deleted, a session without links — and an absent one leaves its part of
 * the timeline out instead of failing the whole strip.
 */
import { useEffect, useState } from 'react'
import { chatApi, tasksApi, plansApi } from '@/services'
import { routingApi } from '@/services/routing'
import type { RoutingDecision } from '@/types/routing'
import type { TimelineLaneContext, TimelineWork } from '@/components/timeline'

export interface TimelineContextData {
  session?: TimelineLaneContext
  title?: string
  decisions: RoutingDecision[]
  work: TimelineWork
}

const EMPTY: TimelineContextData = { decisions: [], work: { plans: [], tasks: [] } }

export interface TimelineContextOptions {
  /** Read the routing decisions (default). The work bar of the composer only needs the work graph. */
  decisions?: boolean
}

/**
 * Every call goes through a promise: a service a test mocks without this method rejects
 * (and falls back to the empty value) instead of throwing synchronously out of the effect.
 */
const attempt = <T,>(call: () => Promise<T>, fallback: T): Promise<T> => Promise.resolve().then(call).catch(() => fallback)

export function useTimelineContext(sessionId: string | null, refreshKey?: unknown, options?: TimelineContextOptions): TimelineContextData {
  const withDecisions = options?.decisions ?? true
  const [data, setData] = useState<TimelineContextData>(EMPTY)

  useEffect(() => {
    if (!sessionId) {
      setData(EMPTY)
      return
    }
    let cancelled = false
    ;(async () => {
      const session = await attempt(() => chatApi.getSession(sessionId), null)
      if (cancelled || !session) return
      const [decisions, tasks, plans] = await Promise.all([
        withDecisions
          ? attempt(() => routingApi.decisions({ project_slug: session.project_slug, limit: 200 }), [] as RoutingDecision[])
          : Promise.resolve([] as RoutingDecision[]),
        Promise.all((session.linked_tasks ?? []).map(async (t) => {
          const [detail, steps] = await Promise.all([
            attempt(() => tasksApi.get(t.id), null),
            attempt(() => tasksApi.listSteps(t.id), []),
          ])
          const task = detail as { status?: string; created_at?: string; plan_id?: string } | null
          return { id: t.id, title: t.title, status: task?.status ?? 'pending', planId: task?.plan_id, createdAt: task?.created_at, steps }
        })),
        Promise.all((session.linked_plans ?? []).map(async (p) => {
          const detail = await attempt(() => plansApi.get(p.id), null)
          return { id: p.id, title: p.title, status: (detail as { status?: string } | null)?.status }
        })),
      ])
      if (cancelled) return
      setData({
        title: session.title ?? undefined,
        session: {
          provider: session.provider_id ?? undefined,
          model: session.model ?? undefined,
          routedBy: session.routed_by ?? undefined,
          routingMode: session.routing_mode ?? undefined,
          routeReason: session.route_reason ?? undefined,
        },
        decisions: decisions.filter((d) => d.session_id === sessionId),
        work: { plans, tasks },
      })
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sessionId, refreshKey, withDecisions])

  return data
}
