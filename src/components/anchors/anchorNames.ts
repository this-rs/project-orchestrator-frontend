import { refKindDef } from '@/refs/registry'
import { workspacePath } from '@/utils/paths'
import type { Anchor, AnchorTargetType } from '@/services/anchors'

/** Where the application shows an anchored entity, when it has a page keyed by id. */
const SEGMENT: Partial<Record<AnchorTargetType, string>> = {
  plan: 'plans',
  task: 'tasks',
  note: 'notes',
  decision: 'decisions',
}

export const anchorPath = (slug: string | null | undefined, a: Pick<Anchor, 'target_type' | 'target_id'>): string | null => {
  const seg = SEGMENT[a.target_type]
  return slug && seg ? workspacePath(slug, `/${seg}/${a.target_id}`) : null
}

/** The anchor's own name (its snapshot), else the kind and the short id. */
export const anchorName = (a: Pick<Anchor, 'target_type' | 'target_id' | 'snapshot_name'>): string => {
  const name = a.snapshot_name?.trim()
  if (name) return name
  const id = a.target_id.length > 12 ? a.target_id.slice(0, 8) : a.target_id
  return `${refKindDef(a.target_type).name} ${id}`
}
