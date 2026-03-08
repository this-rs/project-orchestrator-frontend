import { memo, useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { graphLoadingStagesAtom, graphLoadingActiveAtom } from '@/atoms/intelligence'
import type { LoadingStage, LoadingStageStatus } from '@/atoms/intelligence'
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
  FileText,
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
  fetch_summary: FileText,
  transform: Cpu,
  layout: LayoutGrid,
  render: Sparkles,
}

// ── Status indicator ─────────────────────────────────────────────────────────

function StageStatusIcon({ status }: { status: LoadingStageStatus }) {
  switch (status) {
    case 'done':
      return (
        <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Check size={10} className="text-emerald-400" strokeWidth={3} />
        </div>
      )
    case 'loading':
      return (
        <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
          <Loader2 size={10} className="text-blue-400 animate-spin" />
        </div>
      )
    case 'error':
      return (
        <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
          <AlertCircle size={10} className="text-red-400" />
        </div>
      )
    default:
      return (
        <div className="w-4 h-4 rounded-full bg-slate-700/30 flex items-center justify-center shrink-0">
          <Circle size={6} className="text-slate-600" />
        </div>
      )
  }
}

// ── Elapsed timer (RAF-based, no stale closure issues) ──────────────────────

function ElapsedTimer({ startedAt, completedAt }: { startedAt?: number; completedAt?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!startedAt || completedAt) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = () => {
      if (ref.current) {
        const ms = Date.now() - startedAt
        ref.current.textContent = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [startedAt, completedAt])

  if (!startedAt) return null

  if (completedAt) {
    const ms = completedAt - startedAt
    return (
      <span className="text-[10px] text-slate-500 tabular-nums font-mono">
        {ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}
      </span>
    )
  }

  return (
    <span ref={ref} className="text-[10px] text-blue-400/80 tabular-nums font-mono">
      0ms
    </span>
  )
}

// ── Sub-progress bar for a single stage ─────────────────────────────────────

function StageProgressBar({ progress, progressTotal }: { progress: number; progressTotal: number }) {
  const pct = progressTotal > 0 ? Math.min((progress / progressTotal) * 100, 100) : 0

  return (
    <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden mt-1.5">
      <div
        className="h-full bg-blue-500/60 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Global progress bar ─────────────────────────────────────────────────────

function GlobalProgressBar({ stages }: { stages: LoadingStage[] }) {
  // Weighted progress: each stage contributes equally, but loading stages
  // contribute their sub-progress fraction
  let totalWeight = 0
  let doneWeight = 0

  for (const s of stages) {
    totalWeight += 1
    if (s.status === 'done' || s.status === 'error') {
      doneWeight += 1
    } else if (s.status === 'loading' && s.progress != null && s.progressTotal != null && s.progressTotal > 0) {
      doneWeight += s.progress / s.progressTotal
    }
  }

  const pct = totalWeight > 0 ? (doneWeight / totalWeight) * 100 : 0

  return (
    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300 ease-out"
        style={{
          width: `${pct}%`,
          background: pct >= 100
            ? '#10B981'
            : 'linear-gradient(90deg, #3B82F6, #06B6D4)',
        }}
      />
    </div>
  )
}

// ── Stage row ───────────────────────────────────────────────────────────────

function StageRow({ stage }: { stage: LoadingStage }) {
  const Icon = stageIcons[stage.id] ?? Database
  const isActive = stage.status === 'loading'
  const isDone = stage.status === 'done'
  const hasSubProgress = isActive && stage.progress != null && stage.progressTotal != null && stage.progressTotal > 0

  return (
    <div
      className={`rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-blue-950/40 ring-1 ring-blue-500/20'
          : isDone
            ? 'opacity-60'
            : 'opacity-30'
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <StageStatusIcon status={stage.status} />
        <Icon
          size={12}
          className={
            isActive
              ? 'text-blue-400 shrink-0'
              : isDone
                ? 'text-slate-500 shrink-0'
                : 'text-slate-600 shrink-0'
          }
        />
        <span
          className={`text-[11px] flex-1 leading-tight ${
            isActive
              ? 'text-slate-200 font-medium'
              : isDone
                ? 'text-slate-400'
                : 'text-slate-600'
          }`}
        >
          {stage.label}
        </span>
        {stage.detail && (isActive || isDone) && (
          <span className={`text-[10px] font-mono tabular-nums shrink-0 ${
            isDone ? 'text-emerald-500/60' : 'text-blue-400/60'
          }`}>
            {stage.detail}
          </span>
        )}
        <ElapsedTimer startedAt={stage.startedAt} completedAt={stage.completedAt} />
      </div>
      {hasSubProgress && (
        <div className="px-2.5 pb-1.5">
          <StageProgressBar progress={stage.progress!} progressTotal={stage.progressTotal!} />
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

function GraphLoadingProgressComponent() {
  const stages = useAtomValue(graphLoadingStagesAtom)
  const active = useAtomValue(graphLoadingActiveAtom)

  // Fade-out animation: keep visible for 600ms after completion
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (active && stages.length > 0) {
      setVisible(true)
      setFading(false)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    } else if (visible && !active) {
      // Start fade-out
      setFading(true)
      fadeTimerRef.current = setTimeout(() => {
        setVisible(false)
        setFading(false)
      }, 600)
    }
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [active, stages.length, visible])

  if (!visible || stages.length === 0) return null

  const done = stages.filter((s) => s.status === 'done').length
  const total = stages.length

  return (
    <div className={`absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm transition-opacity duration-500 ${
      fading ? 'opacity-0' : 'opacity-100'
    }`}>
      <div className={`w-[340px] rounded-xl bg-slate-900/95 border border-slate-700/60 shadow-2xl shadow-black/40 overflow-hidden transition-transform duration-500 ${
        fading ? 'scale-95' : 'scale-100'
      }`}>
        {/* Header */}
        <div className="px-4 pt-3.5 pb-2.5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-slate-200 tracking-tight">
              Loading Graph
            </h3>
            <span className="text-[10px] text-slate-500 tabular-nums font-mono">
              {done}/{total}
            </span>
          </div>
          <GlobalProgressBar stages={stages} />
        </div>

        {/* Stages */}
        <div className="px-3 pb-2 space-y-0.5">
          {stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-800/40">
          <p className="text-[10px] text-slate-600 text-center">
            Graph size &amp; Neo4j load affect performance
          </p>
        </div>
      </div>
    </div>
  )
}

export const GraphLoadingProgress = memo(GraphLoadingProgressComponent)
