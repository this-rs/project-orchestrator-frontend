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
  ChevronDown,
  ChevronUp,
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
  update_edges: Network,
  render: Sparkles,
}

// ── Status indicator ─────────────────────────────────────────────────────────

function StageStatusIcon({ status }: { status: LoadingStageStatus }) {
  switch (status) {
    case 'done':
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Check size={8} className="text-emerald-400" strokeWidth={3} />
        </div>
      )
    case 'loading':
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
          <Loader2 size={8} className="text-blue-400 animate-spin" />
        </div>
      )
    case 'error':
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
          <AlertCircle size={8} className="text-red-400" />
        </div>
      )
    default:
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-slate-700/30 flex items-center justify-center shrink-0">
          <Circle size={5} className="text-slate-600" />
        </div>
      )
  }
}

// ── Elapsed timer (RAF-based, no stale closure issues) ──────────────────────

function formatMs(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped < 1000) return `${Math.round(clamped)}ms`
  return `${(clamped / 1000).toFixed(1)}s`
}

function ElapsedTimer({ startedAt, completedAt }: { startedAt?: number; completedAt?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)

  const startedAtRef = useRef(startedAt)
  startedAtRef.current = startedAt

  useEffect(() => {
    if (!startedAt || completedAt) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    if (ref.current) {
      ref.current.textContent = formatMs(Date.now() - startedAt)
    }

    const tick = () => {
      if (ref.current && startedAtRef.current) {
        ref.current.textContent = formatMs(Date.now() - startedAtRef.current)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [startedAt, completedAt])

  if (!startedAt) return null

  if (completedAt) {
    return (
      <span className="text-[9px] text-slate-500 tabular-nums font-mono">
        {formatMs(completedAt - startedAt)}
      </span>
    )
  }

  return (
    <span ref={ref} className="text-[9px] text-blue-400/80 tabular-nums font-mono" />
  )
}

// ── Sub-progress bar for a single stage ─────────────────────────────────────

function StageProgressBar({ progress, progressTotal }: { progress: number; progressTotal: number }) {
  const pct = progressTotal > 0 ? Math.min((progress / progressTotal) * 100, 100) : 0

  return (
    <div className="w-full h-0.5 bg-slate-800/80 rounded-full overflow-hidden mt-1">
      <div
        className="h-full bg-blue-500/60 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Global progress bar ─────────────────────────────────────────────────────

function GlobalProgressBar({ stages }: { stages: LoadingStage[] }) {
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

// ── Compact stage row ────────────────────────────────────────────────────────

function CompactStageRow({ stage }: { stage: LoadingStage }) {
  const Icon = stageIcons[stage.id] ?? Database
  const isActive = stage.status === 'loading'
  const isDone = stage.status === 'done'
  const hasSubProgress = isActive && stage.progress != null && stage.progressTotal != null && stage.progressTotal > 0

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all duration-200 ${
        isActive
          ? 'bg-blue-950/40'
          : isDone
            ? 'opacity-50'
            : 'opacity-25'
      }`}
    >
      <StageStatusIcon status={stage.status} />
      <Icon
        size={10}
        className={
          isActive ? 'text-blue-400 shrink-0' : isDone ? 'text-slate-500 shrink-0' : 'text-slate-600 shrink-0'
        }
      />
      <span
        className={`text-[10px] flex-1 leading-tight truncate ${
          isActive ? 'text-slate-200 font-medium' : isDone ? 'text-slate-400' : 'text-slate-600'
        }`}
      >
        {stage.label}
      </span>
      {(isActive || isDone) && stage.detail && (
        <span className={`text-[9px] font-mono tabular-nums truncate max-w-[80px] ${
          isDone ? 'text-emerald-500/50' : 'text-blue-400/60'
        }`}>
          {stage.detail}
        </span>
      )}
      <ElapsedTimer startedAt={stage.startedAt} completedAt={stage.completedAt} />
      {hasSubProgress && (
        <div className="w-12">
          <StageProgressBar progress={stage.progress!} progressTotal={stage.progressTotal!} />
        </div>
      )}
    </div>
  )
}

// ── Main component — inline badge (non-blocking) ────────────────────────────
// Renders as a compact card above the legend (bottom-left), with
// pointer-events: none so the canvas remains fully interactive.

function GraphLoadingProgressComponent() {
  const stages = useAtomValue(graphLoadingStagesAtom)
  const active = useAtomValue(graphLoadingActiveAtom)

  // Expand/collapse detail stages
  const [expanded, setExpanded] = useState(false)

  // Fade-out animation: keep visible for 800ms after completion
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (active && stages.length > 0) {
      setVisible(true)
      setFading(false)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    } else if (visible && !active) {
      setFading(true)
      fadeTimerRef.current = setTimeout(() => {
        setVisible(false)
        setFading(false)
        setExpanded(false)
      }, 800)
    }
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [active, stages.length, visible])

  if (!visible || stages.length === 0) return null

  const done = stages.filter((s) => s.status === 'done').length
  const total = stages.length
  const currentStage = stages.find((s) => s.status === 'loading')

  return (
    <div
      className={`w-[280px] rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700/60 shadow-lg shadow-black/30 overflow-hidden transition-all duration-500 ${
        fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      {/* Header — always visible: progress bar + current stage summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 pt-2.5 pb-2 hover:bg-slate-800/30 transition-colors pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Loader2
              size={12}
              className={`text-blue-400 ${active ? 'animate-spin' : 'text-emerald-400'}`}
            />
            <span className="text-[11px] font-medium text-slate-200 truncate max-w-[160px]">
              {active
                ? currentStage?.label ?? 'Loading...'
                : 'Graph loaded'
              }
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-slate-500 tabular-nums font-mono">
              {done}/{total}
            </span>
            {expanded
              ? <ChevronDown size={10} className="text-slate-500" />
              : <ChevronUp size={10} className="text-slate-500" />
            }
          </div>
        </div>
        <GlobalProgressBar stages={stages} />
      </button>

      {/* Expanded: detailed stage list */}
      {expanded && (
        <div className="px-1.5 pb-1.5 space-y-0.5 pointer-events-auto max-h-[200px] overflow-y-auto">
          {stages.map((stage) => (
            <CompactStageRow key={stage.id} stage={stage} />
          ))}
        </div>
      )}

      {/* Branding footer — only when expanded */}
      {expanded && (
        <div className="px-3 py-1.5 border-t border-slate-800/40 pointer-events-auto">
          <p className="text-[8px] text-slate-600/50 text-center tracking-wide">
            Made by Freedom From Scratch
          </p>
        </div>
      )}
    </div>
  )
}

export const GraphLoadingProgress = memo(GraphLoadingProgressComponent)
