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
import { EmptyState } from '@/components/ui/EmptyState'
import { EntityList, EntityRow } from '@/components/ui/EntityRow'
import { MetaLine } from '@/components/ui/MetaLine'
import { Section } from '@/components/ui/Section'
import { Skeleton, SkeletonLine } from '@/components/ui/Skeleton'
import { pluralize } from '@/components/ui/format'
import { focusRing, hitArea, metaText, surface, textLink } from '@/components/ui/classes'
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

function CircularGauge({ score, size = 140, showLabel = true }: { score: number; size?: number; showLabel?: boolean }) {
  const strokeWidth = size < 100 ? 7 : 9
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const color = healthScoreColor(score)
  const progress = (score / 100) * circumference

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Health score ${score} of 100, ${healthScoreLabel(score)}`}>
      <svg width={size} height={size} className="transform -rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
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
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className={`${size < 100 ? 'text-xl' : 'text-2xl'} font-semibold tabular-nums`} style={{ color }}>
          {score}
        </span>
        {showLabel && <span className="text-[11px] text-gray-500 mt-0.5">{healthScoreLabel(score)}</span>}
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
    <div className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color }}>
      <Icon size={12} aria-hidden="true" />
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
    <span className="text-xs text-gray-400 w-32 shrink-0 truncate">{label}</span>
  )
  return (
    <div className="flex items-center gap-2 min-w-0">
      {tooltipTerm ? (
        <MetricTooltip term={tooltipTerm} showIndicator>{labelEl}</MetricTooltip>
      ) : labelEl}
      <div
        className="flex-1 min-w-0 h-1.5 bg-white/[0.06] rounded-full overflow-hidden"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] text-gray-400 w-9 shrink-0 text-right tabular-nums">
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

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    if (!projectSlug) return
    setError(null)
    try {
      const [summaryData, healthData, projectData] = await Promise.allSettled([
        intelligenceApi.getSummary(projectSlug, signal),
        codeApi.getHealth({ project_slug: projectSlug }, signal),
        projectsApi.get(projectSlug, signal),
      ])

      if (signal?.aborted) return

      if (summaryData.status === 'fulfilled') setSummary(summaryData.value)
      else throw new Error(summaryData.reason?.message ?? 'Failed to load intelligence data')

      if (healthData.status === 'fulfilled') setHealth(healthData.value)
      if (projectData.status === 'fulfilled') setProject(projectData.value)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load intelligence data')
    }
  }, [projectSlug, setSummary])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchAll(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [fetchAll])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll() // No signal — user-initiated, should not be cancelled
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
  const risk = data.health?.risk_assessment
  const gaugeColor = '#818cf8' // indigo-400 — single accent, meaning carried by labels

  return (
    <div className={`${surface} p-4 space-y-4`}>
      <div className="flex items-center gap-4 min-w-0">
        <CircularGauge score={data.healthScore} size={84} showLabel={false} />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm text-gray-200">
            <MetricTooltip term="health_score">
              <span>Health</span>
            </MetricTooltip>{' '}
            <span className="font-medium" style={{ color: healthScoreColor(data.healthScore) }}>
              {healthScoreLabel(data.healthScore)}
            </span>
          </p>
          <MetaLine
            items={[
              pluralize(s.code.files + s.code.functions, 'code entity', 'code entities'),
              pluralize(s.knowledge.notes + s.knowledge.decisions, 'knowledge item'),
              pluralize(s.skills.total, 'skill'),
            ]}
          />
          {risk && <RiskBadge risk={risk} />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {progress != null && (
          <MiniGauge label="Project progress" value={progress.percentage / 100} color={gaugeColor} />
        )}
        <MiniGauge
          label="Knowledge coverage"
          value={s.code.files > 0 ? Math.min(1, (s.knowledge.notes + s.knowledge.decisions) / s.code.files / 2) : 0}
          color={gaugeColor}
          tooltipTerm="knowledge_coverage"
        />
        <MiniGauge
          label="Note freshness"
          value={s.knowledge.notes > 0 ? 1 - s.knowledge.stale_count / s.knowledge.notes : 1}
          color={gaugeColor}
          tooltipTerm="note_freshness"
        />
        <MiniGauge label="Neural energy" value={s.neural.avg_energy} color={gaugeColor} tooltipTerm="energy" />
        <MiniGauge
          label="Synapse quality"
          value={1 - s.neural.weak_synapses_ratio}
          color={gaugeColor}
          tooltipTerm="synapse_quality"
        />
        <MiniGauge
          label="Skills maturity"
          value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0}
          color={gaugeColor}
          tooltipTerm="skills_maturity"
        />
        {risk && (
          <MiniGauge
            label="Code safety"
            value={(() => {
              const total = risk.critical_count + risk.high_count + risk.medium_count + risk.low_count
              if (total === 0) return 1
              return (risk.low_count + risk.medium_count * 0.5) / total
            })()}
            color={gaugeColor}
            tooltipTerm="code_safety"
          />
        )}
      </div>
    </div>
  )
}

/** Refresh button for a Section header (reloads the intelligence summary). */
export function IntelRefreshButton({ data }: { data: Pick<IntelligenceData, 'refreshing' | 'handleRefresh'> }) {
  return (
    <button
      type="button"
      onClick={() => void data.handleRefresh()}
      disabled={data.refreshing}
      aria-label="Refresh intelligence data"
      title="Refresh intelligence data"
      className={`w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/[0.05] disabled:opacity-50 ${focusRing}`}
    >
      <RefreshCw size={14} className={data.refreshing ? 'animate-spin' : ''} aria-hidden="true" />
    </button>
  )
}

// ============================================================================
// Stat grid — compact 2×2 (phone) / 4×1 (desktop) overview numbers
// ============================================================================

export function IntelStatGrid({ summary }: { summary: IntelligenceSummary }) {
  const s = summary
  const items = [
    {
      icon: FileCode2,
      label: 'Code entities',
      value: s.code.files + s.code.functions,
      sub: `${s.code.files} files · ${s.code.functions} functions`,
    },
    {
      icon: StickyNote,
      label: 'Notes & decisions',
      value: s.knowledge.notes + s.knowledge.decisions,
      sub: `${s.knowledge.notes} notes · ${s.knowledge.decisions} decisions`,
    },
    {
      icon: Sparkles,
      label: 'Skills',
      value: s.skills.total,
      sub: `${s.skills.active} active · ${s.skills.emerging} emerging`,
    },
    {
      icon: GitBranch,
      label: 'Synapses',
      value: s.neural.active_synapses,
      sub: `${Math.round(s.neural.avg_energy * 100)}% avg energy`,
    },
  ]
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {items.map((it) => (
        <div key={it.label} className={`${surface} px-3 py-2.5 min-w-0`}>
          <dt className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
            <it.icon size={13} className="shrink-0 text-gray-500" aria-hidden="true" />
            <span className="truncate">{it.label}</span>
          </dt>
          <dd className="mt-1 text-lg font-semibold leading-6 tabular-nums text-gray-100">{it.value.toLocaleString()}</dd>
          <dd className={`${metaText} tabular-nums`}>{it.sub}</dd>
        </div>
      ))}
    </dl>
  )
}

// ============================================================================
// Fallback — loading / error / empty state for intelligence sections
// (regression: intel sections must never be blank)
// ============================================================================

export function IntelFallback({
  intelligence,
}: {
  intelligence: { loading: boolean; error: string | null; summary: unknown | null; handleRefresh: () => void | Promise<void> }
}) {
  if (intelligence.loading) {
    return (
      <div data-testid="intel-loading" aria-busy="true" className={`${surface} p-4 space-y-3`}>
        <div className="flex items-center gap-4">
          <Skeleton className="w-[84px] h-[84px] !rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonLine width="40%" />
            <SkeletonLine width="70%" />
          </div>
        </div>
        <p className={metaText}>Loading intelligence data…</p>
      </div>
    )
  }

  if (intelligence.error) {
    return (
      <div data-testid="intel-error" className={surface}>
        <EmptyState
          size="sm"
          icon={<AlertTriangle aria-hidden="true" />}
          title={intelligence.error}
          action={
            <button type="button" onClick={() => void intelligence.handleRefresh()} className={`text-xs ${textLink} ${hitArea}`}>
              Retry
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div data-testid="intel-empty" className={surface}>
      <EmptyState size="sm" icon={<Brain aria-hidden="true" />} title="No intelligence data available. Sync your projects first." />
    </div>
  )
}

// ============================================================================
// SECTION: Quick Actions
// ============================================================================

export function IntelQuickActions({ data }: { data: IntelligenceData }) {
  if (!data.summary) return null
  const project = data.project

  const actions: { key: string; label: string; icon: typeof Brain; description: string; run: () => Promise<string> }[] = [
    {
      key: 'staleness',
      label: 'Update staleness',
      icon: Timer,
      description: 'Recalculate staleness scores for all notes',
      run: async () => {
        const r = await adminApi.updateStaleness()
        await data.handleRefresh()
        return `${r.notes_updated} notes updated`
      },
    },
    {
      key: 'energy',
      label: 'Recalculate energy',
      icon: Zap,
      description: 'Update neural energy scores based on activity',
      run: async () => {
        const r = await adminApi.updateEnergy()
        await data.handleRefresh()
        return `${r.notes_updated} notes updated (half-life: ${r.half_life_days}d)`
      },
    },
    {
      key: 'decay',
      label: 'Decay synapses',
      icon: Waves,
      description: 'Decay weak synapses and prune dead connections',
      run: async () => {
        const r = await adminApi.decayNeurons()
        await data.handleRefresh()
        return `${r.synapses_decayed} decayed, ${r.synapses_pruned} pruned`
      },
    },
    ...(project
      ? [
          {
            key: 'fabric',
            label: 'Update fabric scores',
            icon: Network,
            description: 'Recalculate GDS metrics (PageRank, communities)',
            run: async () => {
              const r = await adminApi.updateFabricScores({ project_id: project.id })
              await data.handleRefresh()
              return `${r.nodes_updated} nodes, ${r.communities} communities`
            },
          },
          {
            key: 'skills',
            label: 'Detect skills',
            icon: BrainCircuit,
            description: 'Auto-detect emergent skills from note clusters',
            run: async () => {
              const r = await adminApi.detectSkills(project.id)
              await data.handleRefresh()
              return `${r.skills_created ?? 0} new, ${r.skills_updated ?? 0} updated`
            },
          },
        ]
      : []),
    {
      key: 'backfill',
      label: 'Backfill synapses',
      icon: Search,
      description: 'Create missing synapses from semantic similarity',
      run: async () => {
        await adminApi.startBackfillSynapses()
        return 'Backfill job started'
      },
    },
  ]

  return (
    <Section title="Maintenance" count={actions.length} description="Knowledge graph maintenance" collapsible defaultOpen={false}>
      <EntityList aria-label="Maintenance actions">
        {actions.map((a) => {
          const state = data.getAction(a.key)
          const running = state.status === 'running'
          const Icon = a.icon
          return (
            <EntityRow
              key={a.key}
              title={a.label}
              ariaLabel={`Run: ${a.label}`}
              onClick={() => {
                if (!running) void data.runAction(a.key, a.run)
              }}
              leading={
                running ? (
                  <Loader2 size={14} className="animate-spin text-indigo-400" aria-label="Running" />
                ) : state.status === 'success' ? (
                  <Check size={14} className="text-emerald-400" aria-label="Done" />
                ) : (
                  <Icon size={14} className="text-gray-500" aria-hidden="true" />
                )
              }
              description={a.description}
              meta={
                state.message ? (
                  <span role="status" className={`text-[11px] ${state.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {state.message}
                  </span>
                ) : running ? (
                  <span role="status" className={metaText}>
                    Running…
                  </span>
                ) : undefined
              }
              trailing={<span className="text-indigo-400/90">Run</span>}
            />
          )
        })}
      </EntityList>
    </Section>
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

  const risk = data.health?.risk_assessment
  const items: { key: string; icon: typeof Brain; tone: string; text: React.ReactNode }[] = []
  if (s.knowledge.stale_count > 0)
    items.push({
      key: 'stale',
      icon: StickyNote,
      tone: 'text-amber-400',
      text: (
        <>
          <strong className="font-medium tabular-nums">{s.knowledge.stale_count}</strong>{' '}
          <MetricTooltip term="stale_note" showIndicator>stale notes</MetricTooltip> need review
        </>
      ),
    })
  if (s.neural.dead_notes_count > 0)
    items.push({
      key: 'dead',
      icon: Brain,
      tone: 'text-gray-400',
      text: (
        <>
          <strong className="font-medium tabular-nums">{s.neural.dead_notes_count}</strong>{' '}
          <MetricTooltip term="dead_note" showIndicator>dead notes</MetricTooltip> (no energy)
        </>
      ),
    })
  if (s.code.orphans > 5)
    items.push({
      key: 'orphans',
      icon: FileCode2,
      tone: 'text-amber-400',
      text: (
        <>
          <strong className="font-medium tabular-nums">{s.code.orphans}</strong>{' '}
          <MetricTooltip term="orphan" showIndicator>orphan files</MetricTooltip> (no imports/exports)
        </>
      ),
    })
  if (risk && risk.critical_count > 0)
    items.push({
      key: 'critical',
      icon: ShieldX,
      tone: 'text-red-400',
      text: (
        <>
          <strong className="font-medium tabular-nums">{risk.critical_count}</strong> files at critical risk
        </>
      ),
    })
  if (data.health && data.health.god_function_count > 0)
    items.push({
      key: 'god',
      icon: Flame,
      tone: 'text-orange-400',
      text: (
        <>
          <strong className="font-medium tabular-nums">{data.health.god_function_count}</strong>{' '}
          <MetricTooltip term="god_function" showIndicator>god functions</MetricTooltip> (threshold:{' '}
          {data.health.god_function_threshold})
        </>
      ),
    })

  if (items.length === 0) return null

  return (
    <Section title="Attention needed" count={items.length}>
      <EntityList aria-label="Attention needed">
        {items.map((it) => (
          <EntityRow
            key={it.key}
            leading={<it.icon size={14} className={it.tone} aria-hidden="true" />}
            title={<span className="text-gray-300">{it.text}</span>}
          />
        ))}
      </EntityList>
    </Section>
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
