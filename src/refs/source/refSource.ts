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
import { findRefTokens, refToken } from '@/utils/messageRefs'
import { validateRefId } from '../ids'
import { isActiveKind, kindInfo } from '../kinds'
import { routeToRef } from '../entityRoutes'
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
  if (!isRefKind(kind) || !validateRefId(kindInfo(kind)?.idFormat ?? 'uuid', id)) return null
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

// --- what an element designates: an annotation, or else a link to an entity route -------------------------

export interface ResolvedSource {
  ref: EntityRef
  /** Display only (a title, a link text). Never sent. */
  label?: string
  /** `false`: the element keeps its own drag (`data-po-ref-drag="off"`). */
  draggable: boolean
  via: 'annotation' | 'route'
}

const LABEL_MAX = 120
const oneLine = (text: string | null | undefined): string | undefined => {
  const t = text?.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, LABEL_MAX) : undefined
}

/**
 * The entity an element stands for, from the element itself or its closest
 * ancestor:
 *  1. `data-po-ref="kind:id"` (an explicit declaration) wins - unless a link
 *     INSIDE it points at another entity (the parent plan in a task row): the
 *     link is what was grabbed;
 *  2. otherwise any `<a href>` that targets an entity route (`entityRoutes.ts`)
 *     is that entity, with no code in the screen that draws it;
 *  3. `data-po-ref="none"` on an element or an ancestor opts out of both.
 *
 * Pure: no store, no layout. The delegated drag, the long press and the
 * keyboard shortcut of the host all ask this one function.
 */
export function resolveSource(target: Element): ResolvedSource | null {
  const carrier = target.closest(REF_SELECTOR)
  if (carrier?.getAttribute(REF_ATTR) === 'none') return null
  const anchor = target.closest('a[href]')
  const fromAnchor = anchor && anchor !== carrier && (!carrier || carrier.contains(anchor)) ? routeToRef(anchor.getAttribute('href')) : null
  if (anchor && fromAnchor) {
    return { ref: fromAnchor, label: oneLine(anchor.getAttribute('aria-label') ?? anchor.textContent), draggable: anchor.getAttribute(REF_DRAG_ATTR) !== 'off', via: 'route' }
  }
  if (carrier) {
    const ref = parseRefAttr(carrier.getAttribute(REF_ATTR))
    return ref ? { ref, label: carrier.getAttribute(REF_LABEL_ATTR) ?? undefined, draggable: carrier.getAttribute(REF_DRAG_ATTR) !== 'off', via: 'annotation' } : null
  }
  return null
}

// --- a dropped URL ------------------------------------------------------------------------------------

/** The first address of a `text/uri-list` payload (comment lines start with #), or ''. */
export function firstUri(dt: DataTransfer): string {
  const list = dt.getData('text/uri-list')
  return list.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? ''
}

/** Does this drag carry an address (and so might be a page of this application, or a web link)? Only `types` is readable during a drag. */
export const dragCarriesUri = (dt: DataTransfer | null): boolean => {
  if (!dt) return false
  const types = Array.from(dt.types)
  // A file dragged from a web page carries its address too: the attachment zone owns that drag.
  return types.includes('text/uri-list') && !types.includes('Files')
}

/**
 * The reference a dropped address designates: a page of this application that
 * is an entity (route table), else - only when the server announced the `link`
 * kind - an external http(s) address. Null: not something the chat can hold.
 */
export function uriToRef(uri: string): EntityRef | null {
  const inApp = routeToRef(uri)
  if (inApp) return inApp
  // A page of this application that is not an entity is not a web link either.
  try {
    if (new URL(uri, window.location.href).origin === window.location.origin) return null
  } catch {
    return null
  }
  if (!isActiveKind('link') || !/^https?:\/\//i.test(uri)) return null
  return validateRefId('url', uri) ? { kind: 'link', id: uri } : null
}
