/**
 * References (`#kind:id`) in the chat: the data model shared by the composer,
 * the wire and the renderers. Contract: PO note 43e1084d (C1-C9) and the
 * backend golden fixtures (`__fixtures__/*.json`, copied from
 * `tests/fixtures/refs/`).
 */

/** The five kinds a message may reference today. `persona` and `skill` are reserved by the server. */
export const REF_KINDS = ['plan', 'task', 'note', 'decision', 'rfc'] as const
export type RefKind = (typeof REF_KINDS)[number]

export const isRefKind = (value: unknown): value is RefKind =>
  typeof value === 'string' && (REF_KINDS as readonly string[]).includes(value)

/** Most references one message may carry (`max_refs_per_message` of entity_ref.json). */
export const MAX_REFS_PER_MESSAGE = 20

/** What the client sends to designate an entity: exactly these two fields, never a label. */
export interface EntityRef {
  kind: RefKind
  id: string
}

/** How the server could read a reference when the turn started (`refs_resolved`). */
export type RefResolution = 'ok' | 'truncated' | 'not_found' | 'forbidden'

export interface RefProject {
  id: string
  slug: string
  name: string
}

/** One entry of a `refs_resolved` event. Label & co are present for `ok` and `truncated` only. */
export interface ResolvedRef extends EntityRef {
  status: RefResolution
  label?: string
  subtitle?: string
  project?: RefProject
  workspace?: RefProject
  entity_status?: string
}

export interface RefsResolvedEvent {
  type: 'refs_resolved'
  refs: ResolvedRef[]
}

/**
 * A reference as the UI holds it: the pair that travels, plus what the UI
 * learned about it (a label from the search result, then the server's
 * resolution). Only `kind` and `id` ever go back on the wire.
 */
export interface ChatReference extends EntityRef {
  label?: string
  subtitle?: string
  /** Absent until the server answered: the chip says it is being resolved. */
  resolution?: RefResolution
  entity_status?: string
}

/** What the chip shows. `forbidden` and `not_found` are one state: the client must not tell them apart. */
export type RefDisplayState = 'pending' | 'ok' | 'truncated' | 'unavailable'

export function displayState(ref: Pick<ChatReference, 'resolution'>): RefDisplayState {
  switch (ref.resolution) {
    case undefined:
      return 'pending'
    case 'ok':
      return 'ok'
    case 'truncated':
      return 'truncated'
    default:
      return 'unavailable'
  }
}

export const toEntityRef = (ref: EntityRef): EntityRef => ({ kind: ref.kind, id: ref.id })
