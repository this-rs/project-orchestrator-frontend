import { costReport, costToText } from '@/utils/cost'
import { createElement, useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAtom } from 'jotai'
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Folder,
  Network,
  Orbit,
  RefreshCw,
  Search,
  Timer,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  PageContainer,
  PageHeader,
  Section,
  Skeleton,
  StatusIcon,
  TONE_CLASSES,
  formatCost,
  hitArea,
  surface,
  textLink,
  type StatusTone,
  Meter,
  StatTiles,
} from '@/components/ui'
import { intelligenceApi } from '@/services/intelligence'
import { codeApi } from '@/services/code'
import { CommunityVizWidget } from '@/components/particles/widgets'
import type { ParticleHitInfo } from '@/components/particles/ParticleViz'
import { useEmbeddingsVizData } from '@/hooks/useVizData'
import { adminApi } from '@/services/admin'
import { projectsApi } from '@/services/projects'
import { intelligenceSummaryAtom } from '@/atoms/intelligence'
import type { IntelligenceSummary } from '@/types/intelligence'
import type { CodeHealth, Project } from '@/types'
import { useConfirmDialog, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { useT, type MessageKey } from '@/i18n'

// ============================================================================
// HEALTH SCORE
// ============================================================================

/** Compute a 0–100 health score from multiple signals */
function computeHealthScore(s: IntelligenceSummary, h: CodeHealth | null): number {
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

function healthTone(score: number): StatusTone {
  if (score >= 80) return 'success'
  if (score >= 60) return 'info'
  if (score >= 40) return 'warning'
  return 'danger'
}

function healthScoreKey(score: number): MessageKey {
  if (score >= 80) return 'intelPage.health.excellent'
  if (score >= 60) return 'intelPage.health.good'
  if (score >= 40) return 'intelPage.health.needsAttention'
  return 'intelPage.health.atRisk'
}

// ============================================================================
// SMALL PIECES
// ============================================================================

/** Static ring (no tween: the score is data, it updates in place). */
function ScoreRing({ score }: { score: number }) {
  const { t } = useT()
  const size = 88
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const tone = healthTone(score)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={t('intelPage.health.scoreAria', { score, label: t(healthScoreKey(score)) })}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-white/[0.06]" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className={TONE_CLASSES[tone].text}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-semibold tabular-nums ${TONE_CLASSES[tone].text}`}>{score}</span>
      </div>
    </div>
  )
}

// ============================================================================
// QUICK ACTIONS
// ============================================================================

interface ActionResult {
  key: string
  status: 'idle' | 'running' | 'success' | 'error'
  message?: string
}

interface QuickAction {
  key: string
  label: string
  icon: LucideIcon
  description: string
  run: () => Promise<string>
  /** Destructive / irreversible → confirm first. */
  confirm?: string
  hidden?: boolean
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function IntelligencePage() {
  const { t } = useT()
  const { projectSlug } = useParams<{ projectSlug: string }>()
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const [summary, setSummary] = useAtom(intelligenceSummaryAtom)
  const [health, setHealth] = useState<CodeHealth | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Community filter state — set when clicking a cluster label in the viz
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null)

  // Particle viz: communities (embeddings) — enriched with hotspot paths
  const hotspotPaths = useMemo(() => {
    if (!summary) return undefined
    const s2 = summary as IntelligenceSummary
    if (!s2.code.hotspots?.length) return undefined
    return new Set(s2.code.hotspots.map((h) => h.path))
  }, [summary])
  const embeddingsViz = useEmbeddingsVizData(projectSlug, hotspotPaths ? { hotspotPaths } : undefined)

  const codeHref = useCallback(
    (extra: Record<string, string> = {}) => {
      const q = new URLSearchParams({ ...(projectSlug ? { project: projectSlug } : {}), ...extra })
      return workspacePath(wsSlug, `/code?${q.toString()}`)
    },
    [projectSlug, wsSlug],
  )

  // Click handler for community viz particles
  const handleCommunityParticleClick = useCallback(
    (info: ParticleHitInfo) => {
      const filePath = info.metadata?.filePath as string | null
      const clusterLabel = info.metadata?.clusterLabel as string | null

      if (filePath && projectSlug) {
        // Open the file history on the Code page (the former /projects/:slug/code route did not exist → 404)
        navigate(codeHref({ file: filePath }))
      } else if (clusterLabel) {
        setSelectedCommunity((prev) => (prev === clusterLabel ? null : clusterLabel))
      }
    },
    [projectSlug, navigate, codeHref],
  )

  const [actions, setActions] = useState<Record<string, ActionResult>>({})
  const getAction = (key: string): ActionResult => actions[key] ?? { key, status: 'idle' }

  const runAction = useCallback(async (key: string, fn: () => Promise<string>) => {
    setActions((prev) => ({ ...prev, [key]: { key, status: 'running' } }))
    try {
      const message = await fn()
      setActions((prev) => ({ ...prev, [key]: { key, status: 'success', message } }))
      setTimeout(() => {
        setActions((prev) => ({ ...prev, [key]: { key, status: 'idle' } }))
      }, 4000)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('intelPage.page.actionFailed')
      setActions((prev) => ({ ...prev, [key]: { key, status: 'error', message } }))
    }
  }, [t])

  const fetchAll = useCallback(
    async (signal?: AbortSignal) => {
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
        else throw new Error(summaryData.reason?.message ?? t('intelPage.page.loadFailed'))
        if (healthData.status === 'fulfilled') setHealth(healthData.value)
        if (projectData.status === 'fulfilled') setProject(projectData.value)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (signal?.aborted) return
        setError(err instanceof Error ? err.message : t('intelPage.page.loadFailed'))
      }
    },
    [projectSlug, setSummary, t],
  )

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
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  const healthScore = useMemo(() => {
    if (!summary) return 0
    return computeHealthScore(summary as IntelligenceSummary, health)
  }, [summary, health])

  if (loading) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <div className="space-y-3" aria-busy="true" aria-label={t('intelPage.page.loadingAria')}>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
        <EntityListSkeleton rows={4} />
      </PageContainer>
    )
  }
  if (error)
    return (
      <PageContainer width="full">
        <ErrorState description={error} onRetry={handleRefresh} />
      </PageContainer>
    )

  const s = summary as IntelligenceSummary | null
  if (!s)
    return (
      <PageContainer width="full">
        <EmptyState title={t('intelPage.page.emptyTitle')} description={t('intelPage.page.emptyDescription')} />
      </PageContainer>
    )

  const risk = health?.risk_assessment
  const riskTotal = risk ? risk.critical_count + risk.high_count + risk.medium_count + risk.low_count : 0
  const codeSafety = risk ? (riskTotal === 0 ? 1 : (risk.low_count + risk.medium_count * 0.5) / riskTotal) : null

  // Hotspots — filtered by selected community (from the embeddings viz)
  const communityFiles =
    selectedCommunity && embeddingsViz.data
      ? new Set(
          embeddingsViz.data.clusters
            .filter((c) => c.label === selectedCommunity)
            .flatMap((c) => c.files?.map((f) => f.path) ?? []),
        )
      : null
  const filteredHotspots = communityFiles ? s.code.hotspots.filter((h) => communityFiles.has(h.path)) : s.code.hotspots

  // Attention items
  const attention: { key: string; tone: StatusTone; title: string; href: string }[] = []
  if (s.knowledge.stale_count > 0)
    attention.push({ key: 'stale', tone: 'warning', title: s.knowledge.stale_count === 1 ? t('intelPage.attention.staleOne', { count: 1 }) : t('intelPage.attention.staleOther', { count: s.knowledge.stale_count }), href: workspacePath(wsSlug, '/notes') })
  if (s.neural.dead_notes_count > 0)
    attention.push({ key: 'dead', tone: 'neutral', title: s.neural.dead_notes_count === 1 ? t('intelPage.attention.deadOne', { count: 1 }) : t('intelPage.attention.deadOther', { count: s.neural.dead_notes_count }), href: workspacePath(wsSlug, '/notes') })
  if (s.code.orphans > 5)
    attention.push({ key: 'orphans', tone: 'warning', title: t('intelPage.attention.orphans', { count: s.code.orphans }), href: codeHref({ tab: 'health' }) })
  if (risk && risk.critical_count > 0)
    attention.push({ key: 'risk', tone: 'danger', title: risk.critical_count === 1 ? t('intelPage.attention.criticalOne', { count: 1 }) : t('intelPage.attention.criticalOther', { count: risk.critical_count }), href: codeHref({ tab: 'health' }) })
  if (health && health.god_function_count > 0)
    attention.push({ key: 'god', tone: 'warning', title: t('intelPage.attention.god', { count: health.god_function_count, threshold: health.god_function_threshold }), href: codeHref({ tab: 'health' }) })

  const quickActions: QuickAction[] = [
    {
      key: 'staleness',
      label: t('intelPage.actions.staleness.label'),
      icon: Timer,
      description: t('intelPage.actions.staleness.description'),
      run: async () => {
        const r = await adminApi.updateStaleness()
        await handleRefresh()
        return t('intelPage.actions.staleness.result', { count: r.notes_updated })
      },
    },
    {
      key: 'energy',
      label: t('intelPage.actions.energy.label'),
      icon: Zap,
      description: t('intelPage.actions.energy.description'),
      run: async () => {
        const r = await adminApi.updateEnergy()
        await handleRefresh()
        return t('intelPage.actions.energy.result', { count: r.notes_updated, days: r.half_life_days })
      },
    },
    {
      key: 'decay',
      label: t('intelPage.actions.decay.label'),
      icon: Waves,
      description: t('intelPage.actions.decay.description'),
      confirm: t('intelPage.actions.decay.confirm'),
      run: async () => {
        const r = await adminApi.decayNeurons()
        await handleRefresh()
        return t('intelPage.actions.decay.result', { decayed: r.synapses_decayed, pruned: r.synapses_pruned })
      },
    },
    {
      key: 'fabric',
      label: t('intelPage.actions.fabric.label'),
      icon: Network,
      description: t('intelPage.actions.fabric.description'),
      hidden: !project,
      run: async () => {
        const r = await adminApi.updateFabricScores({ project_id: project!.id })
        await handleRefresh()
        return t('intelPage.actions.fabric.result', { nodes: r.nodes_updated, communities: r.communities })
      },
    },
    {
      key: 'skills',
      label: t('intelPage.actions.skills.label'),
      icon: BrainCircuit,
      description: t('intelPage.actions.skills.description'),
      hidden: !project,
      run: async () => {
        const r = await adminApi.detectSkills(project!.id)
        await handleRefresh()
        return t('intelPage.actions.skills.result', { created: r.skills_created ?? 0, updated: r.skills_updated ?? 0 })
      },
    },
    {
      key: 'backfill',
      label: t('intelPage.actions.backfill.label'),
      icon: Search,
      description: t('intelPage.actions.backfill.description'),
      hidden: !project,
      run: async () => {
        await adminApi.startBackfillSynapses()
        return t('intelPage.actions.backfill.result')
      },
    },
  ]

  const triggerAction = (a: QuickAction) => {
    if (a.confirm) {
      confirmDialog.open({
        title: t('intelPage.actions.confirmTitle', { label: a.label }),
        description: a.confirm,
        confirmLabel: a.label,
        variant: 'warning',
        onConfirm: async () => {
          runAction(a.key, a.run)
        },
      })
    } else {
      runAction(a.key, a.run)
    }
  }

  return (
    <PageContainer width="full" className="space-y-6">
      <PageHeader
        title={NOMENCLATURE.insights.plural}
        parentLinks={
          projectSlug
            ? [{ icon: Folder, label: t('intelPage.header.project'), name: project?.name ?? projectSlug, href: workspacePath(wsSlug, `/projects/${projectSlug}`) }]
            : undefined
        }
        meta={[
          t('intelPage.header.codeEntities', { count: s.code.files + s.code.functions }),
          t('intelPage.header.knowledgeItems', { count: s.knowledge.notes + s.knowledge.decisions }),
          s.skills.total === 1 ? t('intelPage.header.skillsOne', { count: 1 }) : t('intelPage.header.skillsOther', { count: s.skills.total }),
        ]}
        actions={
          <>
            <Button size="sm" onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/graph`))}>
              {t('intelPage.header.openGraph')}
              <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/vector-space`))}
            >
              <Orbit className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              {t('intelPage.header.vectorSpace')}
            </Button>
          </>
        }
        overflowActions={[{ label: refreshing ? t('intelPage.header.refreshing') : t('intelPage.header.refresh'), icon: RefreshCw, onClick: handleRefresh, disabled: refreshing }]}
        intro="insights"
        description={t('intelPage.header.description')}
      />

      {/* ── Health ─────────────────────────────────────────────────── */}
      <Section title={t('intelPage.health.title')} description={t('intelPage.health.description')}>
        <div className={`${surface} p-4 flex flex-wrap items-center gap-4`}>
          <div className="flex items-center gap-3">
            <ScoreRing score={healthScore} />
            <div>
              <p className={`text-sm font-medium ${TONE_CLASSES[healthTone(healthScore)].text}`}>{t(healthScoreKey(healthScore))}</p>
              {risk && riskTotal > 0 && (
                <p className="text-[11px] text-gray-500">
                  {risk.critical_count > 0
                    ? t('intelPage.health.critical', { count: risk.critical_count })
                    : risk.high_count > 0
                      ? t('intelPage.health.high', { count: risk.high_count })
                      : t('intelPage.health.avgRisk', { percent: (risk.avg_risk_score * 100).toFixed(0) })}
                </p>
              )}
            </div>
          </div>
          <div className="flex-[1_1_16rem] min-w-0 space-y-1.5">
            <Meter
              label={t('intelPage.health.knowledgeCoverage')}
              value={s.code.files > 0 ? Math.min(1, (s.knowledge.notes + s.knowledge.decisions) / s.code.files / 2) : 0}
            />
            <Meter label={t('intelPage.health.noteFreshness')} value={s.knowledge.notes > 0 ? 1 - s.knowledge.stale_count / s.knowledge.notes : 1} />
            <Meter label={t('intelPage.health.neuralEnergy')} value={s.neural.avg_energy} />
            <Meter label={t('intelPage.health.synapseQuality')} value={1 - s.neural.weak_synapses_ratio} />
            <Meter label={t('intelPage.health.skillsMaturity')} value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0} />
            {codeSafety !== null && <Meter label={t('intelPage.health.codeSafety')} value={codeSafety} />}
          </div>
        </div>
      </Section>

      {/* ── Attention ──────────────────────────────────────────────── */}
      {attention.length > 0 && (
        <Section title={t('intelPage.attention.title')} count={attention.length}>
          <EntityList aria-label={t('intelPage.attention.title')}>
            {attention.map((a) => (
              <EntityRow
                key={a.key}
                title={a.title}
                href={a.href}
                tone={a.tone}
                leading={<StatusIcon tone={a.tone} className={TONE_CLASSES[a.tone].text} />}
                chevron
              />
            ))}
          </EntityList>
        </Section>
      )}

      {/* ── Code layer ─────────────────────────────────────────────── */}
      <Section
        title={selectedCommunity ? t('intelPage.code.titleCommunity', { community: selectedCommunity }) : t('intelPage.code.title')}
        action={
          selectedCommunity ? (
            <button type="button" onClick={() => setSelectedCommunity(null)} className={`px-1 py-2 text-xs ${textLink} ${hitArea}`}>
              {t('intelPage.code.clearFilter')}
            </button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <StatTiles
            items={[
              { label: t('intelPage.code.files'), value: s.code.files },
              { label: t('intelPage.code.functions'), value: s.code.functions },
              { label: t('intelPage.code.communities'), value: s.code.communities },
              { label: t('intelPage.code.orphans'), value: s.code.orphans, tone: s.code.orphans > 10 ? 'warning' : undefined },
            ]}
          />
          {filteredHotspots.length > 0 ? (
            <div>
              <h3 className="px-1 pb-1.5 text-[11px] font-medium text-gray-500">
                {selectedCommunity ? t('intelPage.code.hotspotsIn', { community: selectedCommunity }) : t('intelPage.code.topHotspots')}
              </h3>
              <EntityList aria-label={t('intelPage.code.hotspotsAria')}>
                {filteredHotspots.slice(0, 5).map((h) => (
                  <EntityRow
                    key={h.path}
                    title={<span className="font-mono">{h.path.split('/').pop() ?? h.path}</span>}
                    ariaLabel={t('intelPage.code.historyOf', { path: h.path })}
                    href={codeHref({ file: h.path })}
                    description={<span className="font-mono break-all">{h.path}</span>}
                    trailing={t('intelPage.code.churn', { score: h.churn_score.toFixed(1) })}
                  />
                ))}
              </EntityList>
            </div>
          ) : selectedCommunity ? (
            <EmptyState size="sm" title={t('intelPage.code.noHotspots')} />
          ) : null}
        </div>
      </Section>

      {/* ── Communities map (canvas mounted on demand — it is costly on phones) ── */}
      {embeddingsViz.data && (
        <Section
          title={t('intelPage.code.mapTitle')}
          collapsible
          defaultOpen={false}
          description={t('intelPage.code.mapDescription')}
        >
          <div className="rounded-xl overflow-hidden">
            <CommunityVizWidget
              data={embeddingsViz.data}
              height={300}
              interactive
              onParticleClick={handleCommunityParticleClick}
            />
          </div>
          {selectedCommunity && (
            <p className="mt-2 text-[11px] text-gray-400">
              {t('intelPage.code.filtering')} <strong className="text-gray-200">{selectedCommunity}</strong>{' '}
              <button type="button" onClick={() => setSelectedCommunity(null)} className={`px-1 py-2 ${textLink} ${hitArea}`}>
                {t('intelPage.code.clear')}
              </button>
            </p>
          )}
        </Section>
      )}

      {/* ── Knowledge ──────────────────────────────────────────────── */}
      <Section title={t('intelPage.knowledge.title')} description={t('intelPage.knowledge.description')}>
        <div className="space-y-2">
          <StatTiles
            cols={2}
            items={[
              { label: t('intelPage.knowledge.notes'), value: s.knowledge.notes, sub: s.knowledge.stale_count > 0 ? t('intelPage.knowledge.stale', { count: s.knowledge.stale_count }) : undefined },
              { label: t('intelPage.knowledge.decisions'), value: s.knowledge.decisions },
            ]}
          />
          {Object.keys(s.knowledge.types_distribution).length > 0 && (
            <p className="px-1 text-[11px] leading-5 text-gray-500">
              {t('intelPage.knowledge.noteTypes')}{' '}
              {Object.entries(s.knowledge.types_distribution).map(([type, count], i) => (
                <span key={type}>
                  {i > 0 && ' · '}
                  {type} <span className="tabular-nums text-gray-300">{count}</span>
                </span>
              ))}
            </p>
          )}
        </div>
      </Section>

      <Section title={t('intelPage.fabric.title')} description={t('intelPage.fabric.description')}>
        <div className="space-y-2">
          <StatTiles
            cols={2}
            items={[
              { label: t('intelPage.fabric.coChanged'), value: s.fabric.co_changed_pairs },
              {
                label: t('intelPage.fabric.avgCoupling'),
                hidden: !health?.coupling_metrics,
                value: health?.coupling_metrics?.avg_clustering_coefficient.toFixed(2),
                sub: health?.coupling_metrics ? t('intelPage.fabric.max', { value: health.coupling_metrics.max_clustering_coefficient.toFixed(2) }) : undefined,
              },
            ]}
          />
          {health && health.circular_dependency_count > 0 && (
            <p className={`px-1 text-xs ${TONE_CLASSES.danger.text}`}>{health.circular_dependency_count === 1 ? t('intelPage.fabric.circularOne', { count: 1 }) : t('intelPage.fabric.circularOther', { count: health.circular_dependency_count })}</p>
          )}
          {health?.coupling_metrics?.most_coupled_file && (
            <p className="px-1 text-[11px] text-gray-500">
              {t('intelPage.fabric.mostCoupled')} <span className="font-mono text-gray-400 break-all">{health.coupling_metrics.most_coupled_file}</span>
            </p>
          )}
        </div>
      </Section>

      <Section title={t('intelPage.neural.title')} description={t('intelPage.neural.description')}>
        <div className="space-y-3">
          <StatTiles
            cols={2}
            items={[
              { label: t('intelPage.neural.activeSynapses'), value: s.neural.active_synapses },
              { label: t('intelPage.neural.deadNotes'), value: s.neural.dead_notes_count, tone: s.neural.dead_notes_count > 5 ? 'danger' : undefined },
            ]}
          />
          <div className="space-y-1.5 px-1">
            <Meter label={t('intelPage.neural.avgEnergy')} value={s.neural.avg_energy} />
            <Meter
              label={t('intelPage.neural.weakSynapses')}
              value={s.neural.weak_synapses_ratio}
              tone={s.neural.weak_synapses_ratio > 0.5 ? 'warning' : 'success'}
            />
          </div>
        </div>
      </Section>

      <Section title={t('intelPage.skills.title')} description={t('intelPage.skills.activations', { count: s.skills.total_activations })}>
        <div className="space-y-3">
          <StatTiles
            items={[
              { label: t('intelPage.skills.total'), value: s.skills.total },
              { label: t('intelPage.skills.active'), value: s.skills.active },
              { label: t('intelPage.skills.emerging'), value: s.skills.emerging },
              { label: t('intelPage.skills.avgCohesion'), value: `${(s.skills.avg_cohesion * 100).toFixed(0)}%` },
            ]}
          />
          <div className="px-1">
            <Meter label={t('intelPage.skills.maturity')} value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0} />
          </div>
        </div>
      </Section>

      {s.behavioral.protocols > 0 && (
        <Section title={t('intelPage.behavioral.title')} description={t('intelPage.behavioral.description', { states: s.behavioral.states, transitions: s.behavioral.transitions })}>
          <div className="space-y-3">
            <StatTiles
              items={[
                { label: t('intelPage.behavioral.protocols'), value: s.behavioral.protocols },
                { label: t('intelPage.behavioral.system'), value: s.behavioral.system_protocols },
                { label: t('intelPage.behavioral.business'), value: s.behavioral.business_protocols },
                { label: t('intelPage.behavioral.skillLinked'), value: s.behavioral.skill_linked },
              ]}
            />
            <div className="px-1">
              <Meter label={t('intelPage.behavioral.skillCoverage')} value={s.behavioral.skill_linked / s.behavioral.protocols} />
            </div>
          </div>
        </Section>
      )}

      {s.pm && (
        <Section
          title={t('intelPage.pm.title')}
          description={t('intelPage.pm.summary', {
            milestones: s.pm.milestones === 1 ? t('intelPage.pm.milestoneOne', { count: 1 }) : t('intelPage.pm.milestoneOther', { count: s.pm.milestones }),
            releases: s.pm.releases === 1 ? t('intelPage.pm.releaseOne', { count: 1 }) : t('intelPage.pm.releaseOther', { count: s.pm.releases }),
          })}
        >
          <div className="space-y-3">
            <StatTiles
              items={[
                { label: t('intelPage.pm.plans'), value: s.pm.plans },
                { label: t('intelPage.pm.tasks'), value: s.pm.tasks, sub: t('intelPage.pm.inProgress', { count: s.pm.tasks_in_progress }) },
                { label: t('intelPage.pm.completed'), value: s.pm.tasks_completed },
                { label: t('intelPage.pm.steps'), value: s.pm.steps },
              ]}
            />
            <div className="px-1">
              <Meter label={t('intelPage.pm.completion')} value={s.pm.completion_rate > 1 ? s.pm.completion_rate / 100 : s.pm.completion_rate} />
            </div>
          </div>
        </Section>
      )}

      {s.chat && (
        <Section title={t('intelPage.chat.title')} description={t('intelPage.chat.description')}>
          <StatTiles
            items={[
              { label: t('intelPage.chat.sessions'), value: s.chat.sessions },
              { label: t('intelPage.chat.messages'), value: s.chat.total_messages },
              { label: t('intelPage.chat.entities'), value: s.chat.discussed_entity_count },
              { label: t('intelPage.chat.cost'), value: costToText(costReport(s.chat.total_cost_usd, undefined), { hideZero: true, format: (usd) => formatCost(usd) ?? '' }) ?? '—' },
            ]}
          />
        </Section>
      )}

      {/* ── Maintenance ────────────────────────────────────────────── */}
      <Section title={t('intelPage.actions.title')} description={t('intelPage.actions.description')}>
        <EntityList aria-label={t('intelPage.actions.title')}>
          {quickActions
            .filter((a) => !a.hidden)
            .map((a) => {
              const st = getAction(a.key)
              return (
                <EntityRow
                  key={a.key}
                  title={a.label}
                  description={a.description}
                  leading={createElement(a.icon, { className: 'w-4 h-4 text-gray-500', 'aria-hidden': true })}
                  meta={
                    st.status === 'success' && st.message ? (
                      <span className={`text-[11px] ${TONE_CLASSES.success.text}`}>{st.message}</span>
                    ) : st.status === 'error' && st.message ? (
                      <span className={`text-[11px] ${TONE_CLASSES.danger.text}`}>{st.message}</span>
                    ) : undefined
                  }
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      flat
                      loading={st.status === 'running'}
                      disabled={st.status === 'running'}
                      onClick={() => triggerAction(a)}
                      aria-label={t('intelPage.actions.runAria', { label: a.label })}
                      className="my-1.5 mr-1.5"
                    >
                      {st.status === 'success' ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : t('intelPage.actions.run')}
                    </Button>
                  }
                />
              )
            })}
        </EntityList>
      </Section>

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageContainer>
  )
}
