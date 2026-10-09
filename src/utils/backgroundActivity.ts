/**
 * Pure view-model for background activity in the chat.
 *
 * Background ticks arrive as loosely-typed payloads: `workflow` system events
 * (task_id, workflow_name, workflow_progress[], usage, status), Bash / Monitor
 * `background_output` text, Task sub-agent notifications (sometimes JSON,
 * sometimes `<task-notification>` tags). This module turns them into one
 * normalised `ActivityModel` so the UI never has to show raw JSON:
 *
 * - `classifyActivity`  — workflow | shell | monitor | agent | generic
 * - `deriveStatus`      — running | queued | done | failed | cancelled | ended
 * - `extractParams`     — human-readable key/value parameters
 * - `buildActivity`     — everything the renderer needs, in one object
 */
import type { BackgroundActivityMetadata, BackgroundOutputEntry, ContentBlock } from '@/types'
import type { StatusTone } from '@/components/ui/statusMeta'
import { tr } from '@/i18n/lazy'

export type ActivityKind = 'workflow' | 'shell' | 'monitor' | 'agent' | 'generic'
export type ActivityStatus = 'running' | 'queued' | 'done' | 'failed' | 'cancelled' | 'ended'

/** Status of an activity: the label is read when used, so it follows the language on screen. */
const statusMeta = (status: ActivityStatus, tone: StatusTone): { label: string; tone: StatusTone } => ({
  get label() {
    return tr(`activity.status.${status}`)
  },
  tone,
})

export const ACTIVITY_STATUS_META: Record<ActivityStatus, { label: string; tone: StatusTone }> = {
  running: statusMeta('running', 'progress'),
  queued: statusMeta('queued', 'neutral'),
  done: statusMeta('done', 'success'),
  failed: statusMeta('failed', 'danger'),
  cancelled: statusMeta('cancelled', 'muted'),
  ended: statusMeta('ended', 'muted'),
}

/** An activity with no terminal signal and no tick for this long is considered ended. */
export const STALE_AFTER_MS = 5 * 60_000

const RUNNING = new Set(['start', 'started', 'running', 'in_progress', 'in-progress', 'active', 'working', 'executing', 'progress'])
const QUEUED = new Set(['pending', 'queued', 'waiting', 'scheduled', 'todo', 'blocked'])
const DONE = new Set(['done', 'completed', 'complete', 'success', 'succeeded', 'finished', 'end', 'ended'])
const FAILED = new Set(['failed', 'failure', 'error', 'errored', 'killed', 'timeout', 'timed_out'])
const CANCELLED = new Set(['cancelled', 'canceled', 'stopped', 'aborted', 'skipped'])

/** Map any free-form state string onto the small `ActivityStatus` vocabulary. */
export function normalizeState(raw: unknown): ActivityStatus | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  if (RUNNING.has(v)) return 'running'
  if (QUEUED.has(v)) return 'queued'
  if (DONE.has(v)) return 'done'
  if (FAILED.has(v)) return 'failed'
  if (CANCELLED.has(v)) return 'cancelled'
  return undefined
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export type Fields = Record<string, unknown>

function isRecord(v: unknown): v is Fields {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** `task_progress` / `lastToolName` → `Task progress` / `Last tool name`. */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const LIFECYCLE_KEYS = {
  task_started: 'activity.lifecycle.started',
  task_progress: 'activity.lifecycle.progress',
  task_updated: 'activity.lifecycle.updated',
  task_notification: 'activity.lifecycle.finished',
} as const

/** Human label of a workflow lifecycle subtype (`task_progress` → `Progress`). */
export function subtypeLabel(subtype: string): string {
  return subtype in LIFECYCLE_KEYS ? tr(LIFECYCLE_KEYS[subtype as keyof typeof LIFECYCLE_KEYS]) : humanizeKey(subtype)
}

// ---------------------------------------------------------------------------
// Content parsing — never surface raw JSON / XML to the user
// ---------------------------------------------------------------------------

export interface ParsedContent {
  /** Structured fields when the content was a JSON object or `<tag>value</tag>` list. */
  fields?: Fields
  /** Plain text otherwise (empty when the content was structured). */
  text: string
}

const TAG_RE = /<([a-z][a-z0-9-]*)>([\s\S]*?)<\/\1>/gi

export function parseContent(content: string): ParsedContent {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isRecord(parsed)) return { fields: parsed, text: '' }
    } catch {
      // not JSON — fall through to plain text
    }
  }
  if (trimmed.startsWith('<')) {
    // Unwrap a single envelope (`<task-notification>…</task-notification>`).
    const envelope = /^<([a-z][a-z0-9-]*)>\s*(<[\s\S]*>)\s*<\/\1>$/i.exec(trimmed)
    const inner = envelope ? envelope[2] : trimmed
    const fields: Fields = {}
    for (const m of inner.matchAll(TAG_RE)) {
      fields[m[1].toLowerCase().replace(/-/g, '_')] = m[2].trim()
    }
    if (Object.keys(fields).length > 0) return { fields, text: '' }
  }
  return { text: content }
}

