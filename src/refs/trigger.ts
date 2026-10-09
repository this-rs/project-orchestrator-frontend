/**
 * Where is the user, relative to a `#` or `@` reference trigger? Pure: text and
 * caret in, trigger out (or null). The composer decides what to do with it.
 *
 * `#` searches every kind the server resolves but the actors; `@` searches the
 * actors (persona, skill). Same rules for both.
 */
import { insideFence, insideInlineCode } from './codeZones'
import { actorKinds, entityKinds } from './kinds'
import type { RefKind } from './types'

export type RefSigil = '#' | '@'

export interface RefTrigger {
  /** Index of the sigil. */
  start: number
  /** The caret: the range `[start, end)` is replaced when a result is picked. */
  end: number
  /** What was typed after the sigil (after the kind prefix, if any). */
  query: string
  /** Set by a kind prefix (`#rfc foo`, `@skill foo`): search that kind only. */
  kinds?: RefKind[]
  sigil: RefSigil
}

/** The longest query worth sending (the server refuses more than 200 characters). */
export const MAX_QUERY_CHARS = 100

// The sigil must follow the start of the line, a space or an opening character: never a word or a URL.
const PREFIX = '(^|[\\s(\\[{>"\'«])'

/** The kinds a sigil may name in a prefix: `#` the non-actors, `@` the actors. */
const kindsOf = (sigil: RefSigil): readonly string[] => (sigil === '@' ? actorKinds() : entityKinds())

/**
 * The trigger at `caret`, or null.
 *
 * Not a trigger: inside a fenced block or inline code, a sigil glued to a word
 * or a URL, a markdown heading (`# title`: the space ends the query), a
 * finished token, a query too long to be one.
 */
export function detectTrigger(text: string, caret: number): RefTrigger | null {
  if (caret < 0 || caret > text.length) return null
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1
  const line = text.slice(lineStart, caret)
  if (insideFence(text.slice(0, lineStart))) return null

  for (const sigil of ['#', '@'] as const) {
    const kinds = kindsOf(sigil)
    // No ':' in a query: `#plan:...` is a finished token, not a search.
    const plain = new RegExp(`${PREFIX}${sigil}([^\\s${sigil}:]*)$`).exec(line)
    const withKind = kinds.length ? new RegExp(`${PREFIX}${sigil}(${kinds.join('|')}) ([^\\s${sigil}]*)$`, 'i').exec(line) : null
    const m = withKind ?? plain
    if (!m) continue

    const sigilAt = m.index + m[1].length
    // An odd number of backticks before the sigil on this line: inside inline code.
    if (insideInlineCode(line.slice(0, sigilAt))) return null

    const query = withKind ? m[3] : m[2]
    if (query.length > MAX_QUERY_CHARS) return null
    return {
      start: lineStart + sigilAt,
      end: caret,
      query,
      sigil,
      ...(withKind ? { kinds: [m[2].toLowerCase() as RefKind] } : {}),
    }
  }
  return null
}

/**
 * Is this trigger a reference search, and not an issue number? `closes #42`
 * is prose: a query of digits alone (without a kind prefix) opens nothing and
 * no key is taken. The reference token is `#kind:id`. Only `#` has issue numbers.
 */
export const isReferenceQuery = (t: RefTrigger): boolean => t.kinds !== undefined || t.sigil === '@' || !/^\d+$/.test(t.query)
