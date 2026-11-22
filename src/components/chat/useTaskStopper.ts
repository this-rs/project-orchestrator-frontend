/**
 * The targeted stop of one background task (`cancel-task/{task_id}`), shared by
 * the activity bar's Stop button and the stop dialog. One request per task until
 * a person acknowledges its answer; the answer lives in `taskCancellationStore`,
 * so it survives an unmount. Never retried.
 */
import { useAtomValue, useStore } from 'jotai'
import { chatSessionIdAtom } from '@/atoms'
import { authModeAtom, currentUserAtom } from '@/atoms/auth'
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks'
import { RequestIdentityChangedError } from '@/services/api'
import { readCancelFailure } from '@/utils/cancelFailure'
import type { MessageKey } from '@/i18n'
import { taskCancellationAtom, taskCancellationKey, type TaskCancelFeedback } from './taskCancellationStore'

/**
 * Longer than the backend's relay bounds, but finite if a proxy never answers.
 * Reaching it does not abort the request: the stop may still happen.
 */
export const CANCEL_TASK_TIMEOUT_MS = 30_000

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

/** The sentence for an answer; 409 owner_unreachable is never "already stopped". */
export function taskFeedbackText(t: Translate, result: TaskCancelFeedback): string {
  return result.kind === 'success'
    ? t(result.killed === 1 ? 'chatA-activity.bar.stoppedOne' : 'chatA-activity.bar.stoppedMany', { count: result.killed })
    : result.kind === 'fallback' ? t('chatA-activity.bar.noPid') : result.keys.map((key) => t(key)).join(' ')
}

export function useTaskStopper() {
  const { cancelTask } = useBackgroundTasks()
  const sessionId = useAtomValue(chatSessionIdAtom)
  const store = useStore()
  const userId = useAtomValue(currentUserAtom)?.id ?? null
  const mode = useAtomValue(authModeAtom)
  const operations = useAtomValue(taskCancellationAtom)
  const keyFor = (taskId: string) => taskCancellationKey(sessionId, userId, mode, taskId)

  const acknowledge = (taskId: string) => {
    const key = keyFor(taskId)
    store.set(taskCancellationAtom, (previous) => {
      if (previous[key]?.phase !== 'answered') return previous
      const updated = { ...previous }
      delete updated[key]
      return updated
    })
  }

  const stopTask = async (taskId: string) => {
    const key = keyFor(taskId)
    // Synchronous guard in the store: one request per task until a person
    // acknowledges its answer, even across two mounted bars or a remount.
    if (store.get(taskCancellationAtom)[key]) return
    const token = Symbol('targeted cancellation')
    store.set(taskCancellationAtom, (previous) => ({ ...previous, [key]: { phase: 'sending', token } }))
    const finish = (feedback: TaskCancelFeedback) => store.set(taskCancellationAtom, (previous) => {
      if (previous[key]?.token !== token) return previous
      return { ...previous, [key]: { phase: 'answered', token, feedback } }
    })
    let timeout: ReturnType<typeof setTimeout> | undefined
    const localTimeout = Symbol('local task stop timeout')
    try {
      const result = await Promise.race([
        cancelTask(taskId),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(localTimeout), CANCEL_TASK_TIMEOUT_MS)
        }),
      ])
      if (result.capped) {
        // One owner reported a limit; another may still act on this task.
        finish({ kind: 'error', keys: ['chatA-activity.cancelAll.capped', 'chatA-activity.cancel.retryNotice'] })
      } else if (result.killed_pids.length > 0) {
        finish({ kind: 'success', killed: result.killed_pids.length })
      } else {
        finish({ kind: 'fallback' })
      }
    } catch (err) {
      const failure = readCancelFailure(err)
      if (err instanceof RequestIdentityChangedError) {
        // The identity guard refused before sending: nothing went out.
        finish({ kind: 'error', keys: ['chatA-activity.cancelAll.identityChanged'] })
      } else if (err === localTimeout || failure.code === 'owner_timeout') {
        // 504, or no answer at all: the stop may still happen.
        finish({ kind: 'error', keys: ['chatA-activity.cancel.timeoutNotice'] })
      } else if (failure.ownerUnreachable) {
        // 409 owner_unreachable: not confirmed, never "already stopped".
        finish({ kind: 'error', keys: ['chatA-activity.cancelAll.ownerUnreachable'] })
      } else if (failure.status === 401) {
        finish({ kind: 'error', keys: ['chatA-activity.cancel.unauthenticatedNotice'] })
      } else if (failure.status === 403) {
        finish({ kind: 'error', keys: ['chatA-activity.cancel.forbiddenNotice'] })
      } else if (failure.status === 502 || failure.status === 410) {
        // A relay failure or a moved session may follow another owner's signal,
        // whatever the body says about retrying.
        finish({ kind: 'error', keys: ['chatA-activity.cancel.unknownNotice'] })
      } else if (failure.retryable) {
        finish({ kind: 'error', keys: ['chatA-activity.cancel.retryNotice'] })
      } else {
        // A network failure or a lost response can follow a delivered signal.
        finish({ kind: 'error', keys: ['chatA-activity.cancel.unknownNotice'] })
      }
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }

  return { operations, keyFor, acknowledge, stopTask }
}