/** Keys never worth showing as a parameter (identifiers of the transport, big blobs). */
const HIDDEN_KEYS = new Set([
  'type', 'subtype', 'uuid', 'session_id', 'workflow_progress', 'usage', 'data', 'patch',
  'tool_use_id', 'parent_tool_use_id', 'received_at',
])

function formatScalar(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() === '' ? undefined : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

export interface KeyValue {
  label: string
  value: string
  mono?: boolean
}

/**
 * Flatten a structured payload into readable rows: scalars as-is, scalar
 * arrays joined, one nested level dotted (`usage · total tokens`), arrays of
 * objects summarised as a count. Never returns JSON text.
 */
export function flattenFields(fields: Fields, hidden: ReadonlySet<string> = HIDDEN_KEYS, depth = 0): KeyValue[] {
  const rows: KeyValue[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (hidden.has(key) || value === null || value === undefined) continue
    const label = humanizeKey(key)
    const scalar = formatScalar(value)
    if (scalar !== undefined) {
      rows.push({ label, value: scalar, mono: /(^|_)(id|file|path|command|cmd)$/.test(key) })
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue
      if (value.every((x) => formatScalar(x) !== undefined)) {
        rows.push({ label, value: value.map((x) => formatScalar(x)).join(', ') })
      } else {
        rows.push({ label, value: `${value.length} item${value.length === 1 ? '' : 's'}` })
      }
    } else if (isRecord(value) && depth < 1) {
      for (const inner of flattenFields(value, hidden, depth + 1)) {
        rows.push({ ...inner, label: `${label} · ${inner.label.toLowerCase()}` })
      }
    }
  }
  return rows
}

/** One short line summarising structured fields (`status completed · summary …`). */
export function summarizeFields(fields: Fields, max = 3): string {
  return flattenFields(fields)
    .slice(0, max)
    .map((kv) => `${kv.label.toLowerCase()} ${kv.value}`)
    .join(' · ')
}

// ---------------------------------------------------------------------------
// Workflow fan-out
// ---------------------------------------------------------------------------

export interface WorkflowAgent {
  key: string
  name: string
  state: ActivityStatus
  /** Last tool / current step, when the payload carries one. */
  detail?: string
}

/** Per-agent state of a workflow's `workflow_progress[]`. */
export function extractWorkflowAgents(fields: Fields): WorkflowAgent[] {
  const raw = fields.workflow_progress
  if (!Array.isArray(raw)) return []
  return raw.map((item, i) => {
    const rec = isRecord(item) ? item : {}
    const index = num(rec.index) ?? i
    const name =
      str(rec.name) ?? str(rec.label) ?? str(rec.description) ?? str(rec.agent) ?? str(rec.subagent_type) ?? `Agent ${index + 1}`
    const state = normalizeState(rec.state) ?? normalizeState(rec.status) ?? 'running'
    const detail = str(rec.last_tool_name) ?? str(rec.tool) ?? str(rec.message) ?? str(rec.summary)
    return { key: `${index}-${i}`, name, state, detail }
  })
}

export interface ActivityUsage {
  tokens?: number
  toolUses?: number
  durationMs?: number
}

export function extractUsage(fields: Fields): ActivityUsage | undefined {
  const u = isRecord(fields.usage) ? fields.usage : undefined
  if (!u) return undefined
  const usage: ActivityUsage = {
    tokens: num(u.total_tokens),
    toolUses: num(u.tool_uses),
    durationMs: num(u.duration_ms),
  }
  return usage.tokens === undefined && usage.toolUses === undefined && usage.durationMs === undefined ? undefined : usage
}

/** Aggregate a workflow's agents into one status (undefined when there are none). */
function statusFromAgents(agents: WorkflowAgent[]): ActivityStatus | undefined {
  if (agents.length === 0) return undefined
  if (agents.some((a) => a.state === 'running')) return 'running'
  const settled = agents.filter((a) => a.state !== 'queued')
  if (settled.length < agents.length) return settled.length === 0 ? 'queued' : 'running'
  if (agents.some((a) => a.state === 'failed')) return 'failed'
  if (agents.every((a) => a.state === 'cancelled')) return 'cancelled'
  return 'done'
}

// ---------------------------------------------------------------------------
// Classification + status
// ---------------------------------------------------------------------------

const SHELL_SOURCES = /^(bash|bashoutput|shell|killbash)$/i
const AGENT_SOURCES = /^(task|agent|subagent|sub-agent)$/i

export interface ClassifyInput {
  source?: string
  toolName?: string
  subagentType?: string
  fields: Fields
}

export function classifyActivity({ source, toolName, subagentType, fields }: ClassifyInput): ActivityKind {
  const names = [source, toolName].filter((n): n is string => !!n)
  if (
    Array.isArray(fields.workflow_progress) ||
    str(fields.workflow_name) ||
    names.some((n) => /^workflow$/i.test(n))
  ) {
    return 'workflow'
  }
  if (names.some((n) => /^monitor$/i.test(n))) return 'monitor'
  if (names.some((n) => SHELL_SOURCES.test(n)) || str(fields.command) || str(fields.cmd)) return 'shell'
  if (names.some((n) => AGENT_SOURCES.test(n)) || subagentType || str(fields.subagent_type)) return 'agent'
  return 'generic'
}

export interface StatusInput {
  kind: ActivityKind
  id?: string
  fields: Fields
  agents: WorkflowAgent[]
  lastSubtype?: string
  toolState?: 'running' | 'done' | 'failed' | 'cancelled'
  /** ids of the tasks the backend still tracks; `undefined`/empty = unknown */
  activeIds?: ReadonlySet<string>
  lastAt?: string
  now?: number
}

/** Explicit signals win; otherwise fall back to the live task registry, then to recency. */
export function deriveStatus(input: StatusInput): ActivityStatus {
  const { kind, id, fields, agents, lastSubtype, toolState, activeIds, lastAt } = input
  const explicit = normalizeState(fields.status)
  if (explicit) return explicit
  if (lastSubtype === 'task_notification') return 'done'
  const fromAgents = statusFromAgents(agents)
  if (fromAgents) return fromAgents
  if (toolState === 'failed' || toolState === 'cancelled') return toolState
  if (kind !== 'workflow' && id && activeIds && activeIds.size > 0) {
    return activeIds.has(id) ? 'running' : 'ended'
  }
  if (toolState === 'running') return 'running'
  const last = lastAt ? Date.parse(lastAt) : NaN
  if (Number.isNaN(last)) return 'running'
  return (input.now ?? Date.now()) - last > STALE_AFTER_MS ? 'ended' : 'running'
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  at: string
  label: string
  detail: string
}

export interface ActivityModel {
  id: string
  kind: ActivityKind
  status: ActivityStatus
  title: string
  source: string
  command?: string
  params: KeyValue[]
  agents: WorkflowAgent[]
  usage?: ActivityUsage
  events: ActivityEvent[]
  /** Plain-text output lines (Bash / Monitor streams), oldest first. */
  outputLines: string[]
  /** Flattened structured payload for the generic renderer. */
  details: KeyValue[]
  /** Structured payload kept as the "raw" last resort. */
  raw?: Fields
  count: number
  hiddenCount: number
  startedAt?: string
  endedAt?: string
  durationMs?: number
}

export interface ActivityInput {
  id: string
  source: string
  subagentType?: string
  description?: string
  data?: Fields
  entries: BackgroundOutputEntry[]
  count?: number
  firstAt?: string
  lastAt?: string
  tool?: { name: string; input: Fields; state: 'running' | 'done' | 'failed' | 'cancelled' }
  activeIds?: ReadonlySet<string>
  now?: number
}

/** Tool-input keys shown as parameters when scalar and short. */
const MAX_PARAM_LEN = 160
const PROMPT_KEYS = new Set(['command', 'cmd', 'prompt', 'script', 'content', 'input'])

function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''
}

