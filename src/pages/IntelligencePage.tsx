import { createElement, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
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
  StatusDot,
  TONE_CLASSES,
  pluralize,
  surface,
  textLink,
  type StatusTone,
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
  if (score >= 60) return 'warning'
  if (score >= 40) return 'warning'
  return 'danger'
}

function healthScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs Attention'
  return 'At Risk'
}

const ratioTone = (v: number): StatusTone => (v >= 0.7 ? 'success' : v >= 0.4 ? 'warning' : 'danger')

// ============================================================================
// SMALL PIECES
// ============================================================================

/** Static ring (no tween: the score is data, it updates in place). */
function ScoreRing({ score }: { score: number }) {
  const size = 88
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const tone = healthTone(score)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Health score ${score} of 100, ${healthScoreLabel(score)}`}>
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

/** Label · bar · percentage. `value` in 0–1. */
function Meter({ label, value, tone, hint }: { label: string; value: number; tone?: StatusTone; hint?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100))
  const t = tone ?? ratioTone(value)
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-32 shrink-0 truncate">{label}</span>
        <span className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden" aria-hidden="true">
          <span className={`block h-full rounded-full ${TONE_CLASSES[t].dot}`} style={{ width: `${pct}%` }} />
        </span>
        <span className="text-[11px] tabular-nums text-gray-400 w-9 text-right">{pct.toFixed(0)}%</span>
      </div>
      {hint && <p className="text-[11px] leading-4 text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

interface Stat {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: StatusTone
  hidden?: boolean
}

function StatGrid({ items, cols = 4 }: { items: Stat[]; cols?: 2 | 4 }) {
  return (
    <dl className={`grid grid-cols-2 ${cols === 4 ? 'sm:grid-cols-4' : ''} gap-2`}>
      {items
        .filter((i) => !i.hidden)
        .map((item) => (
          <div key={item.label} className={`${surface} px-3 py-2 min-w-0 flex flex-col-reverse justify-end`}>
            {item.sub && <p className="text-[11px] leading-4 text-gray-600 break-words">{item.sub}</p>}
            <dt className="text-[11px] leading-4 text-gray-500">{item.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${item.tone ? TONE_CLASSES[item.tone].text : 'text-gray-100'}`}>
              {item.value}
            </dd>
          </div>
        ))}
    </dl>
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
      const message = err instanceof Error ? err.message : 'Action failed'
      setActions((prev) => ({ ...prev, [key]: { key, status: 'error', message } }))
    }
  }, [])

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
        else throw new Error(summaryData.reason?.message ?? 'Failed to load intelligence data')
        if (healthData.status === 'fulfilled') setHealth(healthData.value)
        if (projectData.status === 'fulfilled') setProject(projectData.value)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (signal?.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load intelligence data')
      }
    },
    [projectSlug, setSummary],
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
        <div className="space-y-3" aria-busy="true" aria-label="Loading intelligence">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
        <EntityListSkeleton rows={4} />
      </PageContainer>
    )
  }
  if (error)
    return (
      <PageContainer width="wide">
        <ErrorState description={error} onRetry={handleRefresh} />
      </PageContainer>
    )

  const s = summary as IntelligenceSummary | null
  if (!s)
    return (
      <PageContainer width="wide">
        <ErrorState description="No data available" />
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
    attention.push({ key: 'stale', tone: 'warning', title: `${pluralize(s.knowledge.stale_count, 'stale note')} need review`, href: workspacePath(wsSlug, '/notes') })
  if (s.neural.dead_notes_count > 0)
    attention.push({ key: 'dead', tone: 'neutral', title: `${pluralize(s.neural.dead_notes_count, 'dead note')} (no energy)`, href: workspacePath(wsSlug, '/notes') })
  if (s.code.orphans > 5)
    attention.push({ key: 'orphans', tone: 'warning', title: `${s.code.orphans} orphan files (no imports/exports)`, href: codeHref({ tab: 'sante' }) })
  if (risk && risk.critical_count > 0)
    attention.push({ key: 'risk', tone: 'danger', title: `${pluralize(risk.critical_count, 'file')} at critical risk`, href: codeHref({ tab: 'sante' }) })
  if (health && health.god_function_count > 0)
    attention.push({ key: 'god', tone: 'warning', title: `${health.god_function_count} god functions (threshold: ${health.god_function_threshold})`, href: codeHref({ tab: 'sante' }) })

  const quickActions: QuickAction[] = [
    {
      key: 'staleness',
      label: 'Update Staleness',
      icon: Timer,
      description: 'Recalculate staleness scores for all notes',
      run: async () => {
        const r = await adminApi.updateStaleness()
        await handleRefresh()
        return `${r.notes_updated} notes updated`
      },
    },
    {
      key: 'energy',
      label: 'Recalculate Energy',
      icon: Zap,
      description: 'Update neural energy scores based on activity',
      run: async () => {
        const r = await adminApi.updateEnergy()
        await handleRefresh()
        return `${r.notes_updated} notes updated (half-life: ${r.half_life_days}d)`
      },
    },
    {
      key: 'decay',
      label: 'Decay Synapses',
      icon: Waves,
      description: 'Decay weak synapses and prune dead connections',
      confirm: 'Weak synapses are weakened and the dead ones permanently pruned.',
      run: async () => {
        const r = await adminApi.decayNeurons()
        await handleRefresh()
        return `${r.synapses_decayed} decayed, ${r.synapses_pruned} pruned`
      },
    },
    {
      key: 'fabric',
      label: 'Update Fabric Scores',
      icon: Network,
      description: 'Recalculate GDS metrics (PageRank, communities)',
      hidden: !project,
      run: async () => {
        const r = await adminApi.updateFabricScores({ project_id: project!.id })
        await handleRefresh()
        return `${r.nodes_updated} nodes, ${r.communities} communities`
      },
    },
    {
      key: 'skills',
      label: 'Detect Skills',
      icon: BrainCircuit,
      description: 'Auto-detect emergent skills from note clusters',
      hidden: !project,
      run: async () => {
        const r = await adminApi.detectSkills(project!.id)
        await handleRefresh()
        return `${r.skills_created ?? 0} new, ${r.skills_updated ?? 0} updated`
      },
    },
    {
      key: 'backfill',
      label: 'Backfill Synapses',
      icon: Search,
      description: 'Create missing synapses from semantic similarity',
      hidden: !project,
      run: async () => {
        await adminApi.startBackfillSynapses()
        return 'Backfill job started'
      },
    },
  ]

  const triggerAction = (a: QuickAction) => {
    if (a.confirm) {
      confirmDialog.open({
        title: `${a.label}?`,
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
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title="Intelligence"
        parentLinks={
          projectSlug
            ? [{ icon: Folder, label: 'Project', name: project?.name ?? projectSlug, href: workspacePath(wsSlug, `/projects/${projectSlug}`) }]
            : undefined
        }
        meta={[
          `${s.code.files + s.code.functions} code entities`,
          `${s.knowledge.notes + s.knowledge.decisions} knowledge items`,
          pluralize(s.skills.total, 'skill'),
        ]}
        actions={
          <>
            <Button size="sm" onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/graph`))}>
              Open graph
              <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence/vector-space`))}
            >
              <Orbit className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              Vector space
            </Button>
          </>
        }
        overflowActions={[{ label: refreshing ? 'Refreshing…' : 'Refresh', icon: RefreshCw, onClick: handleRefresh, disabled: refreshing }]}
        description="Multi-layer knowledge graph overview: code, knowledge, neural memory, skills and protocols."
      />

      {/* ── Health ─────────────────────────────────────────────────── */}
      <Section title="Health" description="Average of the signals below — each bar is 0–100%, higher is better.">
        <div className={`${surface} p-4 flex flex-wrap items-center gap-4`}>
          <div className="flex items-center gap-3">
            <ScoreRing score={healthScore} />
            <div>
              <p className={`text-sm font-medium ${TONE_CLASSES[healthTone(healthScore)].text}`}>{healthScoreLabel(healthScore)}</p>
              {risk && riskTotal > 0 && (
                <p className="text-[11px] text-gray-500">
                  {risk.critical_count > 0
                    ? `${risk.critical_count} critical`
                    : risk.high_count > 0
                      ? `${risk.high_count} high risk`
                      : `Avg risk ${(risk.avg_risk_score * 100).toFixed(0)}%`}
                </p>
              )}
            </div>
          </div>
          <div className="flex-[1_1_16rem] min-w-0 space-y-1.5">
            <Meter
              label="Knowledge coverage"
              value={s.code.files > 0 ? Math.min(1, (s.knowledge.notes + s.knowledge.decisions) / s.code.files / 2) : 0}
            />
            <Meter label="Note freshness" value={s.knowledge.notes > 0 ? 1 - s.knowledge.stale_count / s.knowledge.notes : 1} />
            <Meter label="Neural energy" value={s.neural.avg_energy} />
            <Meter label="Synapse quality" value={1 - s.neural.weak_synapses_ratio} />
            <Meter label="Skills maturity" value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0} />
            {codeSafety !== null && <Meter label="Code safety" value={codeSafety} />}
          </div>
        </div>
      </Section>

      {/* ── Attention ──────────────────────────────────────────────── */}
      {attention.length > 0 && (
        <Section title="Attention needed" count={attention.length}>
          <EntityList aria-label="Attention needed">
            {attention.map((a) => (
              <EntityRow key={a.key} title={a.title} href={a.href} leading={<StatusDot tone={a.tone} />} chevron />
            ))}
          </EntityList>
        </Section>
      )}

      {/* ── Code layer ─────────────────────────────────────────────── */}
      <Section
        title={selectedCommunity ? `Code — ${selectedCommunity}` : 'Code'}
        action={
          selectedCommunity ? (
            <button type="button" onClick={() => setSelectedCommunity(null)} className={`px-1 py-2 text-xs ${textLink}`}>
              Clear filter
            </button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <StatGrid
            items={[
              { label: 'Files', value: s.code.files },
              { label: 'Functions', value: s.code.functions },
              { label: 'Communities', value: s.code.communities },
              { label: 'Orphans', value: s.code.orphans, tone: s.code.orphans > 10 ? 'warning' : undefined },
            ]}
          />
          {filteredHotspots.length > 0 ? (
            <div>
              <h3 className="px-1 pb-1.5 text-[11px] font-medium text-gray-500">
                {selectedCommunity ? `Hotspots in ${selectedCommunity}` : 'Top hotspots'}
              </h3>
              <EntityList aria-label="Hotspots">
                {filteredHotspots.slice(0, 5).map((h) => (
                  <EntityRow
                    key={h.path}
                    title={<span className="font-mono">{h.path.split('/').pop() ?? h.path}</span>}
                    ariaLabel={`History of ${h.path}`}
                    href={codeHref({ file: h.path })}
                    description={<span className="font-mono break-all">{h.path}</span>}
                    trailing={`churn ${h.churn_score.toFixed(1)}`}
                  />
                ))}
              </EntityList>
            </div>
          ) : selectedCommunity ? (
            <EmptyState size="sm" title="No hotspots in this community" />
          ) : null}
        </div>
      </Section>

      {/* ── Communities map (canvas mounted on demand — it is costly on phones) ── */}
      {embeddingsViz.data && (
        <Section
          title="Code communities map"
          collapsible
          defaultOpen={false}
          description="Files clustered by meaning. Tap a file to open its history, a cluster label to filter the Code section."
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
              Filtering Code by community: <strong className="text-gray-200">{selectedCommunity}</strong>{' '}
              <button type="button" onClick={() => setSelectedCommunity(null)} className={`px-1 py-2 ${textLink}`}>
                Clear
              </button>
            </p>
          )}
        </Section>
      )}

      {/* ── Knowledge ──────────────────────────────────────────────── */}
      <Section title="Project management">
        <div className="space-y-2">
          <StatGrid
            cols={2}
            items={[
              { label: 'Notes', value: s.knowledge.notes, sub: s.knowledge.stale_count > 0 ? `${s.knowledge.stale_count} stale` : undefined },
              { label: 'Decisions', value: s.knowledge.decisions },
            ]}
          />
          {Object.keys(s.knowledge.types_distribution).length > 0 && (
            <p className="px-1 text-[11px] leading-5 text-gray-500">
              Note types:{' '}
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

      <Section title="Knowledge fabric" description="How files are coupled through imports and commits made together.">
        <div className="space-y-2">
          <StatGrid
            cols={2}
            items={[
              { label: 'Co-changed pairs', value: s.fabric.co_changed_pairs },
              {
                label: 'Avg coupling',
                hidden: !health?.coupling_metrics,
                value: health?.coupling_metrics?.avg_clustering_coefficient.toFixed(2),
                sub: health?.coupling_metrics ? `max: ${health.coupling_metrics.max_clustering_coefficient.toFixed(2)}` : undefined,
              },
            ]}
          />
          {health && health.circular_dependency_count > 0 && (
            <p className={`px-1 text-xs ${TONE_CLASSES.danger.text}`}>{health.circular_dependency_count} circular dependencies detected</p>
          )}
          {health?.coupling_metrics?.most_coupled_file && (
            <p className="px-1 text-[11px] text-gray-500">
              Most coupled: <span className="font-mono text-gray-400 break-all">{health.coupling_metrics.most_coupled_file}</span>
            </p>
          )}
        </div>
      </Section>

      <Section title="Neural memory" description="Notes behave like neurons: energy fades without use, synapses link notes used together.">
        <div className="space-y-3">
          <StatGrid
            cols={2}
            items={[
              { label: 'Active synapses', value: s.neural.active_synapses },
              { label: 'Dead notes', value: s.neural.dead_notes_count, tone: s.neural.dead_notes_count > 5 ? 'danger' : undefined },
            ]}
          />
          <div className="space-y-1.5 px-1">
            <Meter label="Avg energy" value={s.neural.avg_energy} />
            <Meter
              label="Weak synapses"
              value={s.neural.weak_synapses_ratio}
              tone={s.neural.weak_synapses_ratio > 0.5 ? 'warning' : 'success'}
            />
          </div>
        </div>
      </Section>

      <Section title="Skills" description={`${s.skills.total_activations} total activations`}>
        <div className="space-y-3">
          <StatGrid
            items={[
              { label: 'Total skills', value: s.skills.total },
              { label: 'Active', value: s.skills.active },
              { label: 'Emerging', value: s.skills.emerging },
              { label: 'Avg cohesion', value: `${(s.skills.avg_cohesion * 100).toFixed(0)}%` },
            ]}
          />
          <div className="px-1">
            <Meter label="Skill maturity" value={s.skills.total > 0 ? s.skills.active / s.skills.total : 0} />
          </div>
        </div>
      </Section>

      {s.behavioral.protocols > 0 && (
        <Section title="Behavioral" description={`${s.behavioral.states} states · ${s.behavioral.transitions} transitions`}>
          <div className="space-y-3">
            <StatGrid
              items={[
                { label: 'Protocols', value: s.behavioral.protocols },
                { label: 'System', value: s.behavioral.system_protocols },
                { label: 'Business', value: s.behavioral.business_protocols },
                { label: 'Skill-linked', value: s.behavioral.skill_linked },
              ]}
            />
            <div className="px-1">
              <Meter label="Skill coverage" value={s.behavioral.skill_linked / s.behavioral.protocols} />
            </div>
          </div>
        </Section>
      )}

      {/* ── Maintenance ────────────────────────────────────────────── */}
      <Section title="Quick actions" description="Knowledge graph maintenance.">
        <EntityList aria-label="Quick actions">
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
                      loading={st.status === 'running'}
                      disabled={st.status === 'running'}
                      onClick={() => triggerAction(a)}
                      aria-label={`Run ${a.label}`}
                      className="my-1.5 mr-1.5"
                    >
                      {st.status === 'success' ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : 'Run'}
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
