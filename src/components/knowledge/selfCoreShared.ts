/**
 * What the self-core panel (settings) and the self-core prompt (popup) share:
 * the "later" memory and the reading of an error (the entries: `SelfCoreEntries.tsx`).
 */
import { ApiError, apiErrorMessage } from '@/services/api'
import type { MessageKey } from '@/i18n'

/** Where "Later" is remembered: the epoch (ms) before which nobody is asked again. */
export const SELF_CORE_LATER_KEY = 'po.selfCore.laterUntil'
export const SELF_CORE_LATER_DELAY_MS = 3 * 24 * 60 * 60 * 1000
/** The anchor of the settings panel (`/providers#self-core`). */
export const SELF_CORE_SETTINGS_PATH = '/providers#self-core'

export function rememberLater(now = Date.now()): void {
  try {
    localStorage.setItem(SELF_CORE_LATER_KEY, String(now + SELF_CORE_LATER_DELAY_MS))
  } catch {
    /* storage blocked: the prompt will simply ask again next load */
  }
}

export function isDeferred(now = Date.now()): boolean {
  try {
    const until = Number(localStorage.getItem(SELF_CORE_LATER_KEY))
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

/** The code the server prefixes its message with (`pinned_notes_human_only: …`). */
function errorCode(err: unknown): string | null {
  const msg = apiErrorMessage(err, '')
  const m = /^([a-z_]+):/.exec(msg)
  return m ? m[1] : null
}

/** A sentence a person can act on; the raw server text only when nothing names it. */
export function selfCoreErrorMessage(err: unknown, t: (k: MessageKey) => string, fallback: MessageKey): string {
  const code = errorCode(err)
  if (code === 'pinned_notes_human_only') return t('selfCore.error.humanOnly')
  if (code === 'root_required') return t('selfCore.error.rootOnly')
  if (code === 'pinned_notes_too_many') return t('selfCore.error.tooMany')
  if (code === 'pinned_note_unknown') return t('selfCore.error.unknown')
  if (code === 'pinned_note_out_of_scope') return t('selfCore.error.outOfScope')
  // At the global scope an agent is turned away by the generic human check, without the code.
  if (err instanceof ApiError && err.status === 403) return t('selfCore.error.humanOnly')
  const detail = apiErrorMessage(err, '')
  return detail ? `${t(fallback)}: ${detail}` : t(fallback)
}

