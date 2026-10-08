import type { LucideIcon } from 'lucide-react'
import type { RefKind } from './types'
import { planKind } from './kinds/plan'
import { taskKind } from './kinds/task'
import { noteKind } from './kinds/note'
import { decisionKind } from './kinds/decision'
import { rfcKind } from './kinds/rfc'

/** What the UI knows about one kind. A new kind is one file under `kinds/` and one line here. */
export interface RefKindDef {
  kind: RefKind
  /** Human name, shown next to the id when a label is missing and read by screen readers. */
  name: string
  Icon: LucideIcon
}

export const REF_KIND_REGISTRY: Record<RefKind, RefKindDef> = {
  plan: planKind,
  task: taskKind,
  note: noteKind,
  decision: decisionKind,
  rfc: rfcKind,
}

export const refKindDef = (kind: RefKind): RefKindDef => REF_KIND_REGISTRY[kind]