function pushParam(params: KeyValue[], label: string, value: string | undefined, mono = false): void {
  if (!value || params.some((p) => p.label === label)) return
  params.push({ label, value, mono })
}

/** Human-readable parameters of an activity, most identifying first. */
export function extractParams(args: {
  kind: ActivityKind
  title: string
  subagentType?: string
  description?: string
  fields: Fields
  toolInput?: Fields
}): KeyValue[] {
  const { kind, title, subagentType, description, fields, toolInput } = args
  const params: KeyValue[] = []
  const merged: Fields = { ...toolInput, ...fields }
  pushParam(params, tr('activity.param.agent'), subagentType ?? str(merged.subagent_type))
  if (kind === 'workflow') {
    const name = str(merged.workflow_name)
    if (name && name !== title) pushParam(params, tr('activity.param.workflow'), name)
  }
  const desc = description ?? str(merged.description)
  if (desc && desc !== title) pushParam(params, tr('activity.param.task'), desc)
  pushParam(params, tr('activity.param.tool'), str(merged.last_tool_name) ?? str(merged.tool_name) ?? str(merged.tool))
  pushParam(params, tr('activity.param.model'), str(merged.model))
  const exit = merged.exit_code ?? merged.exitCode
  if (typeof exit === 'number' || str(exit)) pushParam(params, tr('activity.param.exitCode'), String(exit))
  const taskId = str(merged.task_id) ?? str(merged.bash_id) ?? str(merged.shell_id)
  if (taskId) pushParam(params, tr('activity.param.taskId'), taskId, true)
  pushParam(params, tr('activity.param.outputFile'), str(merged.output_file), true)
  if (toolInput) {
    for (const [key, value] of Object.entries(toolInput)) {
      if (PROMPT_KEYS.has(key) || key === 'subagent_type' || key === 'description' || key === 'workflow_name') continue
      const s = formatScalar(value)
      if (s && s.length <= MAX_PARAM_LEN) pushParam(params, humanizeKey(key), s)
    }
  }
  return params
}

