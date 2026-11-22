/**
 * Hook exposing the per-session background-tasks state to UI components.
 *
 * Plan 5985a7c4 (F2). Reads `chatBackgroundTasksAtom` (populated by
 * `useChat`'s WS dispatch on `active_tasks_update` events) and provides
 * a `cancelTask(taskId)` action that POSTs to the granular cancel
 * endpoint (`/api/chat/sessions/:id/cancel-task/:task_id`).
 *
 * ## Why no internal WS subscription
 *
 * The atom is fed by `useChat`'s existing dispatch loop, which already
 * handles the WS lifecycle (connect / replay / disconnect / reconnect),
 * the buffered-events trick during replay, etc. Re-implementing a
 * second WS subscription here would risk double-handling and is
 * unnecessary — Jotai gives us a clean read-only view via
 * `useAtomValue`. F7 (REST snapshot hydration) is a separate concern
 * and lives alongside `useChat`.
 *
 * ## Public surface
 *
 * - `tasks` — the current snapshot of `BackgroundTaskInfo[]`. Empty
 *   when no Monitor / Bash bg is running, or when the session just
 *   reset and the next snapshot hasn't arrived yet.
 * - `cancelTask(taskId)` — POST to the cancel-task endpoint. Returns
 *   the parsed `CancelTaskResult`. Throws if no session is active
 *   (the caller should disable the Stop buttons in that case anyway).
 *   A refused or failed cancel throws a `CancelFailedError` carrying the
 *   backend's typed reading (`owner_unreachable` = activity unconfirmed,
 *   `retryable` as the body says it).
 */
import { useAtomValue, useStore } from 'jotai'
import { useCallback } from 'react'
import { chatBackgroundTasksAtom, chatSessionIdAtom } from '@/atoms'
import { authModeAtom, authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'
import { getAuthMode } from '@/services/auth'
import { parseJwtExp } from '@/services/authManager'
import { chatApi } from '@/services/chat'
import type { BackgroundTaskInfo, CancelTaskResult } from '@/types'
import { CancelFailedError, readCancelFailure } from '@/utils/cancelFailure'

export interface UseBackgroundTasksReturn {
  /** Current snapshot from the most recent `active_tasks_update` (or REST hydration). */
  tasks: BackgroundTaskInfo[]
  /**
   * Cancel a single tracked background task by its `tool_use_id`.
   * Resolves with the full `CancelTaskResult` so the caller can
   * surface `capped: true` as a toast when the rate cap is hit.
   *
   * Throws when no session is active — defensive guard, the toolbar
   * pill should be hidden in that state anyway. Throws a
   * `CancelFailedError` when the backend refused or failed the cancel.
   */
  cancelTask: (taskId: string) => Promise<CancelTaskResult>
}

/** Read the declared subject only; the server verifies the token signature. */
function tokenSubject(token: string | null): string | null {
  try {
    if (!token || token.split('.').length !== 3) return null
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4))) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch { return null }
}

export function useBackgroundTasks(): UseBackgroundTasksReturn {
  const store = useStore()
  const tasks = useAtomValue(chatBackgroundTasksAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const userId = useAtomValue(currentUserAtom)?.id ?? null
  const mode = useAtomValue(authModeAtom)
  const modeConfirmed = useAtomValue(authModeConfirmedAtom)

  const cancelTask = useCallback(
    async (taskId: string): Promise<CancelTaskResult> => {
      if (!sessionId) {
        throw new Error(
          'useBackgroundTasks.cancelTask: no active chat session — ' +
            'caller must guard against this state',
        )
      }
      try {
        return await chatApi.cancelTask(sessionId, taskId, (token) => {
          if (!modeConfirmed || store.get(chatSessionIdAtom) !== sessionId ||
              store.get(authModeAtom) !== mode || store.get(authModeConfirmedAtom) !== modeConfirmed ||
              getAuthMode() !== mode || (store.get(currentUserAtom)?.id ?? null) !== userId) return false
          // Never refresh a cookie or send a cookie-only request in required mode.
          const exp = token ? parseJwtExp(token) : null
          return mode === 'none' ? token === null :
            !!userId && tokenSubject(token) === userId && exp !== null && exp > Math.floor(Date.now() / 1000)
        })
      } catch (err) {
        throw new CancelFailedError(readCancelFailure(err), err)
      }
    },
    [sessionId, userId, mode, modeConfirmed, store],
  )

  return { tasks, cancelTask }
}
