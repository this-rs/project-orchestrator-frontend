/**
 * AgenticModePill — header icon-button surfacing the "agentic" state
 * for the current chat session.
 *
 * Visual contract — aligned with the existing chat header icon cluster
 * (Settings, TreePine, Copy…): a `p-1.5 rounded-md` button with a Bot
 * icon and a tiny status dot at the top-right corner, exactly like the
 * Settings gear's `modeColor` indicator.
 *
 * Hidden when **idle** (no detached run associated with this session) so
 * regular chats stay free of chrome. Surfaces as:
 *   ready     — amber dot, static.
 *   running   — indigo dot, pulsing; tooltip shows active agent count.
 *   completed — emerald dot, static; popover summarises past runs.
 *
 * Click opens a compact popover anchored right; "Open runner dashboard"
 * jumps to the latest run's plan.
 */

import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ExternalLink } from 'lucide-react'
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

function computeState(runs: DetachedRun[], hasActive: boolean): AgenticState {
  if (hasActive) return 'running'
  if (runs.length === 0) return 'idle'
  return 'completed'
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

  // Most recent run with a planId — preferred destination for "Open dashboard".
  // Hooks must run unconditionally — keep this above the early return.
  const latestRunWithPlan = useMemo(() => {
    const sorted = [...runs].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    return sorted.find((r) => r.planId)
  }, [runs])

  // Idle = chat has never spawned a run. Render nothing so regular
  // conversations don't carry permanent header chrome.
  if (state === 'idle') return null

  const handleOpenDashboard = () => {
    if (latestRunWithPlan?.planId) {
      navigate(workspacePath(wsSlug, `/runner/${latestRunWithPlan.planId}`))
      setPopoverOpen(false)
    }
  }

  // Dot + accent mirror the Settings gear `modeColor` pattern.
  const dotColor =
    state === 'running'   ? 'bg-indigo-400'
    : state === 'ready'   ? 'bg-amber-400'
    :                       'bg-emerald-400' // completed
  const accentColor =
    state === 'running'   ? 'text-indigo-300'
    : state === 'ready'   ? 'text-amber-300'
    :                       'text-emerald-300'

  const tooltip =
    state === 'running'
      ? `Agentic mode — ${activeRuns.length} agent${activeRuns.length > 1 ? 's' : ''} working`
      : state === 'completed'
        ? `Agentic mode — ${runs.length} run${runs.length > 1 ? 's' : ''} completed`
        : 'Agentic mode — ready'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPopoverOpen((p) => !p)}
        className={`relative p-1.5 rounded-md transition-colors ${
          popoverOpen
            ? 'text-gray-200 bg-white/[0.06]'
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
        }`}
        title={tooltip}
        aria-label={tooltip}
      >
        <Bot className="w-4 h-4" />
        {/* Status dot — matches Settings gear `modeColor` pattern */}
        <span
          className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${dotColor} ring-1 ring-[#1a1d27] ${
            state === 'running' ? 'animate-pulse' : ''
          }`}
        />
      </button>

      {popoverOpen && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setPopoverOpen(false)} />
          {/* Popover — anchored right under the icon button */}
          <div className="absolute top-full right-0 mt-1 z-20 w-72 rounded-md border border-white/10 bg-slate-900/95 backdrop-blur-sm shadow-xl p-3 space-y-2 text-xs">
            <div className="text-slate-300 font-medium flex items-center gap-2">
              <Bot className={`w-3.5 h-3.5 ${accentColor}`} />
              <span>Agentic mode</span>
              <span className="text-slate-500">·</span>
              <span className="capitalize text-slate-400">{state}</span>
            </div>

            {state === 'running' && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400">
                  {activeRuns.length} run{activeRuns.length > 1 ? 's' : ''} currently streaming. The
                  banner below shows agents in real time.
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

            {state === 'ready' && (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Linked plans exist on this chat but none is currently streaming.
              </p>
            )}

            {state === 'completed' && (
              <p className="text-[11px] text-slate-400">
                {runs.length} run{runs.length > 1 ? 's' : ''} ran from this chat. None is currently
                streaming.
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
