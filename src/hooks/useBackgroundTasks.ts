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
 */
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { chatBackgroundTasksAtom, chatSessionIdAtom } from '@/atoms'
import { chatApi } from '@/services/chat'
import type { BackgroundTaskInfo, CancelTaskResult } from '@/types'

export interface UseBackgroundTasksReturn {
  /** Current snapshot from the most recent `active_tasks_update` (or REST hydration). */
  tasks: BackgroundTaskInfo[]
  /**
   * Cancel a single tracked background task by its `tool_use_id`.
   * Resolves with the full `CancelTaskResult` so the caller can
   * surface `capped: true` as a toast when the rate cap is hit.
   *
   * Throws when no session is active — defensive guard, the toolbar
   * pill should be hidden in that state anyway.
   */
  cancelTask: (taskId: string) => Promise<CancelTaskResult>
}

export function useBackgroundTasks(): UseBackgroundTasksReturn {
  const tasks = useAtomValue(chatBackgroundTasksAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)

  const cancelTask = useCallback(
    async (taskId: string): Promise<CancelTaskResult> => {
      if (!sessionId) {
        throw new Error(
          'useBackgroundTasks.cancelTask: no active chat session — ' +
            'caller must guard against this state',
        )
      }
      return chatApi.cancelTask(sessionId, taskId)
    },
    [sessionId],
  )

  return { tasks, cancelTask }
}
