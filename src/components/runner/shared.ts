/**
 * Shared helpers and status metadata for runner components (runner
 * dashboard, pipeline list, plan run history).
 */

import type { ActiveAgentSnapshot, PlanRun } from '@/services/runner'
import type { AgentExecution } from '@/types'
import type { StatusTone } from '@/components/ui/statusMeta'
import { costReport, formatUsd2, type CostReport } from '@/utils/cost'
import { activeTranslator, type MessageKey } from '@/i18n'

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

/** Labels are keys: read in the language on screen at the moment a status is shown. */
const statusConfig: Record<AgentExecution['status'], Omit<StatusStyle, 'label'> & { labelKey: MessageKey }> = {
  running:     { labelKey: 'siteRest.runner.execState.running',     bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400',   pulse: true },
  completed:   { labelKey: 'siteRest.runner.execState.completed',   bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:      { labelKey: 'siteRest.runner.execState.failed',      bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
  timeout:     { labelKey: 'siteRest.runner.execState.timeout',     bg: 'bg-amber-500/15',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  // Left `running` by a process that is gone: whether it finished is unknown.
  interrupted: { labelKey: 'siteRest.runner.execState.interrupted', bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
}

/** A status this UI does not know is shown as it is, never as `running`. */
const UNKNOWN_STATUS_STYLE: Omit<StatusStyle, 'label'> = {
  bg: 'bg-gray-500/15',
  text: 'text-gray-400',
  dot: 'bg-gray-400',
}

export function statusStyle(status: string): StatusStyle {
  const config = (statusConfig as Record<string, (typeof statusConfig)[AgentExecution['status']]>)[status]
  if (!config) return { label: status, ...UNKNOWN_STATUS_STYLE }
  const { labelKey, ...style } = config
  return { ...style, label: activeTranslator().t(labelKey) }
}

/** `Manual` · `Chat` · `Schedule` · `Webhook` · `Event` — how a plan run was started. */
export function planRunTriggerLabel(triggered_by: PlanRun['triggered_by']): string {
  const t = activeTranslator().t
  if (typeof triggered_by === 'string') {
    return triggered_by ? triggered_by.charAt(0).toUpperCase() + triggered_by.slice(1) : t('siteRest.runner.trigger.unknown')
  }
  if ('chat' in triggered_by) return t('siteRest.runner.trigger.chat')
  if ('schedule' in triggered_by) return t('siteRest.runner.trigger.schedule')
  if ('webhook' in triggered_by) return t('siteRest.runner.trigger.webhook')
  if ('event' in triggered_by) return t('siteRest.runner.trigger.event')
  return t('siteRest.runner.trigger.unknown')
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

/** Table entries hold the key of the label, not the label: it is read when the status is asked for. */
interface ToneMetaKey extends Omit<ToneMeta, 'label'> {
  labelKey: MessageKey
}

const RUN_META: Record<string, ToneMetaKey> = {
  running: { labelKey: 'siteRest.runner.runState.running', tone: 'progress', live: true },
  completed: { labelKey: 'siteRest.runner.runState.completed', tone: 'success' },
  failed: { labelKey: 'siteRest.runner.runState.failed', tone: 'danger' },
  cancelled: { labelKey: 'siteRest.runner.runState.cancelled', tone: 'muted' },
  budget_exceeded: { labelKey: 'siteRest.runner.runState.budgetExceeded', tone: 'warning' },
  interrupted: { labelKey: 'siteRest.runner.runState.interrupted', tone: 'warning' },
}

const AGENT_META: Record<string, ToneMetaKey> = {
  spawning: { labelKey: 'siteRest.runner.agentState.starting', tone: 'progress', live: true },
  running: { labelKey: 'siteRest.runner.agentState.running', tone: 'progress', live: true },
  verifying: { labelKey: 'siteRest.runner.agentState.verifying', tone: 'progress', live: true },
  completed: { labelKey: 'siteRest.runner.agentState.completed', tone: 'success' },
  failed: { labelKey: 'siteRest.runner.agentState.failed', tone: 'danger' },
  interrupted: { labelKey: 'siteRest.runner.agentState.interrupted', tone: 'warning' },
}

const WAVE_META: Record<WaveStatus, ToneMetaKey> = {
  active: { labelKey: 'siteRest.runner.waveState.active', tone: 'progress', live: true },
  completed: { labelKey: 'siteRest.runner.waveState.completed', tone: 'success' },
  failed: { labelKey: 'siteRest.runner.waveState.failed', tone: 'danger' },
  pending: { labelKey: 'siteRest.runner.waveState.waiting', tone: 'neutral' },
  partial: { labelKey: 'siteRest.runner.waveState.partial', tone: 'warning' },
}

function metaOf(entry: ToneMetaKey): ToneMeta {
  const { labelKey, ...rest } = entry
  return { ...rest, label: activeTranslator().t(labelKey) }
}

/** Plan run / runner run status (`running`, `completed`, `failed`, `cancelled`, `budget_exceeded`, `interrupted`). */
export function runStateMeta(status: string | null | undefined): ToneMeta {
  const entry = RUN_META[status ?? '']
  if (entry) return metaOf(entry)
  return { label: status ? status.replace(/_/g, ' ') : activeTranslator().t('siteRest.runner.runState.unknown'), tone: 'neutral' }
}

export function agentStateMeta(status: string | null | undefined): ToneMeta {
  const entry = AGENT_META[status ?? '']
  if (entry) return metaOf(entry)
  return { label: status ?? activeTranslator().t('siteRest.runner.agentState.unknown'), tone: 'neutral' }
}

export function waveStateMeta(status: WaveStatus): ToneMeta {
  return metaOf(WAVE_META[status])
}
