/**
 * One place for "what a category looks like": its icon, its tint, its words.
 *
 * A card never spells a colour for a type — that is the design contract's rule
 * (DESIGN.md « Cards »). Where the type already exists as a concept its tint is
 * read from `NOMENCLATURE`; the two categories that have no concept of their own
 * (a conversation, and "everything else") carry theirs here, with the tile and
 * the log chip as the only consumers.
 */
import { Boxes, Cog, ListChecks, MessageSquare, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { tr } from '@/i18n/lazy'
import type { ActivityCategory } from '@/types/activity'

export interface ActivityCategoryMeta {
  icon: LucideIcon
  tint: string
  /** Plural noun of the section / filter chip. */
  label: () => string
}

export const CATEGORY_META: Record<ActivityCategory, ActivityCategoryMeta> = {
  plan_run: {
    icon: ListChecks,
    tint: NOMENCLATURE.plans.tint,
    label: () => NOMENCLATURE.plans.plural,
  },
  protocol_run: {
    icon: Workflow,
    tint: NOMENCLATURE.protocols.tint,
    label: () => NOMENCLATURE.protocols.plural,
  },
  chat_session: {
    icon: MessageSquare,
    tint: '#34d399',
    label: () => tr('activity.hub.conversations'),
  },
  entity: {
    icon: Boxes,
    tint: '#a78bfa',
    label: () => tr('activity.hub.other'),
  },
  system: {
    icon: Cog,
    tint: '#94a3b8',
    label: () => tr('activity.hub.other'),
  },
}

/** The three categories a card can be, in display order. */
export const CARD_CATEGORIES: readonly ActivityCategory[] = [
  'plan_run',
  'protocol_run',
  'chat_session',
]
