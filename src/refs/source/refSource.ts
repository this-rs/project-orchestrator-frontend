/**
 * Declaring that an element IS an entity the chat can reference.
 *
 * HOW TO DECLARE A NEW ELEMENT (the whole procedure):
 *  1. The element that represents a plan / task / note / decision / rfc gets
 *     `{...useReferenceSource({ kind, id, label })}` (see `useReferenceSource.tsx`),
 *     or, for the shared rows, the `entityRef` prop of `EntityRow` / `PageHeader`.
 *  2. Nothing else: the single dragstart listener of `ReferenceSourceHost`
 *     reads the closest ancestor carrying `data-po-ref`; the "Add to chat"
 *     button and the keyboard shortcut go through the same add path
 *     (`addRefToChatAtom`). Never write a dragstart handler per screen.
 *  3. A component that shows such an entity but cannot be declared goes in
 *     `__tests__/coverage.exceptions.ts` WITH a justification; that list can only shrink
 *     (`__tests__/coverage.ratchet.test.ts`).
 *
 * The attribute value is `kind:id`, nothing else. A label (`data-po-ref-label`)
 * is display only: the server re-resolves every reference, so no content and
 * no label ever travels as a source of truth.
 */
import { findRefTokens, isValidId, refToken } from '@/utils/messageRefs'
import { isRefKind, type EntityRef } from '../types'

export const REF_ATTR = 'data-po-ref'
export const REF_LABEL_ATTR = 'data-po-ref-label'
/** `off` on a declared element: it keeps its own drag (kanban). */
export const REF_DRAG_ATTR = 'data-po-ref-drag'
export const REF_MIME = 'application/x-po-ref'
export const REF_SELECTOR = `[${REF_ATTR}]`

/** `kind:id`, the value of `data-po-ref`. */
export const serializeRefAttr = (ref: EntityRef): string => `${ref.kind}:${ref.id}`

/** An entity ref from untrusted input (attribute, MIME payload): closed list of kinds, UUID id, no extra field kept. */
export function parseEntityRef(value: unknown): EntityRef | null {
  if (!value || typeof value !== 'object') return null
  const { kind, id } = value as Record<string, unknown>
  if (!isRefKind(kind) || !isValidId(id)) return null
  return { kind, id }
}

export function parseRefAttr(value: string | null | undefined): EntityRef | null {
  if (!value) return null
  const at = value.indexOf(':')
  if (at <= 0) return null
  return parseEntityRef({ kind: value.slice(0, at), id: value.slice(at + 1) })
}

/** What a dragstart puts on the DataTransfer: the custom type AND a plain-text token (WKWebView does not guarantee custom types). */
export function writeRefToDataTransfer(dt: DataTransfer, ref: EntityRef): void {
  // Neutralise what the browser put there for a native <a href> / <img>: dropping a plan into another app must not paste a URL.
  dt.clearData()
  dt.setData(REF_MIME, JSON.stringify({ kind: ref.kind, id: ref.id }))
  dt.setData('text/plain', refToken(ref))
  dt.effectAllowed = 'copy'
}

/**
 * The reference carried by a drop, or null. The custom type first; else a
 * plain-text payload that is EXACTLY one token (what we wrote as fallback).
 */
export function readRefFromDataTransfer(dt: DataTransfer | null): EntityRef | null {
  if (!dt) return null
  try {
    const raw = dt.getData(REF_MIME)
    if (raw) return parseEntityRef(JSON.parse(raw))
  } catch {
    /* not ours */
  }
  const text = dt.getData('text/plain').trim()
  const [token] = findRefTokens(text)
  return token && token.start === 0 && token.end === text.length ? { kind: token.kind, id: token.id } : null
}

/**
 * Is this drag ours? Only `types` is readable while dragging. `inFlight` is
 * the reference the host saw leave in this document: it covers a webview that
 * dropped the custom type and left only `text/plain`.
 */
export function dragCarriesRef(dt: DataTransfer | null, inFlight: EntityRef | null): boolean {
  if (!dt) return false
  const types = Array.from(dt.types)
  return types.includes(REF_MIME) || (inFlight !== null && types.includes('text/plain'))
}
