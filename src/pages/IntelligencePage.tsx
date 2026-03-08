import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAtom } from 'jotai'
import {
  Brain,
  FileCode2,
  StickyNote,
  Scale,
  Network,
  Zap,
  ArrowRight,
  AlertTriangle,
  ShieldX,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Flame,
  BookOpen,
  Activity,
  RefreshCw,
  Sparkles,
  LayoutList,
  CheckSquare,
  Wrench,
  Loader2,
  Check,
  Timer,
  BrainCircuit,
  Waves,
  Search,
  Orbit,
  Calendar,
  Workflow,
  GitBranch,
  Link2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { LoadingPage } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { intelligenceApi } from '@/services/intelligence'
import { codeApi } from '@/services/code'
import { adminApi } from '@/services/admin'
import { projectsApi } from '@/services/projects'
import { intelligenceSummaryAtom } from '@/atoms/intelligence'
import type { IntelligenceSummary } from '@/types/intelligence'
import type { CodeHealth, Project } from '@/types'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// ============================================================================
// HEALTH SCORE — Circular Gauge
// ============================================================================

/** Compute a 0–100 health score from multiple signals */
function computeHealthScore(
  s: IntelligenceSummary,
  h: CodeHealth | null,
): number {
  const scores: number[] = []

  // 1. Knowledge coverage — notes + decisions per file (0–100)
  if (s.code.files > 0) {
    const density = (s.knowledge.notes + s.knowledge.decisions) / s.code.files
    scores.push(Math.min(100, density * 50)) // 2 items/file → 100
  }

  // 2. Note freshness — inverse of stale ratio (0–100)
  if (s.knowledge.notes > 0) {
    const freshRatio = 1 - s.knowledge.stale_count / s.knowledge.notes
    scores.push(freshRatio * 100)
  }

  // 3. Neural health — avg energy + synapse quality (0–100)
  const energyScore = s.neural.avg_energy * 100
  const synapseQuality = (1 - s.neural.weak_synapses_ratio) * 100
  scores.push((energyScore + synapseQuality) / 2)

  // 4. Skills maturity — active / total ratio (0–100)
  if (s.skills.total > 0) {
    scores.push((s.skills.active / s.skills.total) * 100)
  }

  // 5. Code health — low risk ratio (0–100)
  if (h?.risk_assessment) {
    const r = h.risk_assessment
    const total = r.critical_count + r.high_count + r.medium_count + r.low_count
    if (total > 0) {
      const safe = r.low_count + r.medium_count * 0.5
      scores.push(Math.min(100, (safe / total) * 100))
    }
  }

  // 6. Orphan penalty
  if (s.code.files > 0) {
    const nonOrphanRatio = 1 - s.code.orphans / s.code.files
    scores.push(nonOrphanRatio * 100)
  }

  if (scores.length === 0) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function healthScoreColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#fbbf24'
  if (score >= 40) return '#fb923c'
  return '#f87171'
}

function healthScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs Attention'
  return 'At Risk'
}

