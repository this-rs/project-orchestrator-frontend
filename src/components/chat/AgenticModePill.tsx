/**
 * AgenticModePill — always-visible chat-header indicator of the
 * "agentic" state for the current session.
 *
 * Sits at the very top of the chat column so the user can always tell, at
 * a glance, whether the assistant is currently working in the background
 * (running a plan via plan.run) or whether the surface is in a pure
 * conversational state.
 *
 * State machine (computed from useDetachedRuns):
 *   idle      — no detached run is associated with this session.
 *   ready     — the session has linked plans but none are streaming.
 *   running   — at least one detached run is streaming (sub-agents alive).
 *   completed — the session had runs but they all finished. Sticky for a
 *               few seconds via the run record itself (no timer here).
 *
 * Clicking the pill opens a popover summary; clicking "Open dashboard"
 * jumps to the RunnerDashboard for the most-recent run's plan.
 */

import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ExternalLink, ChevronDown } from 'lucide-react'
import { PulseIndicator } from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { DetachedRun } from '@/hooks'

interface AgenticModePillProps {
  /** Detached runs from useDetachedRuns for the current session. */
  runs: DetachedRun[]
  /** True if at least one run is currently streaming (live agents). */
  hasActiveRuns: boolean
}

type AgenticState = 'idle' | 'ready' | 'running' | 'completed'

interface StateMeta {
  label: string
  detail: string
  tint: string
  badgeTint: string
  pulseVariant?: 'active' | 'pending'
  dot?: string
}

function computeState(runs: DetachedRun[], hasActive: boolean): AgenticState {
  if (hasActive) return 'running'
  if (runs.length === 0) return 'idle'
  // At least one historical run, none streaming
  return 'completed'
}

function metaFor(state: AgenticState, runCount: number, activeCount: number): StateMeta {
  switch (state) {
    case 'running':
      return {
        label: 'Agentic',
        detail: `${activeCount} agent${activeCount > 1 ? 's' : ''} working`,
        tint: 'text-indigo-200 border-indigo-500/30',
        badgeTint: 'bg-indigo-500/15',
        pulseVariant: 'active',
      }
    case 'ready':
      return {
        label: 'Agentic',
        detail: 'ready',
        tint: 'text-amber-200 border-amber-500/30',
        badgeTint: 'bg-amber-500/10',
        pulseVariant: 'pending',
      }
    case 'completed':
      return {
        label: 'Agentic',
        detail: `${runCount} run${runCount > 1 ? 's' : ''} completed`,
        tint: 'text-emerald-300 border-emerald-500/30',
        badgeTint: 'bg-emerald-500/10',
        dot: 'bg-emerald-400',
      }
    case 'idle':
    default:
      return {
        label: 'Agentic',
        detail: 'idle',
        tint: 'text-slate-400 border-white/10',
        badgeTint: 'bg-white/[0.03]',
        dot: 'bg-slate-500',
      }
  }
}

export const AgenticModePill = memo(function AgenticModePill({
  runs,
  hasActiveRuns,
}: AgenticModePillProps) {
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const [popoverOpen, setPopoverOpen] = useState(false)

  const state = computeState(runs, hasActiveRuns)
  const activeRuns = useMemo(() => runs.filter((r) => r.isStreaming), [runs])
  const meta = metaFor(state, runs.length, activeRuns.length)

  // Most recent run with a planId — preferred destination for "Open dashboard".
  const latestRunWithPlan = useMemo(() => {
    const sorted = [...runs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    return sorted.find((r) => r.planId)
  }, [runs])

  const handleOpenDashboard = () => {
    if (latestRunWithPlan?.planId) {
      navigate(workspacePath(wsSlug, `/runner/${latestRunWithPlan.planId}`))
      setPopoverOpen(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setPopoverOpen((p) => !p)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${meta.badgeTint} ${meta.tint} hover:bg-white/[0.06]`}
        title={`Agentic mode — ${meta.detail}`}
      >
        <Bot className="w-3 h-3 opacity-80" />
        <span className="uppercase tracking-wider">{meta.label}</span>
        <span className="opacity-60">·</span>
        {meta.pulseVariant ? (
          <PulseIndicator variant={meta.pulseVariant} size={6} />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot ?? 'bg-current'}`} />
        )}
        <span className="opacity-90">{meta.detail}</span>
        <ChevronDown className={`w-2.5 h-2.5 opacity-50 transition-transform ${popoverOpen ? 'rotate-180' : ''}`} />
      </button>

      {popoverOpen && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setPopoverOpen(false)} />
          {/* Popover */}
          <div className="absolute top-full left-0 mt-1 z-20 w-72 rounded-md border border-white/10 bg-slate-900/95 backdrop-blur-sm shadow-xl p-3 space-y-2 text-xs">
            <div className="text-slate-300 font-medium flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              Agentic mode — {state}
            </div>

            {state === 'idle' && (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                No background runs for this chat. Ask the assistant to run a plan
                (or trigger one via the MCP <code className="text-slate-400">plan.run</code>) and
                this pill will go live with the sub-agents.
              </p>
            )}

            {state === 'running' && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400">
                  {activeRuns.length} run{activeRuns.length > 1 ? 's' : ''} currently streaming.
                  The banner below shows agents in real time.
                </p>
                <ul className="space-y-1">
                  {activeRuns.slice(0, 5).map((r) => (
                    <li key={r.sessionId} className="flex items-center gap-2">
                      <PulseIndicator variant="active" size={5} />
                      <span className="truncate text-slate-300">{r.title}</span>
                    </li>
                  ))}
                  {activeRuns.length > 5 && (
                    <li className="text-[10px] text-slate-500">+ {activeRuns.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            {state === 'completed' && (
              <p className="text-[11px] text-slate-400">
                {runs.length} run{runs.length > 1 ? 's' : ''} ran from this chat. None are
                currently streaming.
              </p>
            )}

            {latestRunWithPlan?.planId && (
              <button
                onClick={handleOpenDashboard}
                className="w-full inline-flex items-center justify-center gap-1.5 mt-1 py-1.5 rounded-md text-[11px] text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
              >
                Open runner dashboard
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
})
