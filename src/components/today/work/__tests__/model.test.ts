import { describe, expect, it } from 'vitest'
import type { Plan, Task, TaskWithPlan } from '@/types'
import type { PlanRun } from '@/services/runner'
import { buildDashboard, latestRunByPlan, type DashboardInput } from '../model'

const NOW = new Date(2026, 9, 2, 12)

const plan = (id: string, priority: number, extra: Partial<Plan> = {}): Plan => ({
  id,
  title: `Plan ${id}`,
  description: '',
  status: 'in_progress',
  created_at: '2026-09-01T00:00:00Z',
  created_by: 't',
  priority,
  ...extra,
})

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  description: '',
  status: 'pending',
  tags: [],
  acceptance_criteria: [],
  affected_files: [],
  created_at: '2026-09-01T00:00:00Z',
  ...extra,
})

const withPlan = (t: Task, planId: string): TaskWithPlan => ({ ...t, plan_id: planId, plan_title: `Plan ${planId}` })

const run = (planId: string, status: PlanRun['status'], startedAt: string): PlanRun =>
  ({ run_id: `${planId}-${startedAt}`, plan_id: planId, status, started_at: startedAt }) as PlanRun

const base = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  plans: [],
  inProgress: [],
  blocked: [],
  pending: [],
  nextByPlan: {},
  extra: [],
  counts: {},
  runs: [],
  projects: [],
  workspaceByPlan: {},
  dayIds: [],
  now: NOW,
  ...over,
})

describe('buildDashboard', () => {
  it('lists the next task of each plan, highest priority first, skipping plans with nothing actionable', () => {
    const d = buildDashboard(
      base({
        plans: [plan('p1', 10), plan('p2', 90), plan('p3', 50)],
        nextByPlan: { p1: task('t1', { priority: 5 }), p2: task('t2', { priority: 9 }), p3: null },
      }),
    )
    expect(d.next.map((n) => n.task.id)).toEqual(['t2', 't1'])
    expect(d.next[0].planTitle).toBe('Plan p2')
  })

  it('carries the workspace of each plan to its tasks and chains', () => {
    const d = buildDashboard(
      base({
        plans: [plan('p', 1)],
        inProgress: [withPlan(task('i', { status: 'in_progress' }), 'p')],
        nextByPlan: { p: task('n') },
        workspaceByPlan: { p: 'po' },
      }),
    )
    expect(d.inProgress[0].workspace).toBe('po')
    expect(d.next[0].workspace).toBe('po')
    expect(d.chains[0].workspace).toBe('po')
  })

  it('orders chains by plan priority and attaches progress, project and last run', () => {
    const d = buildDashboard(
      base({
        plans: [plan('a', 10, { project_id: 'pr' }), plan('b', 80)],
        counts: { a: { total: 4, completed: 1, in_progress: 1, blocked: 0, pending: 2, failed: 0, percentage: 25 } },
        projects: [{ id: 'pr', name: 'PO', slug: 'po' } as never],
        runs: [run('a', 'failed', '2026-10-02T08:00:00Z')],
      }),
    )
    expect(d.chains.map((c) => c.plan.id)).toEqual(['b', 'a'])
    expect(d.chains[1].counts?.percentage).toBe(25)
    expect(d.chains[1].project?.slug).toBe('po')
    expect(d.chains[1].run?.status).toBe('failed')
    expect(d.chains[0].counts).toBeNull()
  })

  it('keeps only the latest run per plan and flags a plan whose latest run is running', () => {
    const runs = [run('a', 'completed', '2026-10-01T08:00:00Z'), run('a', 'running', '2026-10-02T09:00:00Z')]
    expect(latestRunByPlan(runs).get('a')?.status).toBe('running')
    const d = buildDashboard(base({ plans: [plan('a', 1), plan('b', 1)], runs }))
    expect([...d.runningPlanIds]).toEqual(['a'])
  })

  it('does not flag a running run of a plan that is not active', () => {
    const d = buildDashboard(base({ plans: [plan('a', 1)], runs: [run('zz', 'running', '2026-10-02T09:00:00Z')] }))
    expect(d.runningPlanIds.size).toBe(0)
  })

  it('resolves the day plan in the user order, from any list, and drops ids it cannot find', () => {
    const d = buildDashboard(
      base({
        plans: [plan('p', 1)],
        inProgress: [withPlan(task('i', { status: 'in_progress' }), 'p')],
        pending: [withPlan(task('q'), 'p')],
        nextByPlan: { p: task('n') },
        extra: [{ task: task('x'), planId: null, planTitle: null, workspace: null }],
        dayIds: ['q', 'ghost', 'n', 'i', 'x'],
      }),
    )
    expect(d.day.map((e) => e.item.task.id)).toEqual(['q', 'n', 'i', 'x'])
  })

  it('shows a task completed today as done and drops one completed on an earlier day', () => {
    const today = withPlan(task('t', { status: 'completed', completed_at: new Date(2026, 9, 2, 9).toISOString() }), 'p')
    const old = withPlan(task('o', { status: 'completed', completed_at: new Date(2026, 9, 1, 9).toISOString() }), 'p')
    const d = buildDashboard(base({ pending: [today, old], dayIds: ['t', 'o'] }))
    expect(d.day).toHaveLength(1)
    expect(d.day[0]).toMatchObject({ done: true, item: { task: { id: 't' } } })
  })
})
