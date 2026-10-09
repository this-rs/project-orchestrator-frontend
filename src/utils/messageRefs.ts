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
import { isInsideCode } from '@/refs/codeZones'
import { ID_FORMATS, UUID_SOURCE, fitsInToken, isValidId, validateRefId } from '@/refs/ids'
import { isActiveKind, isActorKind, kindInfo } from '@/refs/kinds'
import { isWireKind } from '@/refs/registry'
import type { EntityRef } from '@/refs/types'

export { isValidId }

const OPEN = '\n\n<po-refs>'
const CLOSE = '</po-refs>'

/**
 * The visible text and the references of a stored message.
 *
 * `enabled` is the refs_v1 flag: without it the text is returned whole, so a
 * block typed by hand on an older server is not hidden. A history replayed
 * from a server that wrote blocks is decoded once the flag is on.
 *
 * Only the FINAL block counts. A block that does not parse — bad JSON, not an
 * array, an unknown kind, a malformed id — is left in the text: an odd line
 * is better than a half-trusted reference. A block the user typed himself is
 * neutralized by the server (`&lt;po-refs>`), so it never matches here.
 */
/** A reference written by the server: a kind it (or the UI) knows, an id that is spelled as that kind spells it. */
function isWireRef(r: unknown): r is EntityRef {
  if (!r || typeof r !== 'object') return false
  const { kind, id } = r as EntityRef
  if (!isWireKind(kind)) return false
  const known = kindInfo(kind)
  // A kind not (yet) listed by the server: the id must at least be spelled as one of the formats.
  return known ? validateRefId(known.idFormat, id) : ID_FORMATS.some((f) => validateRefId(f, id))
}

export function splitRefs(content: string, enabled = true): { text: string; refs: EntityRef[] } {
  // A server that did not announce refs_v1 neither writes nor neutralizes the block: the text is all there is.
  if (!enabled) return { text: content, refs: [] }
  const start = content.lastIndexOf(OPEN)
  if (start >= 0 && content.endsWith(CLOSE)) {
    const inner = content.slice(start + OPEN.length, content.length - CLOSE.length)
    try {
      const parsed: unknown = JSON.parse(inner)
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (r) => !!r && typeof r === 'object' && isWireRef(r),
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
 * The composer token: `#kind:id`, or `@kind:id` for an actor (persona, skill): the wrong sigil is refused.
 * No lookbehind (WKWebView before 16.4 has none): group 1 is the prefix to
 * keep, the sigil follows it. The kind is cut at the first `:`, so an id may
 * hold colons (`commit`, `file`).
 *
 * Not a token: a sigil glued to a word or a URL (`a#plan:...`, `me@persona:...`),
 * an escaped `\#`, inline code or a fenced block, the destination of a markdown
 * link (`[x](#plan:...)`), an id glued to a letter or digit of any script, a kind
 * this server does not list, `@` before a kind that is not an actor, a kind in
 * capitals, a malformed id, a heading (`# plan:...`).
 */
const CANDIDATE = /(^|[\s([{>"'«])([#@])([a-z][a-z_]*):(\S+)/gmu

const UUID_ID = new RegExp(`^${UUID_SOURCE}(?![\\p{L}\\p{N}_-])`, 'u')
const COMMIT_ID = new RegExp(`^${UUID_SOURCE}:(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{40})(?![\\p{L}\\p{N}_-])`, 'u')
/** Punctuation that ends a sentence, not an address. */
const TRAILING = /[.,;:!?)\]}>"'»]+$/

/** The id at the start of `rest`, spelled as `kind` spells it, or null. */
function idOf(kind: string, rest: string): string | null {
  const format = kindInfo(kind)?.idFormat ?? 'uuid'
  let id: string | null
  switch (format) {
    case 'uuid':
      id = UUID_ID.exec(rest)?.[0] ?? null
      break
    case 'project_commit':
      id = COMMIT_ID.exec(rest)?.[0] ?? null
      break
    default:
      id = rest.replace(TRAILING, '')
  }
  return id && validateRefId(format, id) && fitsInToken(id) ? id : null
}

export interface RefToken extends EntityRef {
  /** Index of the `#`. */
  start: number
  /** Index just after the id. */
  end: number
  raw: string
}

/** `[label](#plan:…)` or `[label]: #plan:…`: the token is the target of a link, not a request. */
function isLinkDestination(text: string, hashAt: number): boolean {
  if (text.slice(hashAt - 2, hashAt) === '](') return true
  const lineStart = text.lastIndexOf('\n', hashAt - 1) + 1
  return /^ {0,3}\[[^\]\n]*\]:[ \t]*$/.test(text.slice(lineStart, hashAt))
}

/** Every token of `text`, in order. A token is only a request: it has power once the server resolved it. */
export function findRefTokens(text: string): RefToken[] {
  const tokens: RefToken[] = []
  for (const m of text.matchAll(CANDIDATE)) {
    const [, lead, sigil, kind, rest] = m
    if (!isActiveKind(kind) || (sigil === '@') !== isActorKind(kind)) continue
    const id = idOf(kind, rest)
    if (!id) continue
    const start = (m.index ?? 0) + lead.length
    const raw = `${sigil}${kind}:${id}`
    if (isInsideCode(text, start) || isLinkDestination(text, start)) continue
    tokens.push({ kind, id, start, end: start + raw.length, raw })
  }
  return tokens
}

/** The token that serializes a reference. */
export const refToken = (ref: EntityRef, sigil: '#' | '@' = isActorKind(ref.kind) ? '@' : '#'): string => `${sigil}${ref.kind}:${ref.id}`
