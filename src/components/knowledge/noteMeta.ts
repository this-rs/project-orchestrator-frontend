/**
 * Shared presentation helpers for knowledge notes (list rows + detail page):
 * type icon/label, scope, anchor entity links, and plain-language
 * explanations of the "neural" metrics (energy, staleness, memory horizon…).
 */
import {
  AlertTriangle,
  BookOpen,
  Box,
  CheckSquare,
  Eye,
  FileCode2,
  FileText,
  Folder,
  GitCommit,
  Hash,
  Info,
  Layers,
  Lightbulb,
  ListChecks,
  Milestone as MilestoneIcon,
  MessageSquare,
  Network,
  Scale,
  Shapes,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { Note, NoteAnchor, NoteImportance, NoteScope, NoteStatus, NoteType } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Note types ──────────────────────────────────────────────────────────

export const NOTE_TYPE_META: Record<NoteType, { label: string; icon: LucideIcon; color: string; hint: string }> = {
  guideline: { label: 'Guideline', icon: BookOpen, color: 'text-blue-400', hint: 'A rule to follow in this codebase.' },
  gotcha: { label: 'Gotcha', icon: AlertTriangle, color: 'text-red-400', hint: 'A trap or non-obvious behaviour to watch out for.' },
  pattern: { label: 'Pattern', icon: Shapes, color: 'text-purple-400', hint: 'A recurring design or implementation pattern.' },
  context: { label: 'Context', icon: Info, color: 'text-gray-400', hint: 'Background knowledge explaining why things are the way they are.' },
  tip: { label: 'Tip', icon: Lightbulb, color: 'text-emerald-400', hint: 'A useful shortcut or piece of advice.' },
  observation: { label: 'Observation', icon: Eye, color: 'text-yellow-400', hint: 'Something noticed while working, not yet a rule.' },
  assertion: { label: 'Assertion', icon: ShieldCheck, color: 'text-orange-400', hint: 'A verifiable claim about the code, checked automatically.' },
}

export const NOTE_TYPES = Object.keys(NOTE_TYPE_META) as NoteType[]

export function noteTypeMeta(type: string) {
  return NOTE_TYPE_META[type as NoteType] ?? { label: type, icon: StickyNote, color: 'text-gray-400', hint: '' }
}

export const noteTypeOptions = NOTE_TYPES.map((t) => ({ value: t, label: NOTE_TYPE_META[t].label }))

export const IMPORTANCE_OPTIONS: NoteImportance[] = ['low', 'medium', 'high', 'critical']
export const NOTE_STATUSES: NoteStatus[] = ['active', 'needs_review', 'stale', 'obsolete', 'archived']

// ── Content → title / preview ───────────────────────────────────────────

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+>]\s+/, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

/** Notes have no title: the first meaningful line of the content plays that role. */
export function noteTitle(content: string): string {
  const lines = content.split('\n').map(stripMarkdown).filter(Boolean)
  return lines[0] ?? '(empty note)'
}

/**
 * Decisions have no title either: the first meaningful line of the
 * description is the title everywhere (list rows, detail header, timeline).
 */
export function decisionTitle(description: string): string {
  const lines = description.split('\n').map(stripMarkdown).filter(Boolean)
  return lines[0] ?? 'Untitled decision'
}

/** The rest of a decision's description, for a muted preview line. */
export const decisionPreview = notePreview

/**
 * Markdown to render under the page header: the content minus a leading
 * heading that IS the title (otherwise the title would appear twice).
 */
export function noteBody(content: string): string {
  const lines = content.split('\n')
  const idx = lines.findIndex((l) => l.trim())
  if (idx === -1) return ''
  const first = lines[idx]
  if (/^#{1,6}\s+/.test(first) && stripMarkdown(first) === noteTitle(content)) {
    return lines
      .slice(idx + 1)
      .join('\n')
      .replace(/^\s*\n/, '')
      .trim()
  }
  return content.trim()
}

