/**
 * RFC lifecycle helpers shared by the RFC list and detail pages.
 *
 * The lifecycle is driven by the server-side `rfc-lifecycle` protocol. The
 * backend returns `available_transitions` on detail responses; the fallback
 * table below mirrors that FSM for responses that don't include them.
 */

import { ArrowRight, Rocket, Send, ThumbsDown, ThumbsUp, Undo2, type LucideIcon } from 'lucide-react'
import { getStatusMeta } from '@/components/ui/statusMeta'
import type { Rfc, RfcAvailableTransition, RfcStatus } from '@/types/protocol'

// Exact mirror of rfc-lifecycle protocol (549d57c3) transitions
export const FALLBACK_TRANSITIONS: Record<string, { trigger: string; target_state: string }[]> = {
  draft: [
    { trigger: 'propose', target_state: 'proposed' },
    { trigger: 'supersede', target_state: 'superseded' },
  ],
  proposed: [
    { trigger: 'submit_review', target_state: 'under_review' },
    { trigger: 'reject', target_state: 'rejected' },
    { trigger: 'supersede', target_state: 'superseded' },
  ],
  under_review: [
    { trigger: 'accept', target_state: 'accepted' },
    { trigger: 'revise', target_state: 'draft' },
    { trigger: 'reject', target_state: 'rejected' },
    { trigger: 'supersede', target_state: 'superseded' },
  ],
  accepted: [
    { trigger: 'start_planning', target_state: 'planning' },
    { trigger: 'supersede', target_state: 'superseded' },
  ],
  planning: [
    { trigger: 'start_work', target_state: 'in_progress' },
    { trigger: 'supersede', target_state: 'superseded' },
  ],
  in_progress: [
    { trigger: 'complete', target_state: 'implemented' },
    { trigger: 'replan', target_state: 'planning' },
    { trigger: 'supersede', target_state: 'superseded' },
  ],
  implemented: [],
  rejected: [],
  superseded: [],
}

/** The "happy path" of a proposal (an `rfc` on the wire), in order. */
export const LIFECYCLE_STEPS: { key: RfcStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'proposed', label: 'Proposed' },
  { key: 'under_review', label: 'Review' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'planning', label: 'Planning' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'implemented', label: 'Implemented' },
]

/** The states a proposal cannot leave: its lifecycle is over. */
export const CLOSED_STATES: readonly RfcStatus[] = ['rejected', 'superseded']

export function isClosedState(status: RfcStatus): boolean {
  return CLOSED_STATES.includes(status)
}

/**
 * Where the proposal stands, in one sentence (« Step 3 of 7 — Under review.
 * Next: Accepted. »). The words under `ProposalLifecycleLine`'s bar, so the
 * state never relies on colour alone.
 */
export function lifecycleSentence(status: RfcStatus): string {
  const meta = getStatusMeta('rfc', status)
  if (status === 'rejected') return 'Closed — rejected. Nothing is left to do.'
  if (status === 'superseded') return 'Closed — replaced by another proposal. Nothing is left to do.'
  const idx = LIFECYCLE_STEPS.findIndex((s) => s.key === status)
  if (idx === -1) return meta.label
  const n = LIFECYCLE_STEPS.length
  const next = LIFECYCLE_STEPS[idx + 1]
  return next ? `Step ${idx + 1} of ${n} — ${meta.label}. Next: ${next.label}.` : `Step ${n} of ${n} — ${meta.label}. Done.`
}

/** Display order of status groups in lists (active work first, closed last). */
export const RFC_STATUS_ORDER: RfcStatus[] = [
  'under_review',
  'proposed',
  'draft',
  'accepted',
  'planning',
  'in_progress',
  'implemented',
  'rejected',
  'superseded',
]

/** Current lifecycle state of an RFC (FSM state wins over the stored status). */
export function rfcState(rfc: Rfc): RfcStatus {
  return ((rfc.current_state as RfcStatus | undefined) ?? rfc.status) as RfcStatus
}

/** Transitions available from the RFC's current state. */
export function rfcTransitions(rfc: Rfc): RfcAvailableTransition[] {
  const fromBackend = rfc.available_transitions ?? []
  return fromBackend.length > 0 ? fromBackend : FALLBACK_TRANSITIONS[rfcState(rfc)] ?? []
}

/** `submit_review` → `Submit review` */
export function formatTrigger(trigger: string): string {
  const spaced = trigger.replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Transitions that end the RFC's life — they ask for confirmation. */
export function isDestructiveTrigger(trigger: string): boolean {
  return trigger === 'reject' || trigger === 'supersede'
}

/** Transitions that move the RFC backwards (secondary emphasis). */
export function isBackwardTrigger(trigger: string): boolean {
  return trigger === 'revise' || trigger === 'replan'
}

const TRIGGER_ICONS: Record<string, LucideIcon> = {
  propose: Send,
  submit_review: Send,
  accept: ThumbsUp,
  reject: ThumbsDown,
  supersede: ThumbsDown,
  revise: Undo2,
  replan: Undo2,
  start_planning: Rocket,
  start_work: Rocket,
  complete: Rocket,
}

export function triggerIcon(trigger: string): LucideIcon {
  return TRIGGER_ICONS[trigger] ?? ArrowRight
}

/** Confirmation copy for destructive transitions. */
export function transitionConfirm(trigger: string, title: string) {
  if (trigger === 'reject') {
    return {
      title: 'Reject this proposal?',
      description: `“${title}” will be closed as rejected. This ends its lifecycle.`,
      confirmLabel: 'Reject',
    }
  }
  return {
    title: 'Mark this proposal as superseded?',
    description: `“${title}” will be closed as superseded (replaced by another proposal). This ends its lifecycle.`,
    confirmLabel: 'Supersede',
  }
}

/** Extract a readable error from an API error message (`{"error":"..."}`). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : fallback
  const match = msg.match(/"error":"([^"]+)"/)
  return match ? match[1] : msg
}

/** Short plain-text preview of an RFC (first meaningful lines). */
export function rfcPreview(rfc: Rfc, max = 180): string | null {
  const isSingle = rfc.sections.length === 1 && rfc.sections[0].title === 'Content'
  const find = (t: string) => rfc.sections.find((s) => s.title.toLowerCase().includes(t))?.content
  const source = isSingle
    ? rfc.sections[0].content
    : find('problem') ?? find('proposed solution') ?? find('solution') ?? rfc.sections[0]?.content
  if (!source) return null
  const out: string[] = []
  for (const line of source.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('---') || (t.startsWith('**') && t.includes(':'))) continue
    out.push(t)
    if (out.join(' ').length >= max) break
  }
  const text = out.join(' ')
  if (!text) return null
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '…'
}
