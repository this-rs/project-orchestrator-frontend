/**
 * resumeActions — which "continue what is not finished" buttons a discussion node
 * deserves. Pure: the same guards as the Today cockpit, decided from state only.
 *
 * - `session`: the session is DEAD (CLI stopped) with an unanswered request. The
 *   only action is a message (ContinueSheet/ReplyAction): never "Autoriser".
 * - `run`: the run stopped before the end (failed / budget exceeded / cancelled),
 *   shown once, on the topmost node of that run.
 * - `task`: the node's task failed or is blocked.
 * - run and task actions need the runner: held by another plan => disabled, with
 *   the reason and a link to that plan.
 */

import type { DiscussionNode } from '@/services/discussions'
import type { RunnerState, WaitingRequest } from '@/types/attention'

export const RESUMABLE_RUN_STATUSES = ['failed', 'budget_exceeded', 'cancelled'] as const
export const RETRYABLE_TASK_STATUSES = ['failed', 'blocked'] as const

export interface ResumeContext {
  /** The plan the runs / tasks of this view belong to (needed by the run and task buttons). */
  planId?: string | null
  /** Folder + slug a run starts in (`planRunTarget`). Absent: the plan is read to find them. */
  project?: { root_path?: string; slug: string } | null
  /** The run shown (run page) or the latest run of the plan. */
  run?: { id: string; status: string | null } | null
  /** Status of the tasks the nodes may refer to. */
  taskStatuses?: Record<string, string | undefined>
}

export interface DeadSessionFacts {
  /** Dead sessions with an unanswered request (from the attention payload). */
  deadPending: Record<string, WaitingRequest>
  runner: RunnerState | null
}

export type ResumeAction =
  | { kind: 'session'; request: WaitingRequest }
  | {
      kind: 'run'
      label: 'Reprendre le run'
      planId: string
      disabled: BusyReason | null
    }
  | {
      kind: 'task'
      label: 'Relancer la tâche'
      planId: string
      taskId: string
      disabled: BusyReason | null
    }

export interface BusyReason {
  text: string
  /** Where to look at what holds the runner. */
  link: { workspace: string; planId: string; label: string }
}

export const RESUME_TEXT = {
  runnerBusy: 'Runner occupé par le plan',
}

function busyReason(runner: RunnerState | null): BusyReason | null {
  const busy = runner?.status === 'busy' ? runner.busy_with : null
  if (!busy) return null
  return {
    text: RESUME_TEXT.runnerBusy,
    link: { workspace: busy.workspace, planId: busy.plan_id, label: busy.plan_title },
  }
}

export function resumeActionsFor(
  node: DiscussionNode,
  ctx: ResumeContext,
  facts: DeadSessionFacts,
): ResumeAction[] {
  const out: ResumeAction[] = []

  const request = facts.deadPending[node.session_id]
  if (request) out.push({ kind: 'session', request })

  const planId = ctx.planId
  if (!planId) return out
  const disabled = busyReason(facts.runner)

  const runId = node.metadata.run_id
  if (
    runId &&
    ctx.run &&
    ctx.run.id === runId &&
    node.metadata.parent_run_id !== runId &&
    (RESUMABLE_RUN_STATUSES as readonly (string | null)[]).includes(ctx.run.status)
  ) {
    out.push({ kind: 'run', label: 'Reprendre le run', planId, disabled })
  }

  const taskId = node.metadata.task_id
  const taskStatus = taskId ? ctx.taskStatuses?.[taskId] : undefined
  if (taskId && node.metadata.parent_task_id !== taskId && taskStatus && (RETRYABLE_TASK_STATUSES as readonly string[]).includes(taskStatus)) {
    out.push({ kind: 'task', label: 'Relancer la tâche', planId, taskId, disabled })
  }
  return out
}
