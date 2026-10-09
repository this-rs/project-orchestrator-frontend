import { Box, type LucideIcon } from 'lucide-react'
import { KIND_NAME_RE, isActiveKind } from './kinds'
import { planKind } from './kinds/plan'
import { taskKind } from './kinds/task'
import { noteKind } from './kinds/note'
import { decisionKind } from './kinds/decision'
import { rfcKind } from './kinds/rfc'
import {
  commitKind,
  conversationKind,
  fileKind,
  linkKind,
  milestoneKind,
  personaKind,
  projectKind,
  protocolKind,
  releaseKind,
  skillKind,
  workspaceKind,
} from './kinds/extended'

/**
 * What the UI knows about how to DRESS one kind (name, icon). Which kinds
 * exist is the server's business (`kinds.ts`); a kind this table has never
 * heard of is still offered, with a generic name and icon, so a new kind on
 * the server needs no change here. A pretty kind is one file under `kinds/`
 * and one line below.
 */
export interface RefKindDef {
  kind: string
  /** Human name, shown next to the id when a label is missing and read by screen readers. */
  name: string
  Icon: LucideIcon
}

export const REF_KIND_REGISTRY: Record<string, RefKindDef> = Object.fromEntries(
  [
    planKind, taskKind, noteKind, decisionKind, rfcKind,
    conversationKind, projectKind, milestoneKind, releaseKind, workspaceKind,
    commitKind, protocolKind, personaKind, skillKind, fileKind, linkKind,
  ].map((d) => [d.kind, d]),
)

/** "release_note" -> "Release note". */
const humanize = (kind: string): string => {
  const words = kind.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const refKindDef = (kind: string): RefKindDef =>
  (Object.prototype.hasOwnProperty.call(REF_KIND_REGISTRY, kind) ? REF_KIND_REGISTRY[kind] : undefined) ?? { kind, name: humanize(kind), Icon: Box }

/**
 * A kind name that may appear in something the SERVER wrote (a replayed block,
 * a `refs_resolved` event): one this server lists now, or one the UI knows how
 * to dress. Timing-proof: a history opened before the kinds route answered
 * still shows its persona chips. A name the user typed is held to the stricter `isRefKind`.
 */
export const isWireKind = (kind: unknown): kind is string =>
  typeof kind === 'string' && KIND_NAME_RE.test(kind) && (isActiveKind(kind) || Object.prototype.hasOwnProperty.call(REF_KIND_REGISTRY, kind))
