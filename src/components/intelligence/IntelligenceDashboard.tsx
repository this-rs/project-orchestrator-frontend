import { useState, useEffect, useCallback, useMemo, Fragment, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import {
  Brain,
  FileCode2,
  StickyNote,
  Network,
  Zap,
  AlertTriangle,
  ShieldX,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Flame,
  RefreshCw,
  Sparkles,
  Loader2,
  Check,
  Timer,
  BrainCircuit,
  Waves,
  Search,
  GitBranch,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { EntityList, EntityRow } from '@/components/ui/EntityRow'
import { MetaLine } from '@/components/ui/MetaLine'
import { Section } from '@/components/ui/Section'
import { Skeleton, SkeletonLine } from '@/components/ui/Skeleton'
import { focusRing, hitArea, metaText, surface, textLink } from '@/components/ui/classes'
import { MetricTooltip } from '@/components/ui/MetricTooltip'
import { intelligenceApi } from '@/services/intelligence'
import { codeApi } from '@/services/code'
import { adminApi } from '@/services/admin'
import { projectsApi } from '@/services/projects'
import { intelligenceSummaryAtom } from '@/atoms/intelligence'
import type { IntelligenceSummary } from '@/types/intelligence'
import type { CodeHealth, Project } from '@/types'
import { useT, type MessageKey } from '@/i18n'

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

function healthScoreLabelKey(score: number): MessageKey {
  if (score >= 80) return 'intelDashboard.health.excellent'
  if (score >= 60) return 'intelDashboard.health.good'
  if (score >= 40) return 'intelDashboard.health.needsAttention'
  return 'intelDashboard.health.atRisk'
}

/** Fills the `{name}` markers of a translated sentence with nodes (a tooltip, bold text), keeping the word order of each language. */
function fillTemplate(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1]
    return name !== undefined && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece
  })
}

function CircularGauge({ score, size = 140, showLabel = true }: { score: number; size?: number; showLabel?: boolean }) {
  const { t } = useT()
  const label = t(healthScoreLabelKey(score))
  const strokeWidth = size < 100 ? 7 : 9
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const color = healthScoreColor(score)
  const progress = (score / 100) * circumference

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={t('intelDashboard.health.gaugeAria', { score, label })}>
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
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className={`${size < 100 ? 'text-xl' : 'text-2xl'} font-semibold tabular-nums`} style={{ color }}>
          {score}
        </span>
        {showLabel && <span className="text-[11px] text-gray-500 mt-0.5">{label}</span>}
      </div>
    </div>
  )
}

// ============================================================================
// RISK BADGE
// ============================================================================

function RiskBadge({ risk }: { risk: CodeHealth['risk_assessment'] }) {
  const { t } = useT()
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
        ? t('intelDashboard.risk.critical', { count: risk.critical_count })
        : risk.high_count > 0
          ? t('intelDashboard.risk.high', { count: risk.high_count })
          : t('intelDashboard.risk.avg', { pct: (risk.avg_risk_score * 100).toFixed(0) })}
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
// ACTION STATE (maintenance actions)
// ============================================================================

interface ActionResult {
  key: string
  status: 'idle' | 'running' | 'success' | 'error'
  message?: string
}

