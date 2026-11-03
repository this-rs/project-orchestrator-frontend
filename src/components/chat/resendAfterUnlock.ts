import type { ChatMessage } from '@/types'

/**
 * The text to send again once the vault is unlocked, or `null` when nothing must go.
 *
 * While the turn still runs, the native engine is WAITING for the unlock and resumes
 * the same turn by itself (bounded wait, T5): sending the message again would start a
 * second turn — two answers, twice the cost. Only a turn that has ended (the wait hit
 * its ceiling and failed with `credentials_locked`) needs its message sent again.
 */
export function textToResendAfterUnlock(messages: readonly ChatMessage[], turnRunning: boolean): string | null {
  if (turnRunning) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    const text = m.blocks.find((b) => b.type === 'text')?.content ?? ''
    return text.trim() ? text : null
  }
  return null
}
