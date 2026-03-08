import { memo, useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { graphLoadingStagesAtom, graphLoadingActiveAtom } from '@/atoms/intelligence'
import type { LoadingStageStatus } from '@/atoms/intelligence'
import {
  Check,
  Loader2,
  Circle,
  AlertCircle,
  Database,
  Network,
  Brain,
  LayoutGrid,
  Cpu,
  Sparkles,
} from 'lucide-react'

// ── Stage icons ──────────────────────────────────────────────────────────────

const stageIcons: Record<string, typeof Database> = {
  fetch_code: Database,
  fetch_knowledge: Brain,
  fetch_fabric: Network,
  fetch_neural: Sparkles,
  fetch_skills: Brain,
  fetch_behavioral: Cpu,
  fetch_pm: LayoutGrid,
  fetch_chat: Network,
  fetch_primary: Database,
  fetch_secondary: Network,
  fetch_data: Database,
  transform: Cpu,
  layout: LayoutGrid,
  render: Sparkles,
}

// ── Status indicator ─────────────────────────────────────────────────────────

function StageStatusIcon({ status }: { status: LoadingStageStatus }) {
  switch (status) {
    case 'done':
      return (
        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Check size={12} className="text-emerald-400" />
        </div>
      )
    case 'loading':
      return (
        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Loader2 size={12} className="text-blue-400 animate-spin" />
        </div>
      )
    case 'error':
      return (
        <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
          <AlertCircle size={12} className="text-red-400" />
        </div>
      )
    default:
      return (
        <div className="w-5 h-5 rounded-full bg-slate-700/40 flex items-center justify-center">
          <Circle size={8} className="text-slate-600" />
        </div>
      )
  }
}

// ── Elapsed time helper ──────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function ElapsedTime({ startedAt, completedAt }: { startedAt?: number; completedAt?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!startedAt || completedAt) return
    const interval = setInterval(() => {
      if (ref.current) {
        ref.current.textContent = formatElapsed(Date.now() - startedAt)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [startedAt, completedAt])

  if (!startedAt) return null

  if (completedAt) {
    return (
      <span className="text-[10px] text-slate-500 tabular-nums">
        {formatElapsed(completedAt - startedAt)}
      </span>
    )
  }

  return (
    <span ref={ref} className="text-[10px] text-blue-400/70 tabular-nums">
      {formatElapsed(Date.now() - startedAt)}
    </span>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ stages }: { stages: { status: LoadingStageStatus }[] }) {
  const total = stages.length
  const done = stages.filter((s) => s.status === 'done').length
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

function GraphLoadingProgressComponent() {
  const stages = useAtomValue(graphLoadingStagesAtom)
  const active = useAtomValue(graphLoadingActiveAtom)

  if (!active || stages.length === 0) return null

  const done = stages.filter((s) => s.status === 'done').length
  const total = stages.length

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm">
      <div className="w-80 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-200">
              Loading Intelligence Graph
            </h3>
            <span className="text-[10px] text-slate-500 tabular-nums">
              {done}/{total}
            </span>
          </div>
          <ProgressBar stages={stages} />
        </div>

        {/* Stages list */}
        <div className="px-4 py-2 space-y-1">
          {stages.map((stage) => {
            const Icon = stageIcons[stage.id] ?? Database
            const isActive = stage.status === 'loading'

            return (
              <div
                key={stage.id}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? 'bg-blue-950/30 border border-blue-800/30'
                    : stage.status === 'done'
                      ? 'opacity-70'
                      : 'opacity-40'
                }`}
              >
                <StageStatusIcon status={stage.status} />
                <Icon
                  size={13}
                  className={
                    isActive
                      ? 'text-blue-400'
                      : stage.status === 'done'
                        ? 'text-slate-400'
                        : 'text-slate-600'
                  }
                />
                <span
                  className={`text-xs flex-1 ${
                    isActive
                      ? 'text-slate-200 font-medium'
                      : stage.status === 'done'
                        ? 'text-slate-400'
                        : 'text-slate-600'
                  }`}
                >
                  {stage.label}
                </span>
                {stage.detail && stage.status === 'done' && (
                  <span className="text-[10px] text-emerald-500/70 font-mono">
                    {stage.detail}
                  </span>
                )}
                <ElapsedTime startedAt={stage.startedAt} completedAt={stage.completedAt} />
              </div>
            )
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-slate-800/60">
          <p className="text-[10px] text-slate-600 text-center">
            Performance depends on graph size and Neo4j load
          </p>
        </div>
      </div>
    </div>
  )
}

export const GraphLoadingProgress = memo(GraphLoadingProgressComponent)
