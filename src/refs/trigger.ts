/**
 * Where is the user, relative to a `#` reference trigger? Pure: text and caret
 * in, trigger out (or null). The composer decides what to do with it.
 */
import { insideFence, insideInlineCode } from './codeZones'
import { REF_KINDS, type RefKind } from './types'

export interface RefTrigger {
  /** Index of the `#`. */
  start: number
  /** The caret: the range `[start, end)` is replaced when a result is picked. */
  end: number
  /** What was typed after the `#` (after the kind prefix, if any). */
  query: string
  /** Set by a kind prefix (`#rfc foo`): search that kind only. */
  kinds?: RefKind[]
}

/** The longest query worth sending (the server refuses more than 200 characters). */
export const MAX_QUERY_CHARS = 100

// `#` must follow the start of the line, a space or an opening character: never a word or a URL.
const PREFIX = '(^|[\\s(\\[{>"\'«])'
const WITH_KIND = new RegExp(`${PREFIX}#(${REF_KINDS.join('|')}) ([^\\s#]*)$`, 'i')
// No ':' in a query: `#plan:…` is a finished token, not a search.
const PLAIN = new RegExp(`${PREFIX}#([^\\s#:]*)$`)

/**
 * The trigger at `caret`, or null.
 *
 * Not a trigger: inside a fenced block or inline code, a `#` glued to a word
 * or a URL, a markdown heading (`# title`: the space ends the query), a
 * finished token, a query too long to be one.
 */
export function detectTrigger(text: string, caret: number): RefTrigger | null {
  if (caret < 0 || caret > text.length) return null
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1
  const line = text.slice(lineStart, caret)
  if (insideFence(text.slice(0, lineStart))) return null

  const withKind = WITH_KIND.exec(line)
  const plain = withKind ? null : PLAIN.exec(line)
  const m = withKind ?? plain
  if (!m) return null

  const hashAt = m.index + m[1].length
  // An odd number of backticks before the `#` on this line: inside inline code.
  if (insideInlineCode(line.slice(0, hashAt))) return null

  const query = withKind ? m[3] : m[2]
  if (query.length > MAX_QUERY_CHARS) return null
  return {
    start: lineStart + hashAt,
    end: caret,
    query,
    ...(withKind ? { kinds: [m[2].toLowerCase() as RefKind] } : {}),
  }
}

/**
 * Is this trigger a reference search, and not an issue number? `closes #42`
 * is prose: a query of digits alone (without a kind prefix) opens nothing and
 * no key is taken. The reference token is `#kind:id`.
 */
export const isReferenceQuery = (t: RefTrigger): boolean => t.kinds !== undefined || !/^\d+$/.test(t.query)
