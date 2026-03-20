import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAtom } from 'jotai'
import {
  Brain,
  FileCode2,
  StickyNote,
  Scale,
  Network,
  Zap,
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
  Workflow,
  GitBranch,
  Link2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { MetricTooltip } from '@/components/ui/MetricTooltip'
import { intelligenceApi } from '@/services/intelligence'
import { codeApi } from '@/services/code'
import { adminApi } from '@/services/admin'
import { projectsApi } from '@/services/projects'
import { intelligenceSummaryAtom } from '@/atoms/intelligence'
import type { IntelligenceSummary } from '@/types/intelligence'
import type { CodeHealth, Project } from '@/types'

// ============================================================================
// HEALTH SCORE — Circular Gauge
// ============================================================================

function computeHealthScore(
  s: IntelligenceSummary,
  h: CodeHealth | null,
): number {
  const scores: number[] = []

  if (s.code.files > 0) {
    const density = (s.knowledge.notes + s.knowledge.decisions) / s.code.files
    scores.push(Math.min(100, density * 50))
  }

  if (s.knowledge.notes > 0) {
    const freshRatio = 1 - s.knowledge.stale_count / s.knowledge.notes
    scores.push(freshRatio * 100)
  }

  const energyScore = s.neural.avg_energy * 100
  const synapseQuality = (1 - s.neural.weak_synapses_ratio) * 100
  scores.push((energyScore + synapseQuality) / 2)

  if (s.skills.total > 0) {
    scores.push((s.skills.active / s.skills.total) * 100)
  }

  if (h?.risk_assessment) {
    const r = h.risk_assessment
    const total = r.critical_count + r.high_count + r.medium_count + r.low_count
    if (total > 0) {
      const safe = r.low_count + r.medium_count * 0.5
      scores.push(Math.min(100, (safe / total) * 100))
    }
  }

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
  const size = 140
  const strokeWidth = 9
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const color = healthScoreColor(score)
  const progress = (score / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-bold tabular-nums"
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
// RISK BADGE
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
// MINI STAT
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
// MINI GAUGE
// ============================================================================

function MiniGauge({
  label,
  value,
  color,
  suffix = '%',
  tooltipTerm,
}: {
  label: string
  value: number
  color: string
  suffix?: string
  tooltipTerm?: string
}) {
  const pct = Math.min(100, Math.max(0, value * 100))
  const labelEl = (
    <span className="text-[10px] text-slate-500 min-w-[80px] shrink-0">{label}</span>
  )
  return (
    <div className="flex items-center gap-2">
      {tooltipTerm ? (
        <MetricTooltip term={tooltipTerm} showIndicator>{labelEl}</MetricTooltip>
      ) : labelEl}
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
// LAYER CARD
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
  const barPct = Math.min(100, score * 20)
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
// INTELLIGENCE DATA HOOK
// ============================================================================

export interface IntelligenceData {
  summary: IntelligenceSummary | null
  health: CodeHealth | null
  project: Project | null
  loading: boolean
  error: string | null
  refreshing: boolean
  healthScore: number
  handleRefresh: () => Promise<void>
  getAction: (key: string) => ActionResult
  runAction: (key: string, fn: () => Promise<string>) => Promise<void>
}

export function useIntelligenceData(projectSlug: string): IntelligenceData {
  const [summary, setSummary] = useAtom(intelligenceSummaryAtom)
  const [health, setHealth] = useState<CodeHealth | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actions, setActions] = useState<Record<string, ActionResult>>({})

  const getAction = useCallback(
    (key: string): ActionResult => actions[key] ?? { key, status: 'idle' },
    [actions],
  )

  const runAction = useCallback(
    async (key: string, fn: () => Promise<string>) => {
      setActions((prev) => ({ ...prev, [key]: { key, status: 'running' } }))
      try {
        const message = await fn()
        setActions((prev) => ({ ...prev, [key]: { key, status: 'success', message } }))
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

  useEffect(() => {
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
  }, [fetchAll])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  const healthScore = useMemo(() => {
    if (!summary) return 0
    return computeHealthScore(summary as IntelligenceSummary, health)
  }, [summary, health])

  return {
    summary: summary as IntelligenceSummary | null,
    health,
    project,
    loading,
    error,
    refreshing,
    healthScore,
    handleRefresh,
    getAction,
    runAction,
  }
}

// ============================================================================
// SECTION: Health Breakdown (Hero card with circular gauge + mini gauges)
// ============================================================================

export function IntelHealthBreakdown({
  data,
  progress,
}: {
  data: IntelligenceData
  progress?: { percentage: number }
}) {
  const s = data.summary
  if (!s) return null

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center gap-6">
          <CircularGauge score={data.healthScore} />

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-300">Health Breakdown</h2>
              <button
                onClick={data.handleRefresh}
                disabled={data.refreshing}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors text-[10px] font-medium disabled:opacity-50"
              >
                <RefreshCw size={10} className={data.refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
            {progress != null && (
              <MiniGauge
                label="Project Progress"
                value={progress.percentage / 100}
                color="#6366f1"
              />
            )}
            <MiniGauge
              label="Knowledge Coverage"
              value={s.code.files > 0 ? Math.min(1, (s.knowledge.notes + s.knowledge.decisions) / s.code.files / 2) : 0}
              color="#fbbf24"
              tooltipTerm="knowledge_coverage"
            />
            <MiniGauge
              label="Note Freshness"
              value={s.knowledge.notes > 0 ? 1 - s.knowledge.stale_count / s.knowledge.notes : 1}
              color="#4ade80"
              tooltipTerm="note_freshness"
            />
            <MiniGauge
              label="Neural Energy"
              value={s.neural.avg_energy}
              color="#22d3ee"
              tooltipTerm="energy"
            />
            <MiniGauge
              label="Synapse Quality"
              value={1 - s.neural.weak_synapses_ratio}
              color="#a78bfa"
              tooltipTerm="synapse_quality"
            />
            <MiniGauge
              label="Skills Maturity"
              value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0}
              color="#ec4899"
              tooltipTerm="skills_maturity"
            />
            {data.health?.risk_assessment && (
              <MiniGauge
                label="Code Safety"
                value={
                  (() => {
                    const r = data.health.risk_assessment!
                    const total = r.critical_count + r.high_count + r.medium_count + r.low_count
                    if (total === 0) return 1
                    return (r.low_count + r.medium_count * 0.5) / total
                  })()
                }
                color="#f87171"
                tooltipTerm="code_safety"
              />
            )}
          </div>

          <div className="space-y-3 min-w-[130px]">
            <div className="text-center">
              <p className="text-xl font-bold text-slate-200 tabular-nums">
                {s.code.files + s.code.functions}
              </p>
              <p className="text-[10px] text-slate-500">Code Entities</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-200 tabular-nums">
                {s.knowledge.notes + s.knowledge.decisions}
              </p>
              <p className="text-[10px] text-slate-500">Knowledge Items</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-200 tabular-nums">
                {s.skills.total}
              </p>
              <p className="text-[10px] text-slate-500">Neural Skills</p>
            </div>
            {data.health?.risk_assessment && (
              <div className="flex justify-center">
                <RiskBadge risk={data.health.risk_assessment} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// SECTION: Quick Actions
// ============================================================================

export function IntelQuickActions({ data }: { data: IntelligenceData }) {
  if (!data.summary) return null

  return (
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
            actionState={data.getAction('staleness')}
            onClick={() =>
              data.runAction('staleness', async () => {
                const r = await adminApi.updateStaleness()
                await data.handleRefresh()
                return `${r.notes_updated} notes updated`
              })
            }
          />
          <QuickActionButton
            label="Recalculate Energy"
            icon={Zap}
            color="#22d3ee"
            description="Update neural energy scores based on activity"
            actionState={data.getAction('energy')}
            onClick={() =>
              data.runAction('energy', async () => {
                const r = await adminApi.updateEnergy()
                await data.handleRefresh()
                return `${r.notes_updated} notes updated (half-life: ${r.half_life_days}d)`
              })
            }
          />
          <QuickActionButton
            label="Decay Synapses"
            icon={Waves}
            color="#a78bfa"
            description="Decay weak synapses and prune dead connections"
            actionState={data.getAction('decay')}
            onClick={() =>
              data.runAction('decay', async () => {
                const r = await adminApi.decayNeurons()
                await data.handleRefresh()
                return `${r.synapses_decayed} decayed, ${r.synapses_pruned} pruned`
              })
            }
          />
          {data.project && (
            <>
              <QuickActionButton
                label="Update Fabric Scores"
                icon={Network}
                color="#94a3b8"
                description="Recalculate GDS metrics (PageRank, communities)"
                actionState={data.getAction('fabric')}
                onClick={() =>
                  data.runAction('fabric', async () => {
                    const r = await adminApi.updateFabricScores({ project_id: data.project!.id })
                    await data.handleRefresh()
                    return `${r.nodes_updated} nodes, ${r.communities} communities`
                  })
                }
              />
              <QuickActionButton
                label="Detect Skills"
                icon={BrainCircuit}
                color="#ec4899"
                description="Auto-detect emergent skills from note clusters"
                actionState={data.getAction('skills')}
                onClick={() =>
                  data.runAction('skills', async () => {
                    const r = await adminApi.detectSkills(data.project!.id)
                    await data.handleRefresh()
                    return `${r.skills_created ?? 0} new, ${r.skills_updated ?? 0} updated`
                  })
                }
              />
              <QuickActionButton
                label="Backfill Synapses"
                icon={Search}
                color="#06b6d4"
                description="Create missing synapses from semantic similarity"
                actionState={data.getAction('backfill')}
                onClick={() =>
                  data.runAction('backfill', async () => {
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
  )
}

// ============================================================================
// SECTION: Layer Cards (Code, PM, Knowledge Fabric, Neural)
// ============================================================================

export function IntelLayerCards({ data }: { data: IntelligenceData }) {
  const s = data.summary
  if (!s) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* CODE LAYER */}
      <LayerCard title="Code" icon={FileCode2} color="#3B82F6">
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 mb-3">
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
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
          <MiniStat
            label="Notes"
            value={s.knowledge.notes}
            icon={StickyNote}
            color="#F59E0B"
            sub={s.knowledge.stale_count > 0 ? `${s.knowledge.stale_count} stale` : undefined}
          />
          <MiniStat label="Decisions" value={s.knowledge.decisions} icon={Scale} color="#8B5CF6" />
        </div>
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

      {/* KNOWLEDGE FABRIC LAYER */}
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
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 mb-3">
          <MiniStat
            label="Co-changed Pairs"
            value={s.fabric.co_changed_pairs}
            icon={Network}
            color="#FED7AA"
          />
          {data.health?.coupling_metrics && (
            <MiniStat
              label="Avg Coupling"
              value={data.health.coupling_metrics.avg_clustering_coefficient.toFixed(2)}
              icon={Activity}
              color="#94A3B8"
              sub={`max: ${data.health.coupling_metrics.max_clustering_coefficient.toFixed(2)}`}
            />
          )}
        </div>
        {data.health && data.health.circular_dependency_count > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-red-950/30 border border-red-900/30 text-[10px] text-red-400">
            <AlertTriangle size={10} />
            {data.health.circular_dependency_count} <MetricTooltip term="circular_dependency" showIndicator>circular dependencies</MetricTooltip> detected
          </div>
        )}
        {data.health?.coupling_metrics?.most_coupled_file && (
          <div className="mt-2">
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">
              Most Coupled
            </p>
            <p className="text-[10px] text-slate-400 font-mono truncate" title={data.health.coupling_metrics.most_coupled_file}>
              {data.health.coupling_metrics.most_coupled_file.split('/').pop()}
            </p>
          </div>
        )}
      </LayerCard>

      {/* NEURAL LAYER */}
      <LayerCard title="Neural" icon={Brain} color="#06B6D4">
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 mb-3">
          <MiniStat label="Active Synapses" value={s.neural.active_synapses} icon={Brain} color="#06B6D4" />
          <MiniStat
            label="Dead Notes"
            value={s.neural.dead_notes_count}
            icon={StickyNote}
            color={s.neural.dead_notes_count > 5 ? '#f87171' : '#64748b'}
          />
        </div>
        <div className="space-y-1.5">
          <MiniGauge label="Avg Energy" value={s.neural.avg_energy} color="#22d3ee" tooltipTerm="energy" />
          <MiniGauge
            label="Weak Synapses"
            value={s.neural.weak_synapses_ratio}
            color={s.neural.weak_synapses_ratio > 0.5 ? '#fb923c' : '#4ade80'}
            tooltipTerm="synapse"
          />
        </div>
      </LayerCard>
    </div>
  )
}

// ============================================================================
// SECTION: Skills Layer Card (full width)
// ============================================================================

export function IntelSkillsCard({ data }: { data: IntelligenceData }) {
  const s = data.summary
  if (!s) return null

  return (
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
      <MiniGauge label="Skill Maturity" value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0} color="#ec4899" tooltipTerm="skills_maturity" />
    </LayerCard>
  )
}

// ============================================================================
// SECTION: Behavioral Layer Card (Protocols)
// ============================================================================

export function IntelBehavioralCard({ data }: { data: IntelligenceData }) {
  const s = data.summary
  if (!s || s.behavioral.protocols === 0) return null

  return (
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
        tooltipTerm="skill"
      />
    </LayerCard>
  )
}

// ============================================================================
// SECTION: Attention Needed
// ============================================================================

export function IntelAttention({ data }: { data: IntelligenceData }) {
  const s = data.summary
  if (!s) return null

  const hasIssues =
    s.knowledge.stale_count > 0 ||
    s.neural.dead_notes_count > 0 ||
    s.code.orphans > 5 ||
    (data.health?.risk_assessment && data.health.risk_assessment.critical_count > 0) ||
    (data.health && data.health.god_function_count > 0)

  if (!hasIssues) return null

  return (
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
                <strong>{s.knowledge.stale_count}</strong> <MetricTooltip term="stale_note" showIndicator>stale notes</MetricTooltip> need review
              </span>
            </div>
          )}
          {s.neural.dead_notes_count > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-400">
              <Brain size={12} className="text-cyan-500" />
              <span>
                <strong>{s.neural.dead_notes_count}</strong> <MetricTooltip term="dead_note" showIndicator>dead notes</MetricTooltip> (no energy)
              </span>
            </div>
          )}
          {s.code.orphans > 5 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-950/20 border border-amber-900/30 text-[11px] text-amber-400">
              <FileCode2 size={12} />
              <span>
                <strong>{s.code.orphans}</strong> <MetricTooltip term="orphan" showIndicator>orphan files</MetricTooltip> (no imports/exports)
              </span>
            </div>
          )}
          {data.health?.risk_assessment && data.health.risk_assessment.critical_count > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-950/20 border border-red-900/30 text-[11px] text-red-400">
              <ShieldX size={12} />
              <span>
                <strong>{data.health.risk_assessment.critical_count}</strong> files at critical risk
              </span>
            </div>
          )}
          {data.health && data.health.god_function_count > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-orange-950/20 border border-orange-900/30 text-[11px] text-orange-400">
              <Flame size={12} />
              <span>
                <strong>{data.health.god_function_count}</strong> <MetricTooltip term="god_function" showIndicator>god functions</MetricTooltip> (threshold: {data.health.god_function_threshold})
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// DEFAULT EXPORT — backward compatibility (renders all sections in default order)
// ============================================================================

interface IntelligenceDashboardProps {
  projectSlug: string
  /** Roadmap progress (0–100), integrated into the health breakdown */
  progress?: { percentage: number }
}

export default function IntelligenceDashboard({ projectSlug, progress }: IntelligenceDashboardProps) {
  const data = useIntelligenceData(projectSlug)

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
        <p className="text-sm text-slate-400 mb-3">{data.error}</p>
        <button
          onClick={data.handleRefresh}
          className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data.summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Brain className="w-8 h-8 text-slate-600 mb-3" />
        <p className="text-sm text-slate-500">No intelligence data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <IntelHealthBreakdown data={data} progress={progress} />
      <IntelLayerCards data={data} />
      <IntelSkillsCard data={data} />
      <IntelBehavioralCard data={data} />
      <IntelAttention data={data} />
      <IntelQuickActions data={data} />
    </div>
  )
}
