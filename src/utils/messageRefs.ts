/**
 * References carried by a chat message, as they come back from the server.
 *
 * The backend folds them into the message text as one trailing
 * `<po-refs>[{"kind","id"}…]</po-refs>` block (`refs` module of the backend:
 * this file is its twin, tested on the same golden vectors,
 * `refs/__fixtures__/po_refs_block.json`). The block holds ids only: the
 * labels come from the `refs_resolved` event, never from the text.
 *
 * Order of blocks: refs first, attachments LAST. Decode in that order:
 * `splitAttachments` first, then `splitRefs` on its text.
 *
 * The visible text keeps the `#kind:id` tokens the user typed (see
 * `findRefTokens`); the server never rewrites it.
 */
import { isRefKind, type EntityRef } from '@/refs/types'

const OPEN = '\n\n<po-refs>'
const CLOSE = '</po-refs>'

const UUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const UUID_RE = new RegExp(`^${UUID_SOURCE}$`)
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

const isValidId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id) && id !== NIL_UUID

/**
 * The visible text and the references of a stored message.
 *
 * Only the FINAL block counts. A block that does not parse — bad JSON, not an
 * array, an unknown kind, a malformed id — is left in the text: an odd line
 * is better than a half-trusted reference. A block the user typed himself is
 * neutralized by the server (`&lt;po-refs>`), so it never matches here.
 */
export function splitRefs(content: string): { text: string; refs: EntityRef[] } {
  const start = content.lastIndexOf(OPEN)
  if (start >= 0 && content.endsWith(CLOSE)) {
    const inner = content.slice(start + OPEN.length, content.length - CLOSE.length)
    try {
      const parsed: unknown = JSON.parse(inner)
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (r) => !!r && typeof r === 'object' && isRefKind((r as EntityRef).kind) && isValidId((r as EntityRef).id),
        )
      ) {
        const refs = (parsed as EntityRef[]).map((r) => ({ kind: r.kind, id: r.id }))
        return { text: content.slice(0, start), refs }
      }
    } catch {
      /* fall through: not our block */
    }
  }
  return { text: content, refs: [] }
}

/**
 * The composer token `#kind:id` (contract C3). No lookbehind (WKWebView before
 * 16.4 has none): group 1 is the prefix to keep, `#` follows it.
 *
 * Not a token: a `#` glued to a word or a URL (`a#plan:…`, `/#plan:…`), an
 * escaped `\#`, an unknown or reserved kind (`#persona:`), a kind in capitals,
 * a malformed id, a heading (`# plan:…`).
 */
const TOKEN_RE = new RegExp(
  `(^|[\\s(\\[{>"'«])#(plan|task|note|decision|rfc):(${UUID_SOURCE})(?![\\w-])`,
  'gm',
)

export interface RefToken extends EntityRef {
  /** Index of the `#`. */
  start: number
  /** Index just after the id. */
  end: number
  raw: string
}

/** Every token of `text`, in order. A token is only a request: it has power once the server resolved it. */
export function findRefTokens(text: string): RefToken[] {
  const tokens: RefToken[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    const id = m[3]
    if (id === NIL_UUID) continue
    const start = (m.index ?? 0) + m[1].length
    const raw = m[0].slice(m[1].length)
    tokens.push({ kind: m[2] as EntityRef['kind'], id, start, end: start + raw.length, raw })
  }
  return tokens
}

/** The token that serializes a reference. */
export const refToken = (ref: EntityRef): string => `#${ref.kind}:${ref.id}`
