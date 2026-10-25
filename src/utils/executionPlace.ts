import type { ExecutionPlace } from '@/types/chat'
import type { CrudEvent } from '@/types/events'
import type { ExecConfirmRequest } from '@/atoms/execConfirm'

/** Whether a session runs in the server's neutral folder (`execution_place: neutral`; absent = project). */
export const isNeutralPlace = (session: { execution_place?: ExecutionPlace | null }): boolean =>
  session.execution_place === 'neutral'

export const EXEC_CONFIRM_EVENT = 'execution_place_confirmation_required'

/** The announcement of a delegation waiting for a person; anything invalid is ignored (never a card without a path). */
export function execConfirmFromEvent(event: CrudEvent): Pick<ExecConfirmRequest, 'placementId' | 'path' | 'taskId'> | null {
  if (event.entity_type !== 'task') return null
  const p = event.payload ?? {}
  if (p.event !== EXEC_CONFIRM_EVENT) return null
  if (typeof p.placement_id !== 'string' || !p.placement_id) return null
  if (typeof p.path !== 'string' || !p.path) return null
  const taskId = typeof p.task_id === 'string' ? p.task_id : event.entity_id || null
  return { placementId: p.placement_id, path: p.path, taskId }
}
