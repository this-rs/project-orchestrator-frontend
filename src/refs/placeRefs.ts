import { findRefTokens } from '@/utils/messageRefs'
import { refKey } from './refState'
import type { ChatReference } from './types'

export type UserTextSegment = { type: 'text'; text: string } | { type: 'ref'; ref: ChatReference; raw: string }

/**
 * Cut a user message at its `#kind:id` tokens. A token is drawn as a chip only
 * when the message really carries that reference (contract C3: a token with
 * no entry in `refs` stays plain text, with no power). References whose token
 * is not in the text — sent by another client, say — come back as `unplaced`
 * so the bubble can still show them.
 */
export function placeRefs(
  text: string,
  refs: readonly ChatReference[],
): { segments: UserTextSegment[]; unplaced: ChatReference[] } {
  const byKey = new Map(refs.map((r) => [refKey(r), r]))
  const used = new Set<string>()
  const segments: UserTextSegment[] = []
  let cursor = 0
  for (const token of findRefTokens(text)) {
    const ref = byKey.get(refKey(token))
    if (!ref) continue
    if (token.start > cursor) segments.push({ type: 'text', text: text.slice(cursor, token.start) })
    segments.push({ type: 'ref', ref, raw: token.raw })
    used.add(refKey(token))
    cursor = token.end
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) })
  return { segments, unplaced: refs.filter((r) => !used.has(refKey(r))) }
}