function CircularGauge({ score }: { score: number }) {
  const size = 160
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const color = healthScoreColor(score)
  const progress = (score / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
          {healthScoreLabel(score)}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// RISK BADGE (reused pattern from FileContextCard)
// ============================================================================

function RiskBadge({ risk }: { risk: CodeHealth['risk_assessment'] }) {
  if (!risk) return null
  const total = risk.critical_count + risk.high_count + risk.medium_count + risk.low_count
  if (total === 0) return null

  const Icon =
    risk.critical_count > 0
      ? ShieldX
      : risk.high_count > 0
        ? ShieldAlert
        : risk.avg_risk_score > 0.3
          ? ShieldCheck
          : Shield
  const color =
    risk.critical_count > 0
      ? '#f87171'
      : risk.high_count > 0
        ? '#fb923c'
        : risk.avg_risk_score > 0.3
          ? '#fbbf24'
          : '#4ade80'

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium"
      style={{ backgroundColor: `${color}15`, color }}
    >
      <Icon size={12} />
      {risk.critical_count > 0
        ? `${risk.critical_count} critical`
        : risk.high_count > 0
          ? `${risk.high_count} high risk`
          : `Avg risk ${(risk.avg_risk_score * 100).toFixed(0)}%`}
    </div>
  )
}

// ============================================================================
// MINI STAT — compact stat for layer cards
// ============================================================================

function MiniStat({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string
  value: number | string
  icon: typeof Brain
  color: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={16} color={color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-slate-200 tabular-nums">{value}</p>
        <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
        {sub && <p className="text-[9px] text-slate-600 leading-tight">{sub}</p>}
      </div>
    </div>
  )
}

// ============================================================================
// MINI GAUGE — horizontal bar
// ============================================================================

function MiniGauge({
  label,
  value,
  color,
  suffix = '%',
}: {
  label: string
  value: number
  color: string
  suffix?: string
}) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 min-w-[80px] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 min-w-[36px] text-right tabular-nums">
        {pct.toFixed(0)}{suffix}
      </span>
    </div>
  )
}

// ============================================================================
// LAYER CARD — enhanced section for each intelligence layer
// ============================================================================

