/**
 * Pure transitions on the references of a message or of a draft.
 *
 * No React, no atoms: the composer, the live reducer and the replay all call
 * these, so they cannot drift apart. Nothing here mutates its input; a
 * transition that changes nothing returns the SAME array (cheap `Object.is`
 * bail-out for React and Jotai).
 */
import { findRefTokens } from '@/utils/messageRefs'
import { refKindDef } from './registry'
import {
  MAX_REFS_PER_MESSAGE,
  displayState,
  isRefKind,
  type ChatReference,
  type EntityRef,
  type ResolvedRef,
} from './types'

/** Identity of a reference: the pair that travels. Ids are compared case-insensitively. */
export const refKey = (ref: EntityRef): string => `${ref.kind}:${ref.id.toLowerCase()}`

/** Add a reference. A duplicate keeps the first entry (and learns a label it lacked); past the cap nothing is added. */
export function addReference(refs: readonly ChatReference[], ref: ChatReference): readonly ChatReference[] {
  const key = refKey(ref)
  const at = refs.findIndex((r) => refKey(r) === key)
  if (at >= 0) {
    const known = refs[at]
    if (known.label || !ref.label) return refs
    return refs.map((r, i) => (i === at ? { ...r, label: ref.label, subtitle: ref.subtitle ?? r.subtitle } : r))
  }
  if (refs.length >= MAX_REFS_PER_MESSAGE) return refs
  return [...refs, ref]
}

export function removeReference(refs: readonly ChatReference[], target: EntityRef): readonly ChatReference[] {
  const key = refKey(target)
  const next = refs.filter((r) => refKey(r) !== key)
  return next.length === refs.length ? refs : next
}

/**
 * The references a text asks for: its tokens, in order of first appearance,
 * deduplicated, at most `MAX_REFS_PER_MESSAGE`. Labels are taken from `known`
 * (what the search returned); a token nobody labeled is still a reference.
 *
 * The text is the single source of truth — it is what the draft persists — so
 * a chip can never outlive its token, nor a token be sent without its chip.
 */
export function reconcileRefs(text: string, known: readonly ChatReference[] = []): ChatReference[] {
  const byKey = new Map(known.map((r) => [refKey(r), r]))
  const out: ChatReference[] = []
  const seen = new Set<string>()
  for (const token of findRefTokens(text)) {
    const key = refKey(token)
    if (seen.has(key) || out.length >= MAX_REFS_PER_MESSAGE) continue
    seen.add(key)
    out.push(byKey.get(key) ?? { kind: token.kind, id: token.id })
  }
  return out
}

/** Text without every token of `target`, and the one space that separated it from its neighbour. */
export function removeRefFromText(text: string, target: EntityRef): string {
  const key = refKey(target)
  let out = text
  // From the end, so earlier indexes stay valid.
  for (const token of findRefTokens(text).reverse()) {
    if (refKey(token) !== key) continue
    const before = out.slice(0, token.start)
    const after = out.slice(token.end)
    if (before.endsWith(' ') && (after === '' || after.startsWith(' '))) out = before.slice(0, -1) + after
    else if (before === '' && after.startsWith(' ')) out = after.slice(1)
    else out = before + after
  }
  return out
}

/** What a message shows for the references of its block, keeping labels already known (optimistic bubble). */
export function refsFromBlock(block: readonly EntityRef[], prior: readonly ChatReference[] = []): ChatReference[] {
  const byKey = new Map(prior.map((r) => [refKey(r), r]))
  return block.map((r) => byKey.get(refKey(r)) ?? { kind: r.kind, id: r.id })
}

/**
 * Fold a `refs_resolved` event into the references of the message it belongs to.
 *
 * The event is authoritative for the status; a reference it does not list
 * keeps its state, one it lists that the message lacks is appended (a client
 * that lost the block still shows what the server read).
 */
export function applyResolved(refs: readonly ChatReference[] | undefined, resolved: readonly ResolvedRef[]): ChatReference[] {
  const list = [...(refs ?? [])]
  for (const r of resolved) {
    const key = refKey(r)
    const at = list.findIndex((x) => refKey(x) === key)
    const prior = at >= 0 ? list[at] : { kind: r.kind, id: r.id }
    const next: ChatReference = {
      ...prior,
      resolution: r.status,
      // Label & co are only sent for ok/truncated; never keep a stale one for an unavailable entry.
      label: r.label ?? (r.status === 'ok' || r.status === 'truncated' ? prior.label : undefined),
      subtitle: r.subtitle ?? (r.status === 'ok' || r.status === 'truncated' ? prior.subtitle : undefined),
      entity_status: r.entity_status,
    }
    if (at >= 0) list[at] = next
    else list.push(next)
  }
  return list
}

/** Short, stable name of a reference without a label ("Task 3adeffc9"). */
export const fallbackName = (ref: EntityRef): string => `${refKindDef(ref.kind).name} ${ref.id.slice(0, 8)}`

/** The name a chip shows and a screen reader reads. */
export const refName = (ref: ChatReference): string => ref.label?.trim() || fallbackName(ref)

/**
 * One sentence for the live region when a turn's references were not all
 * read in full; null when everything resolved (silence is the good news).
 */
export function resolutionAnnouncement(refs: readonly ChatReference[]): string | null {
  const unavailable = refs.filter((r) => displayState(r) === 'unavailable')
  const truncated = refs.filter((r) => displayState(r) === 'truncated')
  if (unavailable.length === 0 && truncated.length === 0) return null
  const parts: string[] = []
  if (unavailable.length > 0) {
    parts.push(
      `${unavailable.length} reference${unavailable.length > 1 ? 's' : ''} unavailable: ${unavailable.map(fallbackName).join(', ')}`,
    )
  }
  if (truncated.length > 0) {
    parts.push(`${truncated.length} truncated: ${truncated.map(refName).join(', ')}`)
  }
  return parts.join('. ')
}


const RESOLUTIONS: readonly string[] = ['ok', 'truncated', 'not_found', 'forbidden']

/**
 * The entries of a `refs_resolved` payload we can use. An entry with an
 * unknown kind or status is dropped, not guessed: the chip stays "resolving"
 * rather than claiming something the server did not say.
 */
export function parseResolvedRefs(raw: unknown): ResolvedRef[] {
  if (!Array.isArray(raw)) return []
  const out: ResolvedRef[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const e = r as Record<string, unknown>
    if (!isRefKind(e.kind) || typeof e.id !== 'string' || typeof e.status !== 'string' || !RESOLUTIONS.includes(e.status)) continue
    const entry: ResolvedRef = { kind: e.kind, id: e.id, status: e.status as ResolvedRef['status'] }
    if (typeof e.label === 'string') entry.label = e.label
    if (typeof e.subtitle === 'string') entry.subtitle = e.subtitle
    if (typeof e.entity_status === 'string') entry.entity_status = e.entity_status
    out.push(entry)
  }
  return out
}
