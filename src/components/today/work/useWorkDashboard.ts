import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { projectsAtom } from '@/atoms'
import { plansApi } from '@/services/plans'
import { tasksApi } from '@/services/tasks'
import { progressApi, type TaskCounts } from '@/services/progress'
import { runnerApi, type PlanRun } from '@/services/runner'
import type { Plan, Task, TaskWithPlan } from '@/types'
import { buildDashboard, type DashboardInput, type WorkDashboard, type WorkTask } from './model'

const POLL_MS = 30_000

type Raw = Omit<DashboardInput, 'dayIds' | 'projects' | 'now'>

export type WorkStatus = 'loading' | 'ready' | 'error'

export interface WorkDashboardState {
  status: WorkStatus
  data: WorkDashboard | null
  error: string | null
  /** A refetch is in flight while older data is still shown. */
  refreshing: boolean
  /** The last refetch failed: what is shown may be out of date. */
  stale: boolean
  refresh: () => void
}

/** One workspace's slice of the work: plans, tasks by state, runs. */
async function loadWorkspace(slug: string) {
  const ws = { workspace_slug: slug }
  const [plans, inProgress, blocked, pending, runs] = await Promise.all([
    plansApi.list({ status: 'in_progress', limit: 50, sort_by: 'priority', sort_order: 'desc', ...ws }),
    tasksApi.list({ status: 'in_progress', limit: 100, ...ws }),
    tasksApi.list({ status: 'blocked', limit: 100, ...ws }),
    tasksApi.list({ status: 'pending', limit: 200, sort_by: 'priority', sort_order: 'desc', ...ws }),
    runnerApi.listAllRuns({ limit: 100, ...ws }).catch((): PlanRun[] => []),
  ])
  return {
    slug,
    plans: plans.items,
    inProgress: inProgress.items,
    blocked: blocked.items,
    pending: pending.items,
    runs,
  }
}

const dedupe = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()]

/**
 * Loads what the day's work needs, workspace by workspace (a plan carries no
 * workspace of its own, and the page links to it by workspace). Older data stays
 * on screen while a refetch runs; a failed refetch only marks it stale.
 */
export function useWorkDashboard(workspaces: string[], dayIds: string[]): WorkDashboardState {
  const projects = useAtomValue(projectsAtom)
  const [raw, setRaw] = useState<Raw | null>(null)
  const [status, setStatus] = useState<WorkStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [stale, setStale] = useState(false)
  const seq = useRef(0)
  const dayRef = useRef(dayIds)
  dayRef.current = dayIds
  const key = workspaces.join('|')

  const load = useCallback(async () => {
    const mine = ++seq.current
    setRefreshing(true)
    try {
      const slices = await Promise.all(workspaces.map(loadWorkspace))
      const plans: Plan[] = dedupe(slices.flatMap((s) => s.plans))
      const workspaceByPlan: Record<string, string> = {}
      for (const s of slices) for (const p of s.plans) workspaceByPlan[p.id] = s.slug
      const inProgress: TaskWithPlan[] = dedupe(slices.flatMap((s) => s.inProgress))
      const blocked: TaskWithPlan[] = dedupe(slices.flatMap((s) => s.blocked))
      const pending: TaskWithPlan[] = dedupe(slices.flatMap((s) => s.pending))
      const runs: PlanRun[] = slices.flatMap((s) => s.runs)

      const [counts, nexts] = await Promise.all([
        plans.length
          ? progressApi.batch('plan', plans.slice(0, 200).map((p) => p.id)).catch((): Record<string, TaskCounts> => ({}))
          : Promise.resolve({} as Record<string, TaskCounts>),
        Promise.all(
          plans.map(async (p) => [p.id, await plansApi.getNextTask(p.id).catch((): Task | null => null)] as const),
        ),
      ])
      const nextByPlan = Object.fromEntries(nexts)

      // Day-plan tasks that none of the lists above contain (completed today, deeper in the backlog).
      const have = new Set([...inProgress, ...blocked, ...pending].map((t) => t.id))
      for (const t of Object.values(nextByPlan)) if (t) have.add(t.id)
      const missing = dayRef.current.filter((id) => !have.has(id)).slice(0, 25)
      const extra: WorkTask[] = (
        await Promise.all(missing.map((id) => tasksApi.get(id).catch(() => null)))
      )
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ task: t, planId: null, planTitle: null, workspace: null }))

      if (mine !== seq.current) return
      setRaw({ plans, inProgress, blocked, pending, nextByPlan, extra, counts, runs, workspaceByPlan })
      setStatus('ready')
      setError(null)
      setStale(false)
    } catch (e) {
      if (mine !== seq.current) return
      const message = e instanceof Error && e.message ? e.message : 'Chargement impossible'
      // Keep what we have: only the first load is an error state.
      setRaw((cur) => {
        if (cur) setStale(true)
        else {
          setStatus('error')
          setError(message)
        }
        return cur
      })
    } finally {
      if (mine === seq.current) setRefreshing(false)
    }
    // `key` stands for the workspaces list (a new array each render would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    void load()
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    const counter = seq
    return () => {
      counter.current++
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  const data = useMemo(
    () => (raw ? buildDashboard({ ...raw, projects, dayIds }) : null),
    [raw, projects, dayIds],
  )

  return { status, data, error, refreshing, stale, refresh: () => void load() }
}
