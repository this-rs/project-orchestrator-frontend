/**
 * Single source of truth for how entity statuses / priorities are displayed.
 *
 * Rule (DESIGN.md — "Status"): a status is a small coloured dot + plain text
 * label in the tone colour. Never a filled pill. Colour carries meaning, the
 * text carries it too (colour-blind safe).
 */
import type {
  DecisionStatus,
  MilestoneStatus,
  NoteImportance,
  NoteStatus,
  PersonaStatus,
  PlanStatus,
  ReleaseStatus,
  SkillStatus,
  StepStatus,
  TaskStatus,
} from '@/types'
import type { ProtocolStatus, RfcStatus, RunStatus } from '@/types/protocol'
import type { GateStatus } from '@/types/chat'

// ============================================================================
// Tones
// ============================================================================

/**
 * Semantic tones. Keep this list short — every status maps to one of them.
 * - neutral  : not started / draft / planned (gray)
 * - info     : proposed / open / under review (sky)
 * - progress : actively moving — in progress / running (indigo, the accent)
 * - success  : done / accepted / active-healthy (emerald)
 * - warning  : needs attention — blocked / stale / needs review (amber)
 * - danger   : failed / rejected / cancelled-with-error (red)
 * - muted    : closed / archived / superseded / skipped (dim gray)
 * - special  : emerging / imported / planning (violet) — use sparingly
 */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger' | 'muted' | 'special'

