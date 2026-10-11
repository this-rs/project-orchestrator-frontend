/**
 * A refused or failed cancel (`POST /chat/sessions/{id}/cancel-tools`,
 * `/cancel-task/{task_id}`, or the `cancel_tools` frame of the socket), read
 * the way the backend types it (`docs/api/reference.md`, cancel section):
 *
 * | status | `code`               | what the interface does                         |
 * |--------|----------------------|-------------------------------------------------|
 * | 409    | `owner_unreachable`  | "already stopped": nothing runs, nothing to retry |
 * | 504    | `owner_timeout`      | may still happen: pending, never retried        |
 * | 410    | `session_gone`       | retry only if `retryable`                       |
 * | 502    | `owner_*`/`relay_failed` | failed                                      |
 * | 422    | `unsupported`        | the provider cannot                              |
 *
 * `retryable` is the body's word, never guessed from a status: a cancel-tools
 * retried after a timeout would stop the tools started since.
 */
import { ApiError } from '@/services/api'
import type { MessageKey } from '@/i18n/catalog'

export interface CancelFailure {
  /** The backend's `code`, when the body carried one. */
  code?: string
  /** True only when the body says `retryable: true`. */
  retryable: boolean
  /** `owner_unreachable`: no instance holds the session, nothing was running. */
  alreadyStopped: boolean
  status?: number
}

/** Read what a cancel call threw. Never invents a code. */
export function readCancelFailure(err: unknown): CancelFailure {
  if (err instanceof CancelFailedError) return err.failure
  if (!(err instanceof ApiError)) return { retryable: false, alreadyStopped: false }
  let code: string | undefined
  let retryable = false
  try {
    const body = JSON.parse(err.message) as { code?: unknown; retryable?: unknown }
    if (typeof body.code === 'string' && body.code !== '') code = body.code
    retryable = body.retryable === true
  } catch {
    // Not the typed body: a plain failure, not retryable.
  }
  const alreadyStopped = code === 'owner_unreachable'
  return { code, retryable: retryable && !alreadyStopped, alreadyStopped, status: err.status }
}

/** What `useBackgroundTasks().cancelTask` throws when the backend refused or failed the cancel. */
export class CancelFailedError extends Error {
  constructor(public failure: CancelFailure, cause?: unknown) {
    super(failure.code ? `cancel failed: ${failure.code}` : 'cancel failed')
    this.name = 'CancelFailedError'
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}

/** The error-frame codes of a cancel: they never end the turn. */
export const CANCEL_NOTICE_CODES = ['cancel_failed', 'cancel_refused'] as const

/**
 * Metadata of the transcript block for an `error` frame that is about a cancel
 * (`cancel_failed { reason: <code> }`, `cancel_refused { reason: <capability> }`):
 * a notice on the turn, not the end of it. `null` for any other error.
 * Shared by BOTH reducers.
 */
export function cancelNoticeMetadata(evt: unknown): { cancel_notice: true; code: string; reason?: string } | null {
  if (typeof evt !== 'object' || evt === null) return null
  const e = evt as { code?: unknown; reason?: unknown }
  if (typeof e.code !== 'string' || !(CANCEL_NOTICE_CODES as readonly string[]).includes(e.code)) return null
  return {
    cancel_notice: true,
    code: e.code,
    ...(typeof e.reason === 'string' && e.reason !== '' ? { reason: e.reason } : {}),
  }
}

/**
 * What a Stop chip whose request went over the socket reads from a cancel notice
 * of its session: `null` when the notice is not about the running tools (a refused
 * background-task cancel). The frame has no `retryable`: never a retry.
 */
export function chipOutcomeOfNotice(code: string, reason?: string): { reason: string } | null {
  if (code === 'cancel_refused' && reason === 'background_tasks') return null
  return { reason: reason ?? code }
}

/** What a Stop chip shows once its cancel was refused or failed. */
export type ChipOutcome = 'already_stopped' | 'pending' | 'failed'

/**
 * The outcome a Stop chip shows for the reason of a failed cancel:
 * `owner_unreachable` → already stopped; `owner_timeout` → pending (no answer in
 * time, the stop may still happen); anything else → failed. None re-enables it.
 */
export function chipOutcomeOfReason(reason: string): ChipOutcome {
  if (reason === 'owner_unreachable') return 'already_stopped'
  if (reason === 'owner_timeout') return 'pending'
  return 'failed'
}

/**
 * The i18n key of the sentence for a cancel notice on the turn. The socket frame
 * carries no `retryable`: it never invites a retry.
 */
export function cancelNoticeKey(code: string, reason?: string): MessageKey {
  if (code === 'cancel_refused') {
    return reason === 'background_tasks'
      ? 'chatA-activity.cancel.taskRefusedNotice'
      : 'providers.capabilities.toolCancelUnsupported'
  }
  if (reason === 'owner_unreachable') return 'chatA-activity.cancel.alreadyStoppedNotice'
  if (reason === 'owner_timeout') return 'chatA-activity.cancel.timeoutNotice'
  return 'chatA-activity.cancel.failedNotice'
}

let lastCancelStamp = 0

/**
 * A strictly increasing number, to order this tab's own moments: the click of a
 * Stop chip and the arrival of a cancel notice on the stream. Not the wall clock
 * (`Date.now()` can go back — NTP, a changed system time — and a real notice would
 * then look older than the click, leaving the chip on "stopping…"), and never two
 * moments with the same value (a notice that came in the same millisecond as the
 * click but BEFORE it is not its answer).
 */
export function nextCancelStamp(): number {
  lastCancelStamp += 1
  return lastCancelStamp
}