/** The rest of the content (plain text), for a muted preview line. */
export function notePreview(content: string): string {
  const lines = content
    .split('\n')
    .filter((l) => !/^\s*```/.test(l))
    .map(stripMarkdown)
    .filter(Boolean)
  return lines.slice(1).join(' ')
}

// ── Scope ───────────────────────────────────────────────────────────────

export function scopeLabel(scope?: NoteScope | null): string | null {
  if (!scope) return null
  if (scope.type === 'workspace') return 'Workspace-wide'
  if (scope.type === 'project') return 'Project-wide'
  return scope.path ? `${scope.type} ${scope.path}` : scope.type
}

// ── Anchors / linked entities ───────────────────────────────────────────

const ENTITY_ICONS: Record<string, LucideIcon> = {
  file: FileText,
  function: Hash,
  struct: Box,
  trait: Shapes,
  enum: Box,
  impl: Box,
  module: Folder,
  task: CheckSquare,
  plan: ListChecks,
  step: ListChecks,
  commit: GitCommit,
  decision: Scale,
  constraint: ShieldCheck,
  milestone: MilestoneIcon,
  workspace_milestone: MilestoneIcon,
  release: Layers,
  skill: Sparkles,
  protocol: Workflow,
  feature_graph: Network,
  note: StickyNote,
  chat_session: MessageSquare,
  project: Folder,
}

export function entityIcon(type: string): LucideIcon {
  return ENTITY_ICONS[type.toLowerCase()] ?? FileCode2
}

export function entityTypeLabel(type: string): string {
  const t = type.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Workspace route of an entity, when the app has a page for it. */
export function entityHref(wsSlug: string, type: string, id: string): string | null {
  switch (type.toLowerCase()) {
    case 'task':
      return workspacePath(wsSlug, `/tasks/${id}`)
    case 'plan':
      return workspacePath(wsSlug, `/plans/${id}`)
    case 'decision':
      return workspacePath(wsSlug, `/decisions/${id}`)
    case 'milestone':
      return workspacePath(wsSlug, `/project-milestones/${id}`)
    case 'workspace_milestone':
      return workspacePath(wsSlug, `/milestones/${id}`)
    case 'skill':
      return workspacePath(wsSlug, `/skills/${id}`)
    case 'protocol':
      return workspacePath(wsSlug, `/protocols/${id}`)
    case 'feature_graph':
      return workspacePath(wsSlug, `/feature-graphs/${id}`)
    case 'note':
      return workspacePath(wsSlug, `/notes/${id}`)
    case 'chat_session':
      return workspacePath(wsSlug, `/chat/${id}`)
    case 'file':
      // CodePage opens the file history drawer for ?file=
      return workspacePath(wsSlug, `/code?file=${encodeURIComponent(id)}`)
    default:
      return null
  }
}

/** Short display name of an anchor id (last path segment for paths). */
export function anchorName(anchor: Pick<NoteAnchor, 'entity_type' | 'entity_id'>): string {
  const id = anchor.entity_id
  if (anchor.entity_type === 'file' && id.includes('/')) return id.split('/').pop() || id
  return id
}

// ── Extended note fields (returned by GET /notes/:id, not in the base type) ──

export type NoteMemoryHorizon = 'ephemeral' | 'operational' | 'consolidated'

export interface NoteChangeEntry {
  timestamp: string
  change_type: string
  details?: Record<string, unknown> | string | null
  actor: string
}

export interface NoteAssertionResult {
  passed: boolean
  message: string
  checked_at: string
}

export interface NoteDetail extends Note {
  last_confirmed_by?: string | null
  energy?: number
  last_activated?: string | null
  activation_count?: number
  reactivation_count?: number
  last_reactivated?: string | null
  freshness_pinged_at?: string | null
  scar_intensity?: number
  memory_horizon?: NoteMemoryHorizon
  changes?: NoteChangeEntry[]
  assertion_rule?: { check_type: string; target: string; file_pattern?: string | null; on_violation?: string } | null
  last_assertion_result?: NoteAssertionResult | null
  updated_at?: string
}

export const MEMORY_HORIZON_TEXT: Record<NoteMemoryHorizon, { label: string; explain: string }> = {
  ephemeral: {
    label: 'Ephemeral',
    explain: 'Short-lived: archived automatically after 48 h unless an agent uses it again.',
  },
  operational: {
    label: 'Operational',
    explain: 'Working knowledge: kept while it is used, promoted to permanent when used often or confirmed.',
  },
  consolidated: {
    label: 'Consolidated',
    explain: 'Permanent knowledge: core of the knowledge base, never archived automatically.',
  },
}

export const pct = (v: number | undefined | null) => `${Math.round(Math.max(0, Math.min(1, v ?? 0)) * 100)}%`

/** Plain-language reading of the energy score (0–1). */
export function energyText(energy: number | undefined): string {
  const e = energy ?? 1
  if (e >= 0.7) return 'Alive — used recently, strongly surfaced to agents.'
  if (e >= 0.3) return 'Fading — not used for a while, surfaced less often.'
  return 'Dormant — rarely surfaced; confirm it or let it fade out.'
}

/** Plain-language reading of the staleness score (0–1). */
export function stalenessText(staleness: number): string {
  if (staleness < 0.3) return 'Fresh — recently confirmed and its code has not moved much.'
  if (staleness < 0.6) return 'Ageing — the code it describes changed since it was last confirmed.'
  return 'Stale — likely out of date: confirm it, edit it or supersede it.'
}

export const CHANGE_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Content updated',
  confirmed: 'Confirmed as valid',
  status_changed: 'Status changed',
  migrated: 'Migrated to a renamed entity',
  anchor_added: 'Linked to an entity',
  anchor_removed: 'Unlinked from an entity',
  superseded: 'Superseded',
  promoted: 'Memory promoted',
}

/** One-line summary of a change's details (`{from: 'active', to: 'stale'}` → `active → stale`). */
export function changeDetailsText(details: NoteChangeEntry['details']): string | null {
  if (!details) return null
  if (typeof details === 'string') return details
  const d = details as Record<string, unknown>
  if (d.from !== undefined && d.to !== undefined) return `${String(d.from)} → ${String(d.to)}`
  if (typeof d.reason === 'string') return d.reason
  const parts = Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
  return parts.length ? parts.join(' · ') : null
}
