/**
 * The sentence the composer shows while a provider is being retried, built HERE
 * from the notice's structured detail so it is translated (the backend's own
 * sentence is English). Pure and testable without React.
 */
import type { ModelWait } from '@/atoms'
import type { MessageKey, Vars } from '@/i18n/catalog'

/** A translator's `t`, narrowed to what these helpers need. */
export type PhraseT = (key: MessageKey, vars?: Vars) => string

/** The retry delay as a person reads it, localised ("2 s", "25 min 3 s"). */
export function modelWaitDelayText(t: PhraseT, delayMs: number): string {
  const s = Math.max(1, Math.round(delayMs / 1000))
  return s < 60
    ? t('session.vaultWait.seconds', { s })
    : t('session.vaultWait.minutes', { m: Math.floor(s / 60), s: s % 60 })
}

/** The sentence shown, translated from the structured detail, or the backend's fallback. */
export function modelWaitPhrase(t: PhraseT, wait: ModelWait): string {
  if (!wait.data) return wait.message
  return t('session.modelWait.retry', {
    attempt: wait.data.attempt,
    max: wait.data.maxAttempts,
    delay: modelWaitDelayText(t, wait.data.delayMs),
  })
}
