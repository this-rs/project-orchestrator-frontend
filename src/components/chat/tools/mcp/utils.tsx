/**
 * Shared utility components for MCP tool sub-renderers.
 *
 * Reusable building blocks: badges, fields, tables, progress bars, etc.
 * All styled for the dark theme with consistent color scheme.
 */

/* eslint-disable react-refresh/only-export-components */

import { Link } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Entity quick-link — maps entity types to frontend routes
// ---------------------------------------------------------------------------

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  plan: (id) => `/plans/${id}`,
  task: (id) => `/tasks/${id}`,
  project: (slug) => `/projects/${slug}`,
  milestone: (id) => `/milestones/${id}`,
  project_milestone: (id) => `/project-milestones/${id}`,
  workspace: (slug) => `/workspaces/${slug}`,
  release: (id) => `/plans/${id}`, // no dedicated page, link to parent
  note: () => `/notes`,
}

export function EntityLink({ entityType, id, children }: {
  entityType: string
  id: string
  children: React.ReactNode
}) {
  const routeFn = ENTITY_ROUTES[entityType]
  if (!routeFn || !id) return <>{children}</>
  return (
    <Link
      to={routeFn(id)}
      className="hover:text-indigo-400 hover:underline decoration-indigo-400/30 underline-offset-2 transition-colors"
    >
      {children}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Status badge — consistent color mapping across all entity types
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  // Plan statuses
  draft: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  approved: 'bg-blue-900/40 text-blue-400 border-blue-700/30',
  in_progress: 'bg-indigo-900/40 text-indigo-400 border-indigo-700/30',
  completed: 'bg-green-900/40 text-green-400 border-green-700/30',
  cancelled: 'bg-gray-700/40 text-gray-500 border-gray-600/30',
  // Task statuses
  pending: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  blocked: 'bg-amber-900/40 text-amber-400 border-amber-700/30',
  failed: 'bg-red-900/40 text-red-400 border-red-700/30',
  // Step statuses
  skipped: 'bg-gray-700/40 text-gray-500 border-gray-600/30',
  // Milestone
  planned: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  open: 'bg-blue-900/40 text-blue-400 border-blue-700/30',
  closed: 'bg-gray-700/40 text-gray-500 border-gray-600/30',
  // Release
  released: 'bg-green-900/40 text-green-400 border-green-700/30',
  // Note
  active: 'bg-green-900/40 text-green-400 border-green-700/30',
  needs_review: 'bg-amber-900/40 text-amber-400 border-amber-700/30',
  stale: 'bg-orange-900/40 text-orange-400 border-orange-700/30',
  obsolete: 'bg-red-900/40 text-red-400 border-red-700/30',
  archived: 'bg-gray-700/40 text-gray-500 border-gray-600/30',
  // Impact levels
  low: 'bg-green-900/40 text-green-400 border-green-700/30',
  medium: 'bg-amber-900/40 text-amber-400 border-amber-700/30',
  high: 'bg-orange-900/40 text-orange-400 border-orange-700/30',
  critical: 'bg-red-900/40 text-red-400 border-red-700/30',
}

export function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? 'bg-gray-700/50 text-gray-400 border-gray-600/30'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Priority indicator
// ---------------------------------------------------------------------------

export function PriorityBadge({ priority }: { priority: number }) {
  const color =
    priority >= 9 ? 'text-red-400' :
    priority >= 7 ? 'text-orange-400' :
    priority >= 5 ? 'text-amber-400' :
    priority >= 3 ? 'text-blue-400' :
    'text-gray-500'
  return <span className={`text-[10px] font-mono ${color}`}>P{priority}</span>
}

// ---------------------------------------------------------------------------
// Tag pills
// ---------------------------------------------------------------------------

export function TagList({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-gray-400 border border-white/[0.04]"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Key-value row (label: value)
// ---------------------------------------------------------------------------

export function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-600 shrink-0 select-none min-w-[5rem]">{label}</span>
      <span className="text-gray-400 break-all">{children}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

export function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-600 py-1">
      {children}
      {count != null && (
        <span className="px-1 py-0.5 rounded bg-white/[0.04] text-gray-500 normal-case tracking-normal">
          {count}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-indigo-500' : 'bg-gray-700'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 shrink-0 font-mono">{completed}/{total}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Time formatter — relative if recent, absolute otherwise
// ---------------------------------------------------------------------------

export function TimeAgo({ date }: { date: string | null | undefined }) {
  if (!date) return <span className="text-gray-600 italic">—</span>

  let text: string
  let isoString: string | undefined
  try {
    const d = new Date(date)
    isoString = d.toISOString()
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMin / 60)
    const diffD = Math.floor(diffH / 24)

    if (diffMin < 1) text = 'just now'
    else if (diffMin < 60) text = `${diffMin}m ago`
    else if (diffH < 24) text = `${diffH}h ago`
    else if (diffD < 7) text = `${diffD}d ago`
    else text = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return <span className="text-gray-600">{date}</span>
  }

  return <span className="text-gray-500" title={isoString}>{text}</span>
}

// ---------------------------------------------------------------------------
// Monospace ID (truncated UUID)
// ---------------------------------------------------------------------------

export function ShortId({ id, entityType }: { id: string; entityType?: string }) {
  if (!id) return null
  const short = id.length > 12 ? id.slice(0, 8) + '...' : id
  const inner = (
    <span className="font-mono text-[10px] text-gray-600" title={id}>
      {short}
    </span>
  )
  if (entityType) return <EntityLink entityType={entityType} id={id}>{inner}</EntityLink>
  return inner
}

// ---------------------------------------------------------------------------
// Pagination footer
// ---------------------------------------------------------------------------

export function PaginationInfo({ total, offset, shown }: {
  total?: number; offset?: number; limit?: number; shown: number
}) {
  if (total == null || total === 0) return null
  return (
    <div className="text-[10px] text-gray-600 pt-1">
      showing {shown} of {total}
      {offset != null && offset > 0 && <span> (offset {offset})</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Container — wrapper for MCP renderer content
// ---------------------------------------------------------------------------

export function McpContainer({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 text-xs">{children}</div>
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------

export function ErrorDisplay({ content }: { content: string }) {
  return (
    <div className="px-3 py-2 bg-red-950/20 border border-red-800/30 rounded-md text-xs text-red-400 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
      {content.length > 1500 ? content.slice(0, 1500) + '\n... (truncated)' : content}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parse JSON result safely
// ---------------------------------------------------------------------------

export function parseResult(content: string | undefined): unknown {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Truncate helper
// ---------------------------------------------------------------------------

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}

// ---------------------------------------------------------------------------
// File path basename
// ---------------------------------------------------------------------------

export function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

// ---------------------------------------------------------------------------
// Infer entity type from field name or action name
// ---------------------------------------------------------------------------

const FIELD_ENTITY_MAP: Record<string, string> = {
  plan_id: 'plan',
  task_id: 'task',
  project_id: 'project',
  milestone_id: 'milestone',
  release_id: 'release',
  note_id: 'note',
  workspace_id: 'workspace',
  step_id: 'step',
  constraint_id: 'plan', // constraints live on plan pages
  decision_id: 'task',   // decisions live on task pages
  session_id: 'plan',    // chat sessions don't have a detail page
}

/**
 * Infer entity type from a field name like "plan_id" → "plan"
 */
export function inferEntityType(fieldName: string): string | null {
  return FIELD_ENTITY_MAP[fieldName] ?? null
}

const ACTION_ENTITY_RE = /^(?:create|get|update|delete|link|unlink|add|remove|sync|start|stop|list|search)_(.+?)(?:_to_.*|_from_.*)?$/

/**
 * Infer entity type from an action name like "create_plan" → "plan",
 * "add_task_to_milestone" → "task", "update_task" → "task"
 */
export function inferEntityTypeFromAction(action: string): string | null {
  const m = ACTION_ENTITY_RE.exec(action)
  if (!m) return null
  const raw = m[1]
  // Normalize plurals and known aliases
  const aliases: Record<string, string> = {
    plans: 'plan', tasks: 'task', projects: 'project', notes: 'note',
    milestones: 'milestone', releases: 'release', steps: 'step',
    constraints: 'plan', decisions: 'task', workspaces: 'workspace',
    components: 'workspace', resources: 'workspace',
    plan_status: 'plan', plan_to_project: 'plan',
    task_dependencies: 'task', task_to_milestone: 'task', task_to_release: 'task',
    commit_to_task: 'task', commit_to_plan: 'plan',
    note_to_entity: 'note', resource_to_project: 'project',
    component_dependency: 'workspace', project_to_workspace: 'project',
    commit: 'plan',
  }
  return aliases[raw] ?? FIELD_ENTITY_MAP[`${raw}_id`] ?? raw
}

// ---------------------------------------------------------------------------
// LinkedId — ShortId with automatic EntityLink based on field name
// ---------------------------------------------------------------------------

/**
 * Smart ID display: infers entity type from field name, wraps in EntityLink.
 * Usage: <LinkedId field="plan_id" value={planId} />
 */
export function LinkedId({ field, value }: { field: string; value: string }) {
  if (!value) return null
  const entityType = inferEntityType(field)
  return <ShortId id={value} entityType={entityType ?? undefined} />
}

// ---------------------------------------------------------------------------
// Action badge — colored badge for MCP action type
// ---------------------------------------------------------------------------

const ACTION_BADGE_COLORS: Record<string, string> = {
  create: 'bg-green-900/40 text-green-400 border-green-800/30',
  update: 'bg-blue-900/40 text-blue-400 border-blue-800/30',
  delete: 'bg-red-900/40 text-red-400 border-red-800/30',
  link: 'bg-indigo-900/40 text-indigo-400 border-indigo-800/30',
  unlink: 'bg-orange-900/40 text-orange-400 border-orange-800/30',
  add: 'bg-indigo-900/40 text-indigo-400 border-indigo-800/30',
  remove: 'bg-orange-900/40 text-orange-400 border-orange-800/30',
  get: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  list: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  search: 'bg-purple-900/40 text-purple-400 border-purple-800/30',
  sync: 'bg-cyan-900/40 text-cyan-400 border-cyan-800/30',
  start: 'bg-green-900/40 text-green-400 border-green-800/30',
  stop: 'bg-red-900/40 text-red-400 border-red-800/30',
  find: 'bg-purple-900/40 text-purple-400 border-purple-800/30',
  analyze: 'bg-purple-900/40 text-purple-400 border-purple-800/30',
  confirm: 'bg-green-900/40 text-green-400 border-green-800/30',
  invalidate: 'bg-red-900/40 text-red-400 border-red-800/30',
  supersede: 'bg-amber-900/40 text-amber-400 border-amber-800/30',
  chat: 'bg-indigo-900/40 text-indigo-400 border-indigo-800/30',
}

/**
 * Extracts the verb (action type) from an MCP action name.
 * "create_plan" → "create", "add_task_to_milestone" → "add", etc.
 */
export function extractActionVerb(action: string): string {
  const verb = action.split('_')[0]
  return verb
}

/**
 * Colored badge for MCP action verb (CREATE, UPDATE, DELETE, etc.)
 */
export function ActionBadge({ action }: { action: string }) {
  const verb = extractActionVerb(action)
  const colors = ACTION_BADGE_COLORS[verb] ?? 'bg-gray-700/50 text-gray-400 border-gray-600/30'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase ${colors}`}>
      {verb}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Search term highlighting
// ---------------------------------------------------------------------------

/**
 * Highlight search terms in text. Returns React nodes with matches wrapped
 * in amber highlight spans. Case-insensitive.
 */
export function highlightSearchTerms(text: string, query: string | undefined | null): React.ReactNode {
  if (!query || !text) return text
  // Split query into terms, escape regex
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return text

  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)

  if (parts.length <= 1) return text

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-amber-500/30 text-amber-300 rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

import { useState } from 'react'

/**
 * Collapsible list: shows first `limit` items, with expand toggle.
 */
export function CollapsibleList<T>({ items, limit = 3, renderItem, label = 'items' }: {
  items: T[]
  limit?: number
  renderItem: (item: T, index: number) => React.ReactNode
  label?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const showAll = expanded || items.length <= limit
  const visible = showAll ? items : items.slice(0, limit)
  const remaining = items.length - limit

  return (
    <>
      {visible.map((item, i) => renderItem(item, i))}
      {!showAll && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors py-0.5"
        >
          + {remaining} more {label}
        </button>
      )}
      {expanded && items.length > limit && (
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors py-0.5"
        >
          show less
        </button>
      )}
    </>
  )
}
