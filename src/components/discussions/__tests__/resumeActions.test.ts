import { describe, it, expect } from 'vitest'
import type { DiscussionNode } from '@/services/discussions'
import type { RunnerState, WaitingRequest } from '@/types/attention'
import { resumeActionsFor, type DeadSessionFacts, type ResumeContext } from '../resumeActions'

const node = (id: string, meta: Partial<DiscussionNode['metadata']> = {}): DiscussionNode => ({
  session_id: id,
  title: id,
  status: 'idle',
  cost_usd: 0,
  duration_secs: 0,
  message_count: 0,
  children: [],
  metadata: { type: 'root', ...meta },
})
const request = { request_id: 'r1', kind: 'permission', session_id: 's1', text: 'Run rm?' } as unknown as WaitingRequest
const idle: RunnerState = { status: 'idle', busy_with: null }
const busy: RunnerState = {
  status: 'busy',
  busy_with: { plan_id: 'other', plan_title: 'Autre plan', run_id: 'r9', workspace: 'studio', since: '2026-10-01T10:00:00Z' },
}
const facts = (over: Partial<DeadSessionFacts> = {}): DeadSessionFacts => ({ deadPending: {}, runner: idle, ...over })
const kinds = (n: DiscussionNode, ctx: ResumeContext, f: DeadSessionFacts) => resumeActionsFor(n, ctx, f).map((a) => a.kind)

describe('resumeActionsFor', () => {
  it('shows nothing for a plain node', () => {
    expect(kinds(node('s1'), { planId: 'p1' }, facts())).toEqual([])
  })

  it('"Reprendre la session" only for a dead session with a pending request, and it carries NO allow action', () => {
    const f = facts({ deadPending: { s1: request } })
    const actions = resumeActionsFor(node('s1'), {}, f)
    expect(actions).toEqual([{ kind: 'session', request }])
    expect(kinds(node('s2'), {}, f)).toEqual([])
    // The session action is a message to send: the only kinds are session / run / task.
    expect(new Set(['session', 'run', 'task'])).toContain(actions[0].kind)
  })

  it('"Reprendre le run" only when the run stopped early, once (topmost node of the run)', () => {
    const top = node('s1', { run_id: 'run1' })
    const child = node('s2', { run_id: 'run1', parent_run_id: 'run1' })
    for (const status of ['failed', 'budget_exceeded', 'cancelled']) {
      expect(kinds(top, { planId: 'p1', run: { id: 'run1', status } }, facts())).toEqual(['run'])
    }
    for (const status of ['completed', 'running', null]) {
      expect(kinds(top, { planId: 'p1', run: { id: 'run1', status } }, facts())).toEqual([])
    }
    expect(kinds(child, { planId: 'p1', run: { id: 'run1', status: 'failed' } }, facts())).toEqual([])
    // another run's session never gets this run's button
    expect(kinds(node('s3', { run_id: 'run0' }), { planId: 'p1', run: { id: 'run1', status: 'failed' } }, facts())).toEqual([])
    // no plan to resume
    expect(kinds(top, { run: { id: 'run1', status: 'failed' } }, facts())).toEqual([])
  })

  it('"Relancer la tâche" only for a failed or blocked task, once per task', () => {
    const n = node('s1', { task_id: 't1' })
    expect(kinds(n, { planId: 'p1', taskStatuses: { t1: 'failed' } }, facts())).toEqual(['task'])
    expect(kinds(n, { planId: 'p1', taskStatuses: { t1: 'blocked' } }, facts())).toEqual(['task'])
    for (const s of ['pending', 'in_progress', 'completed']) {
      expect(kinds(n, { planId: 'p1', taskStatuses: { t1: s } }, facts())).toEqual([])
    }
    expect(kinds(n, { planId: 'p1' }, facts())).toEqual([])
    expect(kinds(node('s2', { task_id: 't1', parent_task_id: 't1' }), { planId: 'p1', taskStatuses: { t1: 'failed' } }, facts())).toEqual([])
  })

  it('runner busy: run and task buttons are disabled with the reason and a link to the occupant', () => {
    const n = node('s1', { run_id: 'run1', task_id: 't1' })
    const actions = resumeActionsFor(
      n,
      { planId: 'p1', run: { id: 'run1', status: 'failed' }, taskStatuses: { t1: 'failed' } },
      facts({ runner: busy }),
    )
    expect(actions.map((a) => a.kind)).toEqual(['run', 'task'])
    for (const a of actions) {
      if (a.kind === 'session') throw new Error('unexpected')
      expect(a.disabled).toEqual({
        text: 'Runner occupé par le plan',
        link: { workspace: 'studio', planId: 'other', label: 'Autre plan' },
      })
    }
  })

  it('a busy runner does not disable "Reprendre la session" (a message needs no runner)', () => {
    const [a] = resumeActionsFor(node('s1'), {}, facts({ deadPending: { s1: request }, runner: busy }))
    expect(a.kind).toBe('session')
  })
})