/** Error carried by the hook: `message` is absent when the failure has no text of its own (rendered in the viewer's language). */
interface LoadError {
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
  const { t } = useT()
  const [error, setError] = useState<LoadError | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actions, setActions] = useState<Record<string, ActionResult>>({})

  const getAction = useCallback(
    (key: string): ActionResult => {
      const a = actions[key] ?? { key, status: 'idle' }
      return a.status === 'error' && !a.message ? { ...a, message: t('intelDashboard.errors.actionFailed') } : a
    },
    [actions, t],
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
        const message = err instanceof Error && err.message ? err.message : undefined
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
      else throw new Error(summaryData.reason?.message ?? '')

      if (healthData.status === 'fulfilled') setHealth(healthData.value)
      if (projectData.status === 'fulfilled') setProject(projectData.value)
    } catch (err) {
      if (signal?.aborted) return
      setError({ message: err instanceof Error && err.message ? err.message : undefined })
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
    error: error ? (error.message ?? t('intelDashboard.errors.loadFailed')) : null,
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
  const { t } = useT()
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
              <span>{t('intelDashboard.health.title')}</span>
            </MetricTooltip>{' '}
            <span className="font-medium" style={{ color: healthScoreColor(data.healthScore) }}>
              {t(healthScoreLabelKey(data.healthScore))}
            </span>
          </p>
          <MetaLine
            items={[
              t(
                s.code.files + s.code.functions === 1 ? 'intelDashboard.summary.codeEntityOne' : 'intelDashboard.summary.codeEntityOther',
                { count: s.code.files + s.code.functions },
              ),
              t(
                s.knowledge.notes + s.knowledge.decisions === 1 ? 'intelDashboard.summary.knowledgeItemOne' : 'intelDashboard.summary.knowledgeItemOther',
                { count: s.knowledge.notes + s.knowledge.decisions },
              ),
              t(s.skills.total === 1 ? 'intelDashboard.summary.skillOne' : 'intelDashboard.summary.skillOther', { count: s.skills.total }),
            ]}
          />
          {risk && <RiskBadge risk={risk} />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {progress != null && (
          <MiniGauge label={t('intelDashboard.gauges.projectProgress')} value={progress.percentage / 100} color={gaugeColor} />
        )}
        <MiniGauge
          label={t('intelDashboard.gauges.knowledgeCoverage')}
          value={s.code.files > 0 ? Math.min(1, (s.knowledge.notes + s.knowledge.decisions) / s.code.files / 2) : 0}
          color={gaugeColor}
          tooltipTerm="knowledge_coverage"
        />
        <MiniGauge
          label={t('intelDashboard.gauges.noteFreshness')}
          value={s.knowledge.notes > 0 ? 1 - s.knowledge.stale_count / s.knowledge.notes : 1}
          color={gaugeColor}
          tooltipTerm="note_freshness"
        />
        <MiniGauge label={t('intelDashboard.gauges.neuralEnergy')} value={s.neural.avg_energy} color={gaugeColor} tooltipTerm="energy" />
        <MiniGauge
          label={t('intelDashboard.gauges.synapseQuality')}
          value={1 - s.neural.weak_synapses_ratio}
          color={gaugeColor}
          tooltipTerm="synapse_quality"
        />
        <MiniGauge
          label={t('intelDashboard.gauges.skillsMaturity')}
          value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0}
          color={gaugeColor}
          tooltipTerm="skills_maturity"
        />
        {risk && (
          <MiniGauge
            label={t('intelDashboard.gauges.codeSafety')}
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
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={() => void data.handleRefresh()}
      disabled={data.refreshing}
      aria-label={t('intelDashboard.refresh')}
      title={t('intelDashboard.refresh')}
      className={`w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/[0.05] disabled:opacity-50 ${focusRing}`}
    >
      <RefreshCw size={14} className={data.refreshing ? 'animate-spin' : ''} aria-hidden="true" />
    </button>
  )
}

// ============================================================================
// Stat grid — compact 2×2 (phone) / 4×1 (desktop) overview numbers
// ============================================================================

export function IntelStatGrid({
  summary,
  variant = 'compact',
}: {
  summary: IntelligenceSummary
  /** `tiles`: 2×2 big numbers that stretch to the height of their neighbour. */
  variant?: 'compact' | 'tiles'
}) {
  const { t } = useT()
  const s = summary
  const items = [
    {
      icon: FileCode2,
      label: t('intelDashboard.stats.codeEntities'),
      value: s.code.files + s.code.functions,
      sub: t('intelDashboard.stats.codeEntitiesSub', { files: s.code.files, functions: s.code.functions }),
    },
    {
      icon: StickyNote,
      label: t('intelDashboard.stats.notesDecisions'),
      value: s.knowledge.notes + s.knowledge.decisions,
      sub: t('intelDashboard.stats.notesDecisionsSub', { notes: s.knowledge.notes, decisions: s.knowledge.decisions }),
    },
    {
      icon: Sparkles,
      label: t('intelDashboard.stats.skills'),
      value: s.skills.total,
      sub: t('intelDashboard.stats.skillsSub', { active: s.skills.active, emerging: s.skills.emerging }),
    },
    {
      icon: GitBranch,
      label: t('intelDashboard.stats.synapses'),
      value: s.neural.active_synapses,
      sub: t('intelDashboard.stats.synapsesSub', { pct: Math.round(s.neural.avg_energy * 100) }),
    },
  ]
  return (
    <dl
      className={
        variant === 'tiles'
          ? 'grid h-full grid-cols-2 auto-rows-fr gap-2'
          : 'grid grid-cols-2 lg:grid-cols-4 gap-2'
      }
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={`${surface} min-w-0 ${variant === 'tiles' ? 'flex flex-col justify-center px-4 py-3' : 'px-3 py-2.5'}`}
        >
          <dt className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
            <it.icon size={13} className="shrink-0 text-gray-500" aria-hidden="true" />
            <span className="truncate">{it.label}</span>
          </dt>
          <dd
            className={`mt-1 font-semibold tabular-nums text-gray-100 ${variant === 'tiles' ? 'text-2xl leading-8 sm:text-3xl sm:leading-9' : 'text-lg leading-6'}`}
          >
            {it.value.toLocaleString()}
          </dd>
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
  const { t } = useT()
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
        <p className={metaText}>{t('intelDashboard.fallback.loading')}</p>
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
              {t('intelDashboard.fallback.retry')}
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div data-testid="intel-empty" className={surface}>
      <EmptyState size="sm" icon={<Brain aria-hidden="true" />} title={t('intelDashboard.fallback.empty')} />
    </div>
  )
}

// ============================================================================
// SECTION: Quick Actions
// ============================================================================

export function IntelQuickActions({ data }: { data: IntelligenceData }) {
  const { t } = useT()
  if (!data.summary) return null
  const project = data.project

  const actions: { key: string; label: string; icon: typeof Brain; description: string; run: () => Promise<string> }[] = [
    {
      key: 'staleness',
      label: t('intelDashboard.maintenance.staleness.label'),
      icon: Timer,
      description: t('intelDashboard.maintenance.staleness.description'),
      run: async () => {
        const r = await adminApi.updateStaleness()
        await data.handleRefresh()
        return t('intelDashboard.maintenance.staleness.result', { notes: r.notes_updated })
      },
    },
    {
      key: 'energy',
      label: t('intelDashboard.maintenance.energy.label'),
      icon: Zap,
      description: t('intelDashboard.maintenance.energy.description'),
      run: async () => {
        const r = await adminApi.updateEnergy()
        await data.handleRefresh()
        return t('intelDashboard.maintenance.energy.result', { notes: r.notes_updated, days: r.half_life_days })
      },
    },
    {
      key: 'decay',
      label: t('intelDashboard.maintenance.decay.label'),
      icon: Waves,
      description: t('intelDashboard.maintenance.decay.description'),
      run: async () => {
        const r = await adminApi.decayNeurons()
        await data.handleRefresh()
        return t('intelDashboard.maintenance.decay.result', { decayed: r.synapses_decayed, pruned: r.synapses_pruned })
      },
    },
    ...(project
      ? [
          {
            key: 'fabric',
            label: t('intelDashboard.maintenance.fabric.label'),
            icon: Network,
            description: t('intelDashboard.maintenance.fabric.description'),
            run: async () => {
              const r = await adminApi.updateFabricScores({ project_id: project.id })
              await data.handleRefresh()
              return t('intelDashboard.maintenance.fabric.result', { nodes: r.nodes_updated, communities: r.communities })
            },
          },
          {
            key: 'skills',
            label: t('intelDashboard.maintenance.skills.label'),
            icon: BrainCircuit,
            description: t('intelDashboard.maintenance.skills.description'),
            run: async () => {
              const r = await adminApi.detectSkills(project.id)
              await data.handleRefresh()
              return t('intelDashboard.maintenance.skills.result', { created: r.skills_created ?? 0, updated: r.skills_updated ?? 0 })
            },
          },
        ]
      : []),
    {
      key: 'backfill',
      label: t('intelDashboard.maintenance.backfill.label'),
      icon: Search,
      description: t('intelDashboard.maintenance.backfill.description'),
      run: async () => {
        await adminApi.startBackfillSynapses()
        return t('intelDashboard.maintenance.backfill.result')
      },
    },
  ]

  return (
    <Section title={t('intelDashboard.maintenance.title')} count={actions.length} description={t('intelDashboard.maintenance.description')} collapsible defaultOpen={false}>
      <EntityList aria-label={t('intelDashboard.maintenance.listAria')}>
        {actions.map((a) => {
          const state = data.getAction(a.key)
          const running = state.status === 'running'
          const Icon = a.icon
          return (
            <EntityRow
              key={a.key}
              title={a.label}
              ariaLabel={t('intelDashboard.maintenance.runAria', { label: a.label })}
              onClick={() => {
                if (!running) void data.runAction(a.key, a.run)
              }}
              leading={
                running ? (
                  <Loader2 size={14} className="animate-spin text-indigo-400" aria-label={t('intelDashboard.maintenance.running')} />
                ) : state.status === 'success' ? (
                  <Check size={14} className="text-emerald-400" aria-label={t('intelDashboard.maintenance.done')} />
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
                    {t('intelDashboard.maintenance.running')}
                  </span>
                ) : undefined
              }
              trailing={<span className="text-indigo-400/90">{t('intelDashboard.maintenance.run')}</span>}
            />
          )
        })}
      </EntityList>
    </Section>
  )
}

// ============================================================================
// SECTION: Attention Needed
// ============================================================================

export function IntelAttention({ data }: { data: IntelligenceData }) {
  const { t } = useT()
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
          {fillTemplate(t('intelDashboard.attention.stale'), {
            count: <strong className="font-medium tabular-nums">{s.knowledge.stale_count}</strong>,
            term: <MetricTooltip term="stale_note" showIndicator>{t('intelDashboard.attention.staleTerm')}</MetricTooltip>,
          })}
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
          {fillTemplate(t('intelDashboard.attention.dead'), {
            count: <strong className="font-medium tabular-nums">{s.neural.dead_notes_count}</strong>,
            term: <MetricTooltip term="dead_note" showIndicator>{t('intelDashboard.attention.deadTerm')}</MetricTooltip>,
          })}
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
          {fillTemplate(t('intelDashboard.attention.orphans'), {
            count: <strong className="font-medium tabular-nums">{s.code.orphans}</strong>,
            term: <MetricTooltip term="orphan" showIndicator>{t('intelDashboard.attention.orphansTerm')}</MetricTooltip>,
          })}
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
          {fillTemplate(t('intelDashboard.attention.critical'), { count: <strong className="font-medium tabular-nums">{risk.critical_count}</strong> })}
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
          {fillTemplate(t('intelDashboard.attention.god'), {
            count: <strong className="font-medium tabular-nums">{data.health.god_function_count}</strong>,
            term: <MetricTooltip term="god_function" showIndicator>{t('intelDashboard.attention.godTerm')}</MetricTooltip>,
            threshold: data.health.god_function_threshold,
          })}
        </>
      ),
    })

  if (items.length === 0) return null

  return (
    <Section title={t('intelDashboard.attention.title')} count={items.length}>
      <EntityList aria-label={t('intelDashboard.attention.title')}>
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


/**
 * The page's pulse: health gauge + breakdown on the left, the four headline
 * numbers as big tiles on the right. One band, read at a glance, above every list.
 */
export function IntelPulse({
  data,
  progress,
}: {
  data: IntelligenceData
  progress?: { percentage: number }
}) {
  if (!data.summary) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
      <div className="lg:col-span-3 min-w-0">
        <IntelHealthBreakdown data={data} progress={progress} />
      </div>
      <div className="lg:col-span-2 min-w-0">
        <IntelStatGrid summary={data.summary} variant="tiles" />
      </div>
    </div>
  )
}
