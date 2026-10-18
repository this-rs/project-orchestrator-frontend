/**
 * Which plans and tasks the work bar lists, without a DOM.
 *
 * Run with: npx vitest run src/components/chat/workInProgress.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { TimelineWork, TimelineWorkTask } from '@/components/timeline'
import { deriveWorkInProgress } from './workInProgress'

const task = (id: string, status: string, extra: Partial<TimelineWorkTask> = {}): TimelineWorkTask => ({ id, title: `Task ${id}`, status, steps: [], ...extra })

describe('deriveWorkInProgress', () => {
  it('is null when there is no work, or none of it is open', () => {
    expect(deriveWorkInProgress(undefined)).toBeNull()
    expect(deriveWorkInProgress({ plans: [], tasks: [] })).toBeNull()
    const closed: TimelineWork = {
      plans: [{ id: 'p1', title: 'Plan', status: 'completed' }, { id: 'p2', title: 'Draft', status: 'draft' }],
      tasks: [task('t1', 'completed', { planId: 'p1' }), task('t2', 'pending'), task('t3', 'failed')],
    }
    expect(deriveWorkInProgress(closed)).toBeNull()
  })

  it('lists in-progress and blocked tasks, under their plan, plans first', () => {
    const work: TimelineWork = {
      plans: [{ id: 'p1', title: 'Plan one', status: 'approved' }, { id: 'p2', title: 'Plan two', status: 'completed' }],
      tasks: [task('t1', 'pending', { planId: 'p1' }), task('t2', 'blocked', { planId: 'p1' }), task('t3', 'in_progress'), task('t4', 'in_progress', { planId: 'p1' })],
    }
    const summary = deriveWorkInProgress(work)!
    expect(summary.rows.map((r) => `${r.kind}:${r.id}:${r.status}${r.nested ? ':nested' : ''}`)).toEqual([
      'plan:p1:approved',
      'task:t2:blocked:nested',
      'task:t4:in_progress:nested',
      'task:t3:in_progress',
    ])
    expect(summary.planCount).toBe(1)
    expect(summary.taskCount).toBe(3)
    // The current task is the first in progress, not the blocked one listed before it.
    expect(summary.current?.id).toBe('t4')
  })

  it('lists an in-progress plan even without an open task, and has no current task then', () => {
    const summary = deriveWorkInProgress({ plans: [{ id: 'p1', title: 'Plan', status: 'in_progress' }], tasks: [task('t1', 'completed', { planId: 'p1' })] })!
    expect(summary.rows).toEqual([{ kind: 'plan', id: 'p1', title: 'Plan', status: 'in_progress' }])
    expect(summary.current).toBeUndefined()
  })

  it('falls back to a blocked task as the current one when none is in progress', () => {
    expect(deriveWorkInProgress({ plans: [], tasks: [task('t1', 'blocked')] })!.current?.id).toBe('t1')
  })

  it('counts the steps done (completed or skipped) and names the step being worked on', () => {
    const steps = [
      { id: 's3', description: 'Write the tests', status: 'pending', order: 2 },
      { id: 's1', description: 'Read the code', status: 'completed', order: 0 },
      { id: 's2', description: 'Skip the spike', status: 'skipped', order: 1 },
      { id: 's4', description: 'Open the PR', status: 'pending', order: 3 },
    ]
    const row = deriveWorkInProgress({ plans: [], tasks: [task('t1', 'in_progress', { steps })] })!.rows[0]
    // No step in progress: the first one not done is the current one.
    expect(row.steps).toEqual({ done: 2, total: 4, current: 'Write the tests' })

    const running = steps.map((s) => (s.id === 's4' ? { ...s, status: 'in_progress' } : s))
    expect(deriveWorkInProgress({ plans: [], tasks: [task('t1', 'in_progress', { steps: running })] })!.rows[0].steps?.current).toBe('Open the PR')
    expect(deriveWorkInProgress({ plans: [], tasks: [task('t1', 'in_progress')] })!.rows[0].steps).toBeUndefined()
  })
})
