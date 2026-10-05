/**
 * Shared helpers and status metadata for runner components (runner
 * dashboard, pipeline list, plan run history).
 */

import type { ActiveAgentSnapshot, PlanRun } from '@/services/runner'
import type { AgentExecution } from '@/types'
import type { StatusTone } from '@/components/ui/statusMeta'
import { costReport, formatUsd2, type CostReport } from '@/utils/cost'

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** `mm:ss` live timer of an agent / run. */
export function formatElapsed(secs: number | undefined | null): string {
  const v = secs ?? 0
  const m = Math.floor(v / 60)
  const s = Math.floor(v % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** A KNOWN amount. A cost that may be unknown goes through `runCost` + `CostDisplay`, never through a `?? 0`. */
export function formatCost(usd: number): string {
  return formatUsd2(usd)
}

/** Cost of a run, an agent or an execution, with its basis (`reported` when the record names none). */
export function runCost(record: { cost_usd?: number | null; cost_basis?: unknown; input_tokens?: number | null; output_tokens?: number | null }): CostReport | null {
  // The record doubles as the usage: an execution without a price still shows its tokens.
  return costReport(record.cost_usd, record.cost_basis, record)
}

/** Elapsed seconds of a plan run (until now while it is still running). */
export function planRunElapsedSecs(run: Pick<PlanRun, 'started_at' | 'completed_at'>, now = Date.now()): number {
  const start = new Date(run.started_at).getTime()
  const end = run.completed_at ? new Date(run.completed_at).getTime() : now
  return Math.max(0, (end - start) / 1000)
}

/**
 * Seconds shown for a finished execution: the recorded duration, else the span
 * between start and `completed_at` (an interrupted execution has no duration of its own).
 */
export function finalDurationSecs(execution: Pick<AgentExecution, 'started_at' | 'completed_at' | 'duration_secs'>): number | undefined {
  if (execution.duration_secs > 0) return execution.duration_secs
  if (!execution.completed_at) return undefined
  const span = (new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()) / 1000
  return Number.isFinite(span) ? Math.max(0, Math.floor(span)) : undefined
}

// ---------------------------------------------------------------------------
// Agent execution status (AgentExecutionDetail)
// ---------------------------------------------------------------------------

export interface StatusStyle {
  label: string
  bg: string
  text: string
  dot: string
  pulse?: boolean
}

const statusConfig: Record<AgentExecution['status'], StatusStyle> = {
  running:     { label: 'Running',     bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400',   pulse: true },
  completed:   { label: 'Completed',   bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:      { label: 'Failed',      bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
  timeout:     { label: 'Timeout',     bg: 'bg-amber-500/15',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  // Left `running` by a process that is gone: whether it finished is unknown.
  interrupted: { label: 'Interrupted', bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
}

/** A status this UI does not know is shown as it is, never as `running`. */
const UNKNOWN_STATUS_STYLE: Omit<StatusStyle, 'label'> = {
  bg: 'bg-gray-500/15',
  text: 'text-gray-400',
  dot: 'bg-gray-400',
}

export function statusStyle(status: string): StatusStyle {
  return (statusConfig as Record<string, StatusStyle>)[status] ?? { label: status, ...UNKNOWN_STATUS_STYLE }
}

/** `Manual` · `Chat` · `Schedule` · `Webhook` · `Event` — how a plan run was started. */
export function planRunTriggerLabel(triggered_by: PlanRun['triggered_by']): string {
  if (typeof triggered_by === 'string') {
    return triggered_by ? triggered_by.charAt(0).toUpperCase() + triggered_by.slice(1) : 'Unknown'
  }
  if ('chat' in triggered_by) return 'Chat'
  if ('schedule' in triggered_by) return 'Schedule'
  if ('webhook' in triggered_by) return 'Webhook'
  if ('event' in triggered_by) return 'Event'
  return 'Unknown'
}

// ---------------------------------------------------------------------------
// Agent status config (legacy, still used by InlineConversation)
// ---------------------------------------------------------------------------

type AgentStatus = ActiveAgentSnapshot['status']

export const agentStatusConfig: Record<AgentStatus, { label: string; bg: string; text: string; dot: string }> = {
  spawning:   { label: 'Spawning',   bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  running:    { label: 'Running',    bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  verifying:  { label: 'Verifying',  bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  completed:  { label: 'Completed',  bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:     { label: 'Failed',     bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
  interrupted: { label: 'Interrupted', bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
}

/** Maps agent status to Badge variant for the UI Badge component. */
export const agentStatusBadgeVariant: Record<AgentStatus, 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple'> = {
  spawning:  'warning',
  running:   'info',
  verifying: 'purple',
  completed: 'success',
  failed:    'error',
  interrupted: 'warning',
}

// ---------------------------------------------------------------------------
// Wave status
// ---------------------------------------------------------------------------

export type WaveStatus = 'active' | 'completed' | 'failed' | 'pending' | 'partial'

export function getWaveStatus(agents: ActiveAgentSnapshot[]): WaveStatus {
  if (agents.length === 0) return 'pending'
  const hasRunning = agents.some(a => a.status === 'running' || a.status === 'spawning' || a.status === 'verifying')
  if (hasRunning) return 'active'
  const allDone = agents.every(a => a.status === 'completed' || a.status === 'failed')
  if (allDone) {
    const hasFailed = agents.some(a => a.status === 'failed')
    if (hasFailed) return 'failed'
    return 'completed'
  }
  return 'partial'
}

// ---------------------------------------------------------------------------
// Design-system status meta (dot + text, see components/ui/DESIGN.md §4)
// ---------------------------------------------------------------------------

export interface ToneMeta {
  label: string
  tone: StatusTone
  /** Something is still going on → the dot pulses (temporal motion). */
  live?: boolean
}

const RUN_META: Record<string, ToneMeta> = {
  running: { label: 'Running', tone: 'progress', live: true },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  budget_exceeded: { label: 'Budget exceeded', tone: 'warning' },
  interrupted: { label: 'Interrupted', tone: 'warning' },
}

const AGENT_META: Record<string, ToneMeta> = {
  spawning: { label: 'Starting', tone: 'progress', live: true },
  running: { label: 'Running', tone: 'progress', live: true },
  verifying: { label: 'Verifying', tone: 'progress', live: true },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  interrupted: { label: 'Interrupted', tone: 'warning' },
}

const WAVE_META: Record<WaveStatus, ToneMeta> = {
  active: { label: 'Running', tone: 'progress', live: true },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Has failures', tone: 'danger' },
  pending: { label: 'Waiting', tone: 'neutral' },
  partial: { label: 'Partial', tone: 'warning' },
}

/** Plan run / runner run status (`running`, `completed`, `failed`, `cancelled`, `budget_exceeded`, `interrupted`). */
export function runStateMeta(status: string | null | undefined): ToneMeta {
  return RUN_META[status ?? ''] ?? { label: status ? status.replace(/_/g, ' ') : 'Unknown', tone: 'neutral' }
}

export function agentStateMeta(status: string | null | undefined): ToneMeta {
  return AGENT_META[status ?? ''] ?? { label: status ?? 'Unknown', tone: 'neutral' }
}

export function waveStateMeta(status: WaveStatus): ToneMeta {
  return WAVE_META[status]
}