function LayerCard({
  title,
  icon: Icon,
  color,
  badge,
  children,
}: {
  title: string
  icon: typeof Brain
  color: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon size={14} color={color} />
          </div>
          <span className="flex-1">{title}</span>
          {badge}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ============================================================================
// HOTSPOT ROW
// ============================================================================

function HotspotRow({ path, score }: { path: string; score: number }) {
  const filename = path.split('/').pop() ?? path
  const barPct = Math.min(100, score * 20) // normalize: 5 → 100%
  return (
    <div className="flex items-center gap-2 py-0.5 group">
      <Flame size={10} className="text-orange-500 shrink-0 opacity-60 group-hover:opacity-100" />
      <span className="text-[10px] text-slate-400 font-mono truncate flex-1 group-hover:text-orange-300" title={path}>
        {filename}
      </span>
      <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden shrink-0">
        <div
          className="h-full rounded-full bg-orange-500/70"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <span className="text-[9px] font-mono text-slate-600 min-w-[28px] text-right">
        {score.toFixed(1)}
      </span>
    </div>
  )
}

// ============================================================================
// QUICK ACTION BUTTON
// ============================================================================

interface ActionResult {
  key: string
  status: 'idle' | 'running' | 'success' | 'error'
  message?: string
}

function QuickActionButton({
  label,
  icon: Icon,
  color,
  description,
  actionState,
  onClick,
}: {
  label: string
  icon: typeof Brain
  color: string
  description: string
  actionState: ActionResult
  onClick: () => void
}) {
  const isRunning = actionState.status === 'running'
  const isDone = actionState.status === 'success'
  const isError = actionState.status === 'error'

  return (
    <button
      onClick={onClick}
      disabled={isRunning}
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed group w-full"
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: `${color}15` }}
      >
        {isRunning ? (
          <Loader2 size={14} color={color} className="animate-spin" />
        ) : isDone ? (
          <Check size={14} className="text-emerald-400" />
        ) : (
          <Icon size={14} color={color} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-300 group-hover:text-slate-200">{label}</p>
        <p className="text-[10px] text-slate-600 leading-tight mt-0.5">{description}</p>
        {isDone && actionState.message && (
          <p className="text-[10px] text-emerald-500 mt-0.5">{actionState.message}</p>
        )}
        {isError && actionState.message && (
          <p className="text-[10px] text-red-400 mt-0.5">{actionState.message}</p>
        )}
      </div>
    </button>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function IntelligencePage() {
  const { projectSlug } = useParams<{ projectSlug: string }>()
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const [summary, setSummary] = useAtom(intelligenceSummaryAtom)
  const [health, setHealth] = useState<CodeHealth | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Quick action states
  const [actions, setActions] = useState<Record<string, ActionResult>>({})

  const getAction = (key: string): ActionResult =>
    actions[key] ?? { key, status: 'idle' }

  const runAction = useCallback(
    async (key: string, fn: () => Promise<string>) => {
      setActions((prev) => ({ ...prev, [key]: { key, status: 'running' } }))
      try {
        const message = await fn()
        setActions((prev) => ({ ...prev, [key]: { key, status: 'success', message } }))
        // Auto-clear after 4s
        setTimeout(() => {
          setActions((prev) => ({ ...prev, [key]: { key, status: 'idle' } }))
        }, 4000)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed'
        setActions((prev) => ({ ...prev, [key]: { key, status: 'error', message } }))
      }
    },
    [],
  )

  const fetchAll = useCallback(async () => {
    if (!projectSlug) return
    setError(null)
    try {
      const [summaryData, healthData, projectData] = await Promise.allSettled([
        intelligenceApi.getSummary(projectSlug),
        codeApi.getHealth({ project_slug: projectSlug }),
        projectsApi.get(projectSlug),
      ])

      if (summaryData.status === 'fulfilled') setSummary(summaryData.value)
      else throw new Error(summaryData.reason?.message ?? 'Failed to load intelligence data')

      if (healthData.status === 'fulfilled') setHealth(healthData.value)
      if (projectData.status === 'fulfilled') setProject(projectData.value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load intelligence data')
    }
  }, [projectSlug, setSummary])

  // Initial load
  useEffect(() => {
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
  }, [fetchAll])

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  // Health score
  const healthScore = useMemo(() => {
    if (!summary) return 0
    return computeHealthScore(summary as IntelligenceSummary, health)
  }, [summary, health])

  if (loading) return <LoadingPage />
  if (error) return <ErrorState description={error} onRetry={handleRefresh} />

  const s = summary as IntelligenceSummary | null
  if (!s) return <ErrorState description="No data available" />

  return (
    <div className="py-6 space-y-6 max-w-6xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Brain size={22} className="text-cyan-400" />
            Intelligence Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Multi-layer knowledge graph overview for{' '}
            <span className="text-slate-400 font-medium">{projectSlug}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300 border border-slate-700 transition-colors text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() =>
              navigate(
                workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/vector-space`),
              )
            }
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/30 transition-colors text-sm font-medium"
          >
            <Orbit size={14} />
            Vector Space
          </button>
          <button
            onClick={() =>
              navigate(
                workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/timeline`),
              )
            }
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors text-sm font-medium"
          >
            <Calendar size={14} />
            Timeline
          </button>
          <button
            onClick={() =>
              navigate(
                workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/graph`),
              )
            }
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors text-sm font-medium"
          >
            Open Graph
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Health Score Hero ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-8">
            {/* Circular gauge */}
            <CircularGauge score={healthScore} />

            {/* Health breakdown */}
            <div className="flex-1 space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Health Breakdown</h2>
              <MiniGauge
                label="Knowledge Coverage"
                value={s.code.files > 0 ? Math.min(1, (s.knowledge.notes + s.knowledge.decisions) / s.code.files / 2) : 0}
                color="#fbbf24"
              />
              <MiniGauge
                label="Note Freshness"
                value={s.knowledge.notes > 0 ? 1 - s.knowledge.stale_count / s.knowledge.notes : 1}
                color="#4ade80"
              />
              <MiniGauge
                label="Neural Energy"
                value={s.neural.avg_energy}
                color="#22d3ee"
              />
              <MiniGauge
                label="Synapse Quality"
                value={1 - s.neural.weak_synapses_ratio}
                color="#a78bfa"
              />
              <MiniGauge
                label="Skills Maturity"
                value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0}
                color="#ec4899"
              />
              {health?.risk_assessment && (
                <MiniGauge
                  label="Code Safety"
                  value={
                    (() => {
                      const r = health.risk_assessment!
                      const total = r.critical_count + r.high_count + r.medium_count + r.low_count
                      if (total === 0) return 1
                      return (r.low_count + r.medium_count * 0.5) / total
                    })()
                  }
                  color="#f87171"
                />
              )}
            </div>

            {/* Quick stats column */}
            <div className="space-y-3 min-w-[140px]">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-200 tabular-nums">
                  {s.code.files + s.code.functions}
                </p>
                <p className="text-[10px] text-slate-500">Code Entities</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-200 tabular-nums">
                  {s.knowledge.notes + s.knowledge.decisions}
                </p>
                <p className="text-[10px] text-slate-500">Knowledge Items</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-200 tabular-nums">
                  {s.skills.total}
                </p>
                <p className="text-[10px] text-slate-500">Neural Skills</p>
              </div>
              {health?.risk_assessment && (
                <div className="flex justify-center">
                  <RiskBadge risk={health.risk_assessment} />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Layer Cards Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CODE LAYER */}
        <LayerCard title="Code" icon={FileCode2} color="#3B82F6">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <MiniStat label="Files" value={s.code.files} icon={FileCode2} color="#3B82F6" />
            <MiniStat label="Functions" value={s.code.functions} icon={Network} color="#60A5FA" />
            <MiniStat label="Communities" value={s.code.communities} icon={Network} color="#6366F1" />
            <MiniStat
              label="Orphans"
              value={s.code.orphans}
              icon={AlertTriangle}
              color={s.code.orphans > 10 ? '#F59E0B' : '#4ade80'}
            />
          </div>
          {/* Hotspots top 5 */}
          {s.code.hotspots.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1.5">
                Top Hotspots
              </p>
              <div className="space-y-0.5">
                {s.code.hotspots.slice(0, 5).map((h) => (
                  <HotspotRow key={h.path} path={h.path} score={h.churn_score} />
                ))}
              </div>
            </div>
          )}
        </LayerCard>

        {/* PROJECT MANAGEMENT LAYER */}
        <LayerCard title="Project Management" icon={LayoutList} color="#818cf8">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              label="Notes"
              value={s.knowledge.notes}
              icon={StickyNote}
              color="#F59E0B"
              sub={s.knowledge.stale_count > 0 ? `${s.knowledge.stale_count} stale` : undefined}
            />
            <MiniStat label="Decisions" value={s.knowledge.decisions} icon={Scale} color="#8B5CF6" />
          </div>
          {/* Note type distribution */}
          {Object.keys(s.knowledge.types_distribution).length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1.5">
                Note Types
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(s.knowledge.types_distribution).map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40 text-[10px]"
                  >
                    <span className="text-slate-500">{type}</span>
                    <span className="font-mono font-bold text-slate-300">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </LayerCard>

        {/* KNOWLEDGE LAYER */}
        <LayerCard
          title="Knowledge Fabric"
          icon={BookOpen}
          color="#94A3B8"
          badge={
            <span className="text-[10px] font-mono text-slate-600">
              {s.fabric.co_changed_pairs} pairs
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2 mb-3">
            <MiniStat
              label="Co-changed Pairs"
              value={s.fabric.co_changed_pairs}
              icon={Network}
              color="#FED7AA"
            />
            {health?.coupling_metrics && (
              <MiniStat
                label="Avg Coupling"
                value={health.coupling_metrics.avg_clustering_coefficient.toFixed(2)}
                icon={Activity}
                color="#94A3B8"
                sub={`max: ${health.coupling_metrics.max_clustering_coefficient.toFixed(2)}`}
              />
            )}
          </div>
          {health && health.circular_dependency_count > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-red-950/30 border border-red-900/30 text-[10px] text-red-400">
              <AlertTriangle size={10} />
              {health.circular_dependency_count} circular dependencies detected
            </div>
          )}
          {health?.coupling_metrics?.most_coupled_file && (
            <div className="mt-2">
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">
                Most Coupled
              </p>
              <p className="text-[10px] text-slate-400 font-mono truncate" title={health.coupling_metrics.most_coupled_file}>
                {health.coupling_metrics.most_coupled_file.split('/').pop()}
              </p>
            </div>
          )}
        </LayerCard>

        {/* NEURAL LAYER */}
        <LayerCard title="Neural" icon={Brain} color="#06B6D4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <MiniStat label="Active Synapses" value={s.neural.active_synapses} icon={Brain} color="#06B6D4" />
            <MiniStat
              label="Dead Notes"
              value={s.neural.dead_notes_count}
              icon={StickyNote}
              color={s.neural.dead_notes_count > 5 ? '#f87171' : '#64748b'}
            />
          </div>
          <div className="space-y-1.5">
            <MiniGauge label="Avg Energy" value={s.neural.avg_energy} color="#22d3ee" />
            <MiniGauge
              label="Weak Synapses"
              value={s.neural.weak_synapses_ratio}
              color={s.neural.weak_synapses_ratio > 0.5 ? '#fb923c' : '#4ade80'}
            />
          </div>
        </LayerCard>

        {/* SKILLS LAYER — full width */}
        <div className="md:col-span-2">
          <LayerCard
            title="Skills"
            icon={Sparkles}
            color="#EC4899"
            badge={
              <span className="text-[10px] font-mono text-slate-600">
                {s.skills.total_activations} total activations
              </span>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <MiniStat label="Total Skills" value={s.skills.total} icon={Brain} color="#EC4899" />
              <MiniStat label="Active" value={s.skills.active} icon={Zap} color="#4ade80" />
              <MiniStat label="Emerging" value={s.skills.emerging} icon={Sparkles} color="#fbbf24" />
              <MiniStat
                label="Avg Cohesion"
                value={`${(s.skills.avg_cohesion * 100).toFixed(0)}%`}
                icon={CheckSquare}
                color="#F9A8D4"
              />
            </div>
            <MiniGauge label="Skill Maturity" value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0} color="#ec4899" />
          </LayerCard>
        </div>

        {/* BEHAVIORAL LAYER — full width */}
        {s.behavioral.protocols > 0 && (
          <div className="md:col-span-2">
            <LayerCard
              title="Behavioral"
              icon={Workflow}
              color="#F97316"
              badge={
                <span className="text-[10px] font-mono text-slate-600">
                  {s.behavioral.states} states · {s.behavioral.transitions} transitions
                </span>
              }
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <MiniStat label="Protocols" value={s.behavioral.protocols} icon={Workflow} color="#F97316" />
                <MiniStat label="System" value={s.behavioral.system_protocols} icon={BrainCircuit} color="#3B82F6" />
                <MiniStat label="Business" value={s.behavioral.business_protocols} icon={GitBranch} color="#F97316" />
                <MiniStat
                  label="Skill-Linked"
                  value={s.behavioral.skill_linked}
                  icon={Link2}
                  color={s.behavioral.skill_linked > 0 ? '#EC4899' : '#64748b'}
                />
              </div>
              <MiniGauge
                label="Skill Coverage"
                value={s.behavioral.protocols > 0 ? s.behavioral.skill_linked / s.behavioral.protocols : 0}
                color="#F97316"
              />
            </LayerCard>
          </div>
        )}
      </div>

      {/* ── Attention Section (health warnings) ─────────────────────────── */}
      {(s.knowledge.stale_count > 0 ||
        s.neural.dead_notes_count > 0 ||
        s.code.orphans > 5 ||
        (health?.risk_assessment && health.risk_assessment.critical_count > 0)) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
              <AlertTriangle size={16} />
              Attention Needed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {s.knowledge.stale_count > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-950/20 border border-amber-900/30 text-[11px] text-amber-400">
                  <StickyNote size={12} />
                  <span>
                    <strong>{s.knowledge.stale_count}</strong> stale notes need review
                  </span>
                </div>
              )}
              {s.neural.dead_notes_count > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-400">
                  <Brain size={12} className="text-cyan-500" />
                  <span>
                    <strong>{s.neural.dead_notes_count}</strong> dead notes (no energy)
                  </span>
                </div>
              )}
              {s.code.orphans > 5 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-950/20 border border-amber-900/30 text-[11px] text-amber-400">
                  <FileCode2 size={12} />
                  <span>
                    <strong>{s.code.orphans}</strong> orphan files (no imports/exports)
                  </span>
                </div>
              )}
              {health?.risk_assessment && health.risk_assessment.critical_count > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-950/20 border border-red-900/30 text-[11px] text-red-400">
                  <ShieldX size={12} />
                  <span>
                    <strong>{health.risk_assessment.critical_count}</strong> files at critical risk
                  </span>
                </div>
              )}
              {health && health.god_function_count > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-orange-950/20 border border-orange-900/30 text-[11px] text-orange-400">
                  <Flame size={12} />
                  <span>
                    <strong>{health.god_function_count}</strong> god functions (threshold: {health.god_function_threshold})
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Quick Actions (maintenance) ────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wrench size={16} className="text-slate-400" />
            Quick Actions
            <span className="text-[10px] text-slate-600 font-normal ml-auto">
              Knowledge graph maintenance
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <QuickActionButton
              label="Update Staleness"
              icon={Timer}
              color="#fb923c"
              description="Recalculate staleness scores for all notes"
              actionState={getAction('staleness')}
              onClick={() =>
                runAction('staleness', async () => {
                  const r = await adminApi.updateStaleness()
                  await handleRefresh()
                  return `${r.notes_updated} notes updated`
                })
              }
            />
            <QuickActionButton
              label="Recalculate Energy"
              icon={Zap}
              color="#22d3ee"
              description="Update neural energy scores based on activity"
              actionState={getAction('energy')}
              onClick={() =>
                runAction('energy', async () => {
                  const r = await adminApi.updateEnergy()
                  await handleRefresh()
                  return `${r.notes_updated} notes updated (half-life: ${r.half_life_days}d)`
                })
              }
            />
            <QuickActionButton
              label="Decay Synapses"
              icon={Waves}
              color="#a78bfa"
              description="Decay weak synapses and prune dead connections"
              actionState={getAction('decay')}
              onClick={() =>
                runAction('decay', async () => {
                  const r = await adminApi.decayNeurons()
                  await handleRefresh()
                  return `${r.synapses_decayed} decayed, ${r.synapses_pruned} pruned`
                })
              }
            />
            {project && (
              <>
                <QuickActionButton
                  label="Update Fabric Scores"
                  icon={Network}
                  color="#94a3b8"
                  description="Recalculate GDS metrics (PageRank, communities)"
                  actionState={getAction('fabric')}
                  onClick={() =>
                    runAction('fabric', async () => {
                      const r = await adminApi.updateFabricScores({ project_id: project.id })
                      await handleRefresh()
                      return `${r.nodes_updated} nodes, ${r.communities} communities`
                    })
                  }
                />
                <QuickActionButton
                  label="Detect Skills"
                  icon={BrainCircuit}
                  color="#ec4899"
                  description="Auto-detect emergent skills from note clusters"
                  actionState={getAction('skills')}
                  onClick={() =>
                    runAction('skills', async () => {
                      const r = await adminApi.detectSkills(project.id)
                      await handleRefresh()
                      return `${r.skills_created ?? 0} new, ${r.skills_updated ?? 0} updated`
                    })
                  }
                />
                <QuickActionButton
                  label="Backfill Synapses"
                  icon={Search}
                  color="#06b6d4"
                  description="Create missing synapses from semantic similarity"
                  actionState={getAction('backfill')}
                  onClick={() =>
                    runAction('backfill', async () => {
                      await adminApi.startBackfillSynapses()
                      return 'Backfill job started'
                    })
                  }
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
