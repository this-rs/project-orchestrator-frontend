/**
 * Reading of a refused or failed cancel (backend `docs/api/reference.md`, cancel section).
 *
 * Run with: npx vitest run src/utils/cancelFailure.test.ts
 */
import { describe, it, expect } from 'vitest'
import { ApiError } from '@/services/api'
import { CancelFailedError, cancelNoticeKey, cancelNoticeMetadata, readCancelFailure } from './cancelFailure'

const body = (status: number, b: Record<string, unknown>) => new ApiError(status, JSON.stringify(b))

describe('readCancelFailure', () => {
  it('409 owner_unreachable is "already stopped" and never retryable', () => {
    expect(readCancelFailure(body(409, { error: 'x', code: 'owner_unreachable', retryable: true }))).toEqual({
      code: 'owner_unreachable', retryable: false, alreadyStopped: true, status: 409,
    })
  })

  it('retryable is the body word only, never the status', () => {
    expect(readCancelFailure(body(504, { error: 'x', code: 'owner_timeout', retryable: false })).retryable).toBe(false)
    expect(readCancelFailure(body(504, { error: 'x', code: 'owner_timeout', retryable: true })).retryable).toBe(true)
    expect(readCancelFailure(body(410, { error: 'x', code: 'session_gone' })).retryable).toBe(false)
    expect(readCancelFailure(new ApiError(502, 'Bad Gateway')).retryable).toBe(false)
    expect(readCancelFailure(new TypeError('Failed to fetch'))).toEqual({ retryable: false, alreadyStopped: false })
  })

  it('a CancelFailedError carries its reading', () => {
    const failure = { code: 'session_gone', retryable: true, alreadyStopped: false, status: 410 }
    expect(readCancelFailure(new CancelFailedError(failure))).toBe(failure)
  })
})

describe('cancelNoticeMetadata', () => {
  it('cancel_failed and cancel_refused are notices; other errors are not', () => {
    expect(cancelNoticeMetadata({ type: 'error', code: 'cancel_failed', reason: 'owner_unreachable' })).toEqual({
      cancel_notice: true, code: 'cancel_failed', reason: 'owner_unreachable',
    })
    expect(cancelNoticeMetadata({ type: 'error', code: 'cancel_refused', reason: 'tool_cancel' })?.code).toBe('cancel_refused')
    expect(cancelNoticeMetadata({ type: 'error', message: 'boom' })).toBeNull()
    expect(cancelNoticeMetadata({ type: 'error', code: 'rate_limited' })).toBeNull()
  })
})

describe('cancelNoticeKey', () => {
  it('maps the reason of the socket frame, and never invites a retry', () => {
    expect(cancelNoticeKey('cancel_failed', 'owner_unreachable')).toBe('chatA-activity.cancel.alreadyStoppedNotice')
    expect(cancelNoticeKey('cancel_failed', 'owner_timeout')).toBe('chatA-activity.cancel.timeoutNotice')
    expect(cancelNoticeKey('cancel_failed', 'session_gone')).toBe('chatA-activity.cancel.failedNotice')
    expect(cancelNoticeKey('cancel_refused', 'tool_cancel')).toBe('providers.capabilities.toolCancelUnsupported')
    expect(cancelNoticeKey('cancel_refused', 'background_tasks')).toBe('chatA-activity.cancel.taskRefusedNotice')
  })
})
