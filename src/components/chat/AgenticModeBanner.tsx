/**
 * AgenticModeBanner — high-visibility "agent is working in the background" indicator
 * for the chat playground.
 *
 * Distinct from DetachedRunsPanel (which collapses to a thin amber strip):
 * this banner is **always visible while at least one run is streaming** and
 * surfaces, in a single glance:
 *   - 🤖 "AGENTIC MODE" identity
 *   - Active runs count + cumulative cost + elapsed time
 *   - Live grid of agent cards (task title, status, duration, cost, PID/RAM/CPU
 *     when the backend has wired set_pid into the ChatManager spawn path)
 *   - Click on a card → opens the sub-agent's conversation
 *   - "Open dashboard" button → full RunnerDashboard for the plan
 *
 * When no runs are active, the component renders nothing — so it doesn't
 * pollute the normal chat surface.
 */

import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Eye, Square, ExternalLink, Cpu, MemoryStick } from 'lucide-react'
import { PulseIndicator } from '@/components/ui'
import { useRunnerStatus } from '@/services/runner'
import type { ActiveAgentSnapshot } from '@/services/runner'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { DetachedRun } from '@/hooks'

interface AgenticModeBannerProps {
  /** Detached runs from useDetachedRuns — banner reads `isStreaming` to decide visibility. */
  runs: DetachedRun[]
  /** Open the given sub-agent session in the conversation viewer. */
  onViewRun: (sessionId: string) => void
  /** Interrupt a streaming sub-agent session. */
  onStopRun: (sessionId: string) => void
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime()
  const secs = Math.max(0, Math.floor((Date.now() - start) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function formatCost(cost?: number | null): string {
  if (cost == null || cost <= 0) return '—'
  return `$${cost.toFixed(2)}`
}

function statusTint(status: ActiveAgentSnapshot['status']): string {
  switch (status) {
    case 'completed': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    case 'failed':    return 'text-red-400    bg-red-500/10    border-red-500/20'
    case 'verifying': return 'text-amber-400  bg-amber-500/10  border-amber-500/20'
    case 'running':   return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
    case 'spawning':  return 'text-slate-400  bg-slate-500/10  border-slate-500/20'
    default:          return 'text-slate-400  bg-slate-500/10  border-slate-500/20'
  }
}

// ---------------------------------------------------------------------------
// Inner card — single live agent
// ---------------------------------------------------------------------------

function AgentCard({
  agent,
  runId,
  onViewSession,
  onStop,
}: {
  agent: ActiveAgentSnapshot
  runId: string | null
  onViewSession?: (sessionId: string) => void
  onStop?: () => void
}) {
  const isLive = agent.status === 'spawning' || agent.status === 'running' || agent.status === 'verifying'
  const tint = statusTint(agent.status)

  return (
    <div className={`rounded-lg border px-3 py-2 min-w-[200px] max-w-[260px] flex flex-col gap-1 ${tint}`}>
      {/* Header: status + title */}
      <div className="flex items-start gap-2 min-w-0">
        {isLive ? <PulseIndicator variant="active" size={6} /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 shrink-0 mt-1.5" />}
        <span className="text-xs font-medium truncate flex-1" title={agent.task_title}>
          {agent.task_title}
        </span>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-2 text-[10px] opacity-75">
        <span title="Elapsed">{Math.floor(agent.elapsed_secs)}s</span>
        <span title="Cost">{formatCost(agent.cost_usd)}</span>
        <span className="capitalize text-[9px] uppercase tracking-wide opacity-60">{agent.status}</span>
      </div>

      {/* OS resources (only when wired via set_pid) */}
      {agent.resources && (
        <div className="flex items-center gap-2 text-[10px] opacity-75 pt-0.5 border-t border-current/10 mt-0.5">
          <span className="inline-flex items-center gap-0.5" title="RAM (resident)">
            <MemoryStick className="w-2.5 h-2.5" />
            {agent.resources.rss_mb.toFixed(0)} MB
          </span>
          <span className="inline-flex items-center gap-0.5" title="CPU">
            <Cpu className="w-2.5 h-2.5" />
            {agent.resources.cpu_pct.toFixed(0)}%
          </span>
          <span className="opacity-60" title={`PID ${agent.resources.pid} · ${agent.resources.threads} threads · ${agent.resources.status}`}>
            #{agent.resources.pid}
          </span>
        </div>
      )}

      {/* Actions */}
      {(agent.session_id || (isLive && onStop)) && (
        <div className="flex items-center gap-1 pt-1">
          {agent.session_id && (
            <button
              onClick={() => agent.session_id && onViewSession?.(agent.session_id)}
              className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] py-1 px-2 rounded hover:bg-current/10 transition-colors"
              title="View this agent's conversation"
            >
              <Eye className="w-2.5 h-2.5" />
              View
            </button>
          )}
          {isLive && onStop && (
            <button
              onClick={onStop}
              className="inline-flex items-center justify-center gap-1 text-[10px] py-1 px-2 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors"
              title="Interrupt this agent"
            >
              <Square className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      {/* runId tag (debug aid, very subtle) */}
      {runId && (
        <span className="text-[9px] opacity-30 truncate" title={`Run ${runId}`}>
          run {runId.slice(0, 8)}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-run section — one run + its active agents
// ---------------------------------------------------------------------------

function RunSection({
  run,
  onViewRun,
  onStopRun,
  onOpenDashboard,
}: {
  run: DetachedRun
  onViewRun: (sessionId: string) => void
  onStopRun: (sessionId: string) => void
  onOpenDashboard: (planId: string) => void
}) {
  // Hook only fires when there's a planId — guarded internally.
  const { snapshot } = useRunnerStatus(run.planId)
  const isThisRun = snapshot?.run_id === run.runId

  const agents = isThisRun ? (snapshot?.active_agents ?? []) : []
  const wave = isThisRun ? snapshot?.current_wave : null
  const cost = isThisRun ? snapshot?.cost_usd : run.costUsd
  const progress = isThisRun ? snapshot?.progress_pct : null

  return (
    <div className="rounded-md bg-indigo-500/[0.04] border border-indigo-500/15 p-3 space-y-2">
      {/* Run header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {run.isStreaming && <PulseIndicator variant="active" size={6} />}
            <span className="text-xs font-medium text-indigo-200 truncate">
              {run.title}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
            <span>⏱ {formatDuration(run.startedAt)}</span>
            <span>💸 {formatCost(cost)}</span>
            {wave != null && <span>🌊 Wave {wave}</span>}
            {progress != null && <span>📊 {progress.toFixed(0)}%</span>}
            <span className="opacity-50">{run.model}</span>
          </div>
        </div>
        {run.planId && (
          <button
            onClick={() => onOpenDashboard(run.planId!)}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] py-1 px-2 rounded-md text-indigo-300 hover:bg-indigo-500/15 transition-colors"
            title="Open the full runner dashboard"
          >
            Dashboard <ExternalLink className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Agent cards row */}
      {agents.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {agents.map((agent) => (
            <AgentCard
              key={`${run.runId}-${agent.task_id}`}
              agent={agent}
              runId={run.runId ?? null}
              onViewSession={onViewRun}
              onStop={() => agent.session_id && onStopRun(agent.session_id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-slate-500 italic">
          {run.isStreaming ? 'Spawning agents…' : 'No active agents'}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const AgenticModeBanner = memo(function AgenticModeBanner({
  runs,
  onViewRun,
  onStopRun,
}: AgenticModeBannerProps) {
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()

  // Only show the banner for streaming runs — once a run completes, the
  // collapsible DetachedRunsPanel below takes over for the historical view.
  const activeRuns = useMemo(() => runs.filter((r) => r.isStreaming), [runs])

  const cumulativeCost = useMemo(
    () => activeRuns.reduce((acc, r) => acc + (r.costUsd ?? 0), 0),
    [activeRuns],
  )

  if (activeRuns.length === 0) return null

  const handleOpenDashboard = (planId: string) => {
    navigate(workspacePath(wsSlug, `/runner/${planId}`))
  }

  return (
    <div className="border-b border-indigo-500/20 bg-gradient-to-r from-indigo-500/[0.06] via-violet-500/[0.04] to-fuchsia-500/[0.06]">
      {/* Sticky header strip */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-indigo-500/15">
        <div className="relative flex items-center justify-center">
          <Bot className="w-4 h-4 text-indigo-300" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
        </div>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-indigo-200 uppercase">
            Agentic Mode
          </span>
          <span className="text-[11px] text-slate-400">
            · {activeRuns.length} run{activeRuns.length > 1 ? 's' : ''} active
          </span>
          {cumulativeCost > 0 && (
            <span className="text-[11px] text-slate-500">
              · cumulative {formatCost(cumulativeCost)}
            </span>
          )}
        </div>
      </div>

      {/* Active runs grid */}
      <div className="px-4 py-3 space-y-2 max-h-[40vh] overflow-y-auto">
        {activeRuns.map((run) => (
          <RunSection
            key={run.sessionId}
            run={run}
            onViewRun={onViewRun}
            onStopRun={onStopRun}
            onOpenDashboard={handleOpenDashboard}
          />
        ))}
      </div>
    </div>
  )
})