function spanMs(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined
  const ms = Date.parse(end) - Date.parse(start)
  return Number.isNaN(ms) ? undefined : Math.max(0, ms)
}

export function buildActivity(input: ActivityInput): ActivityModel {
  const { id, source, entries, tool } = input
  const parsed = entries.map((e) => ({ entry: e, content: parseContent(e.content) }))

  const fields: Fields = { ...input.data }
  for (const p of parsed) if (p.content.fields) Object.assign(fields, p.content.fields)

  const subagentType = input.subagentType ?? str(fields.subagent_type)
  const kind = classifyActivity({ source, toolName: tool?.name, subagentType, fields })
  const agents = extractWorkflowAgents(fields)
  const lastEntry = entries[entries.length - 1]
  const firstAt = input.firstAt ?? entries[0]?.received_at
  const lastAt = input.lastAt ?? lastEntry?.received_at

  const command =
    str(fields.command) ?? str(fields.cmd) ?? (tool && /^(bash|monitor)$/i.test(tool.name) ? str(tool.input.command) : undefined)
  const description = input.description ?? str(fields.description) ?? str(tool?.input.description)

  let title: string
  switch (kind) {
    case 'workflow':
      title = str(fields.workflow_name) ?? str(tool?.input.workflow_name) ?? description ?? tr('activity.title.workflow')
      break
    case 'shell':
      title = command ? firstLine(command) : (description ?? tr('activity.title.shell'))
      break
    case 'monitor':
      title = description ?? (command ? firstLine(command) : tr('activity.title.monitor'))
      break
    case 'agent':
      title = description ?? subagentType ?? tr('activity.title.agent')
      break
    default:
      title = description ?? str(fields.summary) ?? source
  }

  const status = deriveStatus({
    kind,
    id,
    fields,
    agents,
    lastSubtype: lastEntry?.subtype,
    toolState: tool?.state,
    activeIds: input.activeIds,
    lastAt,
    now: input.now,
  })

  const usage = extractUsage(fields)
  const events: ActivityEvent[] = parsed.map(({ entry, content }) => ({
    at: entry.received_at,
    label: entry.subtype ? subtypeLabel(entry.subtype) : entry.source,
    detail: content.fields ? summarizeFields(content.fields) : firstLine(content.text),
  }))
  const outputLines = parsed.flatMap(({ content }) =>
    content.text === '' ? [] : content.text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n'),
  )
  const raw = Object.keys(fields).length > 0 ? fields : undefined
  const count = input.count ?? entries.length

  const params = extractParams({ kind, title, subagentType, description, fields, toolInput: tool?.input })

  return {
    id,
    kind,
    status,
    title,
    source,
    command,
    params,
    agents,
    usage,
    events,
    outputLines,
    details: flattenFields(fields).filter((d) => d.value !== title && !params.some((p) => p.label === d.label)),
    raw,
    count,
    hiddenCount: Math.max(0, count - entries.length),
    startedAt: firstAt,
    endedAt: lastAt,
    durationMs: usage?.durationMs ?? spanMs(firstAt, lastAt),
  }
}