export const TONE_CLASSES: Record<StatusTone, { dot: string; text: string; ring: string }> = {
  neutral: { dot: 'bg-gray-400', text: 'text-gray-400', ring: 'ring-gray-400/40' },
  info: { dot: 'bg-sky-400', text: 'text-sky-400', ring: 'ring-sky-400/40' },
  progress: { dot: 'bg-indigo-400', text: 'text-indigo-300', ring: 'ring-indigo-400/40' },
  success: { dot: 'bg-emerald-400', text: 'text-emerald-400', ring: 'ring-emerald-400/40' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-400', ring: 'ring-amber-400/40' },
  danger: { dot: 'bg-red-400', text: 'text-red-400', ring: 'ring-red-400/40' },
  muted: { dot: 'bg-gray-600', text: 'text-gray-500', ring: 'ring-gray-600/40' },
  special: { dot: 'bg-violet-400', text: 'text-violet-400', ring: 'ring-violet-400/40' },
}

export interface StatusMeta {
  label: string
  tone: StatusTone
}

// ============================================================================
// Registry — one map per entity status enum
// ============================================================================

type Registry<T extends string> = Record<T, StatusMeta>

const TASK: Registry<TaskStatus> = {
  pending: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'progress' },
  blocked: { label: 'Blocked', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}

const PLAN: Registry<PlanStatus> = {
  draft: { label: 'Draft', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'progress' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

const STEP: Registry<StepStatus> = {
  pending: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'progress' },
  completed: { label: 'Completed', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'muted' },
}

const MILESTONE: Registry<MilestoneStatus> = {
  planned: { label: 'Planned', tone: 'neutral' },
  open: { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'progress' },
  completed: { label: 'Completed', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
}

const RELEASE: Registry<ReleaseStatus> = {
  planned: { label: 'Planned', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'progress' },
  released: { label: 'Released', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

const NOTE: Registry<NoteStatus> = {
  active: { label: 'Active', tone: 'success' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  stale: { label: 'Stale', tone: 'neutral' },
  obsolete: { label: 'Obsolete', tone: 'danger' },
  archived: { label: 'Archived', tone: 'muted' },
}

const IMPORTANCE: Registry<NoteImportance> = {
  low: { label: 'Low', tone: 'muted' },
  medium: { label: 'Medium', tone: 'neutral' },
  high: { label: 'High', tone: 'warning' },
  critical: { label: 'Critical', tone: 'danger' },
}

const DECISION: Registry<DecisionStatus> = {
  proposed: { label: 'Proposed', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  deprecated: { label: 'Deprecated', tone: 'warning' },
  superseded: { label: 'Superseded', tone: 'muted' },
}

const SKILL: Registry<SkillStatus> = {
  emerging: { label: 'Emerging', tone: 'special' },
  active: { label: 'Active', tone: 'success' },
  dormant: { label: 'Dormant', tone: 'warning' },
  archived: { label: 'Archived', tone: 'muted' },
  imported: { label: 'Imported', tone: 'info' },
}

const PERSONA: Registry<PersonaStatus> = {
  active: { label: 'Active', tone: 'success' },
  emerging: { label: 'Emerging', tone: 'special' },
  dormant: { label: 'Dormant', tone: 'warning' },
  archived: { label: 'Archived', tone: 'muted' },
}

const PROTOCOL: Registry<ProtocolStatus> = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  archived: { label: 'Archived', tone: 'muted' },
}

const RUN: Registry<RunStatus> = {
  pending: { label: 'Pending', tone: 'neutral' },
  running: { label: 'Running', tone: 'progress' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

const RFC: Registry<RfcStatus> = {
  draft: { label: 'Draft', tone: 'neutral' },
  proposed: { label: 'Proposed', tone: 'info' },
  under_review: { label: 'Under review', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  planning: { label: 'Planning', tone: 'special' },
  in_progress: { label: 'In progress', tone: 'progress' },
  implemented: { label: 'Implemented', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  superseded: { label: 'Superseded', tone: 'muted' },
}

const GATE: Registry<GateStatus> = {
  Pass: { label: 'Pass', tone: 'success' },
  Fail: { label: 'Fail', tone: 'danger' },
  Skip: { label: 'Skip', tone: 'muted' },
  Error: { label: 'Error', tone: 'danger' },
}

export const STATUS_REGISTRY = {
  task: TASK,
  plan: PLAN,
  step: STEP,
  milestone: MILESTONE,
  release: RELEASE,
  note: NOTE,
  importance: IMPORTANCE,
  decision: DECISION,
  skill: SKILL,
  persona: PERSONA,
  protocol: PROTOCOL,
  /** Protocol runs, pipeline runs, runner runs — any pending/running/completed/failed/cancelled enum. */
  run: RUN,
  rfc: RFC,
  gate: GATE,
} as const

export type StatusKind = keyof typeof STATUS_REGISTRY

/** Allowed status values for a kind (e.g. `StatusValue<'task'>` = TaskStatus). */
export type StatusValue<K extends StatusKind> = keyof (typeof STATUS_REGISTRY)[K] & string

// ============================================================================
// Lookup
// ============================================================================

/** `in_progress` → `In progress`, `needsReview` → `Needs review`. */
export function humanizeStatus(value: string): string {
  const spaced = value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const HEURISTICS: [RegExp, StatusTone][] = [
  [/(fail|error|reject|obsolete|crash|broken|denied|invalid)/, 'danger'],
  [/(block|stale|warn|review|degrad|paused|retry|timeout|expir)/, 'warning'],
  [/(running|progress|active_run|executing|streaming|syncing|working)/, 'progress'],
  [/(cancel|archiv|closed|supersed|skip|disabled|inactive|dormant|deprecat|disconnect)/, 'muted'],
  [/(complete|done|success|pass|accept|release|implement|merged|healthy|\bok\b|enabled|connected|active)/, 'success'],
  [/(propos|open|approv|queued|scheduled|waiting)/, 'info'],
  [/(emerg|import|planning|experimental)/, 'special'],
]

/** Best-effort tone for an unknown status string (used as a fallback). */
export function guessTone(value: string): StatusTone {
  const v = value.toLowerCase()
  for (const [re, tone] of HEURISTICS) if (re.test(v)) return tone
  return 'neutral'
}

/**
 * Display metadata for a status. Known kinds use the registry (case-insensitive
 * for milestones, whose backend sometimes sends `Completed`); anything else
 * falls back to a humanized label + guessed tone, so it never throws.
 */
export function getStatusMeta(kind: StatusKind | undefined, value: string | null | undefined): StatusMeta {
  if (!value) return { label: 'Unknown', tone: 'muted' }
  if (kind) {
    const reg = STATUS_REGISTRY[kind] as Record<string, StatusMeta>
    const hit = reg[value] ?? reg[value.toLowerCase()] ?? reg[value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()]
    if (hit) return hit
  }
  return { label: humanizeStatus(value), tone: guessTone(value) }
}

/** Ordered `{ value, label }` options for a kind — feed a StatusMenu / Select. */
export function getStatusOptions<K extends StatusKind>(kind: K): { value: StatusValue<K>; label: string }[] {
  const reg = STATUS_REGISTRY[kind] as Record<string, StatusMeta>
  return Object.keys(reg).map((value) => ({ value: value as StatusValue<K>, label: reg[value].label }))
}

// ============================================================================
// Priority (numeric, 0–10; higher = more urgent)
// ============================================================================

/**
 * Priority display: `P8` with a tone. Returns null for missing / zero
 * priority — do not render anything in that case.
 */
export function getPriorityMeta(priority: number | null | undefined): (StatusMeta & { short: string }) | null {
  if (priority == null || !Number.isFinite(priority) || priority <= 0) return null
  const short = `P${priority}`
  if (priority >= 9) return { short, label: `Priority ${priority} (critical)`, tone: 'danger' }
  if (priority >= 7) return { short, label: `Priority ${priority} (high)`, tone: 'warning' }
  if (priority >= 4) return { short, label: `Priority ${priority}`, tone: 'neutral' }
  return { short, label: `Priority ${priority} (low)`, tone: 'muted' }
}
