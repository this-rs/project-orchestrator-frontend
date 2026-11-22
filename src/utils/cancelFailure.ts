/**
 * A refused or failed cancel (`POST /chat/sessions/{id}/cancel-tools`,
 * `/cancel-task/{task_id}`, or the `cancel_tools` frame of the socket), read
 * the way the backend types it (`docs/api/reference.md`, cancel section):
 *
 * | status | `code`                   | what the interface does                                   |
 * |--------|--------------------------|-----------------------------------------------------------|
 * | 409    | `owner_unreachable`      | owner unreachable: stop NOT confirmed (never "already stopped") |
 * | 504    | `owner_timeout`          | uncertain: may still happen, never retried                |
 * | 502    | `owner_*`/`relay_failed` | uncertain: a signal may have been delivered               |
 * | 410    | `session_gone`           | uncertain, not retryable (whatever the body says)         |
 * | 401    | —                        | authentication refused (sign in again)                    |
 * | 403    | —                        | authorization refused (this account may not)              |
 * | 422    | `unsupported`            | the provider cannot                                       |
 *
 * `retryable` is the body's word, never guessed from a status, except that it
 * is never true for a 409 or a 410: a cancel-tools retried after those would
 * stop the tools started since, and the interface keeps one rule for both kinds.
 */
import { ApiError } from '@/services/api'
import type { MessageKey } from '@/i18n/catalog'

export interface CancelFailure {
  /** The backend's `code`, when the body carried one. */
  code?: string
  /** True only when the body says `retryable: true`. */
  retryable: boolean
  /** `owner_unreachable`: no owner responded; activity is unconfirmed. */
  ownerUnreachable: boolean
  status?: number
}

/** Read what a cancel call threw. Never invents a code. */
export function readCancelFailure(err: unknown): CancelFailure {
  if (err instanceof CancelFailedError) return err.failure
  if (!(err instanceof ApiError)) return { retryable: false, ownerUnreachable: false }
  let code: string | undefined
  let retryable = false
  try {
    const body = JSON.parse(err.message) as { code?: unknown; retryable?: unknown }
    if (typeof body.code === 'string' && body.code !== '') code = body.code
    retryable = body.retryable === true
  } catch {
    // Not the typed body: a plain failure, not retryable.
  }
  const ownerUnreachable = err.status === 409 && code === 'owner_unreachable'
  return { code, retryable: retryable && !ownerUnreachable && err.status !== 410, ownerUnreachable, status: err.status }
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
 * The i18n key of the sentence for a cancel notice on the turn. The socket frame
 * carries no `retryable`: it never invites a retry.
 */
export function cancelNoticeKey(code: string, reason?: string): MessageKey {
  if (code === 'cancel_refused') {
    return reason === 'background_tasks'
      ? 'chatA-activity.cancel.taskRefusedNotice'
      : 'chatA-activity.cancel.unsupportedNotice'
  }
  if (reason === 'owner_unreachable') return 'chatA-activity.cancelAll.ownerUnreachable'
  if (reason === 'owner_timeout') return 'chatA-activity.cancel.timeoutNotice'
  return 'chatA-activity.cancel.unknownNotice'
}