/** Model of an orphan `background_activity` block. */
export function buildActivityFromBlock(
  block: ContentBlock,
  ctx: { activeIds?: ReadonlySet<string>; now?: number } = {},
): ActivityModel {
  const meta = (block.metadata ?? {}) as unknown as Partial<BackgroundActivityMetadata>
  const entries = meta.entries ?? []
  return buildActivity({
    id: meta.correlation_id ?? block.id,
    source: meta.source ?? 'background',
    subagentType: meta.subagent_type,
    description: meta.description,
    data: meta.data,
    entries: entries.length > 0 ? entries : block.content ? [{ source: meta.source ?? 'background', content: block.content, received_at: meta.last_received_at ?? '' }] : [],
    count: meta.count,
    firstAt: meta.first_received_at,
    lastAt: meta.last_received_at,
    ...ctx,
  })
}

/** Model of a `tool_use` block that collected `child_outputs` (Workflow / Bash bg / Task / Monitor). */
export function buildActivityFromToolCall(
  toolUse: ContentBlock,
  result: ContentBlock | undefined,
  ctx: { activeIds?: ReadonlySet<string>; now?: number } = {},
): ActivityModel {
  const md = toolUse.metadata ?? {}
  const entries = (md.child_outputs as BackgroundOutputEntry[] | undefined) ?? []
  const toolName = (md.tool_name as string | undefined) ?? toolUse.content
  const toolInput = isRecord(md.tool_input) ? md.tool_input : {}
  const isError = result?.metadata?.is_error === true
  const isCancelled = result?.metadata?.is_cancelled === true
  return buildActivity({
    id: (md.tool_call_id as string | undefined) ?? toolUse.id,
    source: toolName,
    data: isRecord(md.child_data) ? md.child_data : undefined,
    entries,
    tool: {
      name: toolName,
      input: toolInput,
      state: isCancelled ? 'cancelled' : isError ? 'failed' : result ? 'done' : 'running',
    },
    ...ctx,
  })
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface StatusCounts {
  running: number
  queued: number
  done: number
  failed: number
  /** cancelled + ended */
  other: number
  total: number
}

export function summarizeStatuses(activities: ReadonlyArray<Pick<ActivityModel, 'status'>>): StatusCounts {
  const counts: StatusCounts = { running: 0, queued: 0, done: 0, failed: 0, other: 0, total: activities.length }
  for (const a of activities) {
    if (a.status === 'running') counts.running++
    else if (a.status === 'queued') counts.queued++
    else if (a.status === 'done') counts.done++
    else if (a.status === 'failed') counts.failed++
    else counts.other++
  }
  return counts
}

/** Progress of a workflow fan-out: settled agents / total (0–100). */
export function agentProgress(agents: WorkflowAgent[]): { settled: number; total: number; pct: number } {
  const total = agents.length
  const settled = agents.filter((a) => a.state !== 'running' && a.state !== 'queued').length
  return { settled, total, pct: total === 0 ? 0 : Math.round((settled / total) * 100) }
}

/** Last `max` lines of a stream, and how many were left out. */
export function tailLines(lines: string[], max: number): { shown: string[]; omitted: number } {
  if (lines.length <= max) return { shown: lines, omitted: 0 }
  return { shown: lines.slice(-max), omitted: lines.length - max }
}
