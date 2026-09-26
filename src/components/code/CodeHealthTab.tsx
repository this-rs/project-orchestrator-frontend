import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityRow,
  ErrorState,
  Section,
  StatusDot,
  TONE_CLASSES,
  pluralize,
  type StatusTone,
} from '@/components/ui'
import { AlertTriangle, FileX, Link2, RefreshCw, Activity, Brain, Zap, Skull } from 'lucide-react'
import { codeApi } from '@/services'
import type {
  CodeHealth,
  ChangeHotspot,
  KnowledgeGap,
  RiskFile,
  RiskAssessmentSummary,
} from '@/types'

// ── Strip common base path ──────────────────────────────────────────────

/** Find the longest common directory prefix among all paths */
function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return ''
  const parts = paths[0].split('/')
  let prefix = ''
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(0, i + 1).join('/') + '/'
    if (paths.every((p) => p.startsWith(candidate))) {
      prefix = candidate
    } else {
      break
    }
  }
  return prefix
}

interface CodeHealthTabProps {
  projectSlug: string | null
}

// ── Risk level → status tone ────────────────────────────────────────────

const RISK_TONE: Record<string, StatusTone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'success',
}

// ── Churn bar ───────────────────────────────────────────────────────────

function ChurnBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0
  const color = pct > 66 ? 'bg-red-500' : pct > 33 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-white/[0.08] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums">{score.toFixed(2)}</span>
    </div>
  )
}

// ── Knowledge density bar (inverted — red when low) ─────────────────────

function DensityBar({ density }: { density: number }) {
  const pct = Math.min(density * 100, 100)
  const color = pct < 30 ? 'bg-red-500' : pct < 60 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-white/[0.08] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums">{(density * 100).toFixed(0)}%</span>
    </div>
  )
}

// ── File path display (with common prefix stripped) ─────────────────────

function FilePath({ path, basePath }: { path: string; basePath: string }) {
  const display = basePath && path.startsWith(basePath) ? path.slice(basePath.length) : path
  return (
    <span className="font-mono break-all" title={path}>
      {display}
    </span>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function CodeHealthTab({ projectSlug }: CodeHealthTabProps) {
  const [health, setHealth] = useState<CodeHealth | null>(null)
  const [hotspots, setHotspots] = useState<ChangeHotspot[]>([])
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([])
  const [riskFiles, setRiskFiles] = useState<RiskFile[]>([])
  const [riskSummary, setRiskSummary] = useState<RiskAssessmentSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show more states
  const [hotspotsLimit, setHotspotsLimit] = useState(20)
  const [gapsLimit, setGapsLimit] = useState(20)
  const [riskLimit, setRiskLimit] = useState(20)
  const [hotspotsTotal, setHotspotsTotal] = useState(0)
  const [gapsTotal, setGapsTotal] = useState(0)
  const [riskTotal, setRiskTotal] = useState(0)

  const loadAll = useCallback(async () => {
    if (!projectSlug) return
    setLoading(true)
    setError(null)
    try {
      const [healthData, hotspotsData, gapsData, riskData] = await Promise.all([
        codeApi.getHealth({ project_slug: projectSlug }),
        codeApi.getHotspots({ project_slug: projectSlug, limit: hotspotsLimit }),
        codeApi.getKnowledgeGaps({ project_slug: projectSlug, limit: gapsLimit }),
        codeApi.getRiskAssessment({ project_slug: projectSlug, limit: riskLimit }),
      ])
      setHealth(healthData)
      setHotspots(hotspotsData.hotspots)
      setHotspotsTotal(hotspotsData.total_files)
      setKnowledgeGaps(gapsData.knowledge_gaps)
      setGapsTotal(gapsData.total_files)
      setRiskFiles(riskData.risk_files)
      setRiskTotal(riskData.total_files)
      setRiskSummary(riskData.summary)
    } catch (err) {
      console.error('Failed to load health data:', err)
      setError('Failed to load health metrics. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [projectSlug, hotspotsLimit, gapsLimit, riskLimit])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Compute common base path across all file paths for cleaner display
  // Must be before early returns to satisfy React hooks rules
  const basePath = useMemo(() => {
    const allPaths = [
      ...hotspots.map((h) => h.path),
      ...knowledgeGaps.map((g) => g.path),
      ...riskFiles.map((r) => r.path),
    ]
    return findCommonPrefix(allPaths)
  }, [hotspots, knowledgeGaps, riskFiles])

  if (!projectSlug) {
    return (
      <EmptyState
        title="Select a project"
        description="Health analysis requires a specific project. Please select one from the filter above."
      />
    )
  }

  if (loading && !health) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-white/[0.04] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState title="Health check failed" description={error} onRetry={loadAll} />
  }

  if (!health) return null

  const maxChurn = hotspots.length > 0 ? Math.max(...hotspots.map((h) => h.churn_score)) : 1

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        Codebase health indicators: god functions, orphan files, coupling metrics, and neural
        knowledge fabric status. Explore hotspots, knowledge gaps, and risk assessment to prioritize
        technical debt.
      </p>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="God Functions"
          value={health.god_function_count}
          color={health.god_function_count > 5 ? 'text-orange-400' : 'text-gray-300'}
          iconColor={health.god_function_count > 5 ? 'text-orange-400' : 'text-gray-500'}
          subtitle={`threshold: ${health.god_function_threshold}`}
        />
        <KpiCard
          icon={<FileX className="w-5 h-5" />}
          label="Orphan Files"
          value={health.orphan_file_count}
          color="text-gray-300"
          iconColor="text-gray-500"
        />
        {health.coupling_metrics && (
        <KpiCard
          icon={<Link2 className="w-5 h-5" />}
          label="Avg Coupling"
          value={health.coupling_metrics.avg_clustering_coefficient.toFixed(3)}
          color="text-gray-300"
          iconColor="text-indigo-400"
          subtitle={health.coupling_metrics.most_coupled_file ? `most coupled: ${stripBase(health.coupling_metrics.most_coupled_file, basePath)}` : undefined}
        />
        )}
        <KpiCard
          icon={<RefreshCw className="w-5 h-5" />}
          label="Circular Deps"
          value={health.circular_dependency_count}
          color={health.circular_dependency_count > 0 ? 'text-red-400' : 'text-green-400'}
          iconColor={health.circular_dependency_count > 0 ? 'text-red-400' : 'text-green-400'}
        />
      </div>

      {/* ── Neural Metrics (optional) ────────────────────────────── */}
      {health.neural_metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <KpiCard
            icon={<Activity className="w-5 h-5" />}
            label="Active Synapses"
            value={health.neural_metrics.active_synapses}
            color="text-purple-400"
            iconColor="text-purple-400"
          />
          <KpiCard
            icon={<Zap className="w-5 h-5" />}
            label="Avg Energy"
            value={health.neural_metrics.avg_energy.toFixed(3)}
            color="text-amber-400"
            iconColor="text-amber-400"
          />
          <KpiCard
            icon={<Brain className="w-5 h-5" />}
            label="Weak Synapses"
            value={`${(health.neural_metrics.weak_synapses_ratio * 100).toFixed(0)}%`}
            color={health.neural_metrics.weak_synapses_ratio > 0.5 ? 'text-orange-400' : 'text-gray-300'}
            iconColor="text-gray-500"
          />
          <KpiCard
            icon={<Skull className="w-5 h-5" />}
            label="Dead Notes"
            value={health.neural_metrics.dead_notes_count}
            color={health.neural_metrics.dead_notes_count > 10 ? 'text-red-400' : 'text-gray-300'}
            iconColor="text-gray-500"
          />
        </div>
      )}

      {/* ── Hotspots ─────────────────────────────────────────────── */}
      <Section
        title="Hotspots — most changed files"
        count={hotspotsTotal || hotspots.length}
        description="Files that change the most: where bugs and merge conflicts concentrate."
      >
        {hotspots.length === 0 ? (
          <EmptyState size="sm" title="No hotspots detected." />
        ) : (
          <>
            <EntityList aria-label="Hotspots">
              {hotspots.map((h) => (
                <EntityRow
                  key={h.path}
                  title={<FilePath path={h.path} basePath={basePath} />}
                  ariaLabel={h.path}
                  trailing={`${h.commit_count} commits`}
                  meta={[<ChurnBar key="c" score={h.churn_score} max={maxChurn} />]}
                />
              ))}
            </EntityList>
            {hotspots.length < hotspotsTotal && (
              <ShowMore remaining={hotspotsTotal - hotspots.length} loading={loading} onClick={() => setHotspotsLimit((l) => l + 20)} />
            )}
          </>
        )}
      </Section>

      {/* ── Knowledge Gaps ───────────────────────────────────────── */}
      <Section
        title="Knowledge gaps — under-documented files"
        count={gapsTotal || knowledgeGaps.length}
        description="Important files with few notes or decisions attached: agents work there blind."
      >
        {knowledgeGaps.length === 0 ? (
          <EmptyState size="sm" title="No knowledge gaps detected." />
        ) : (
          <>
            <EntityList aria-label="Knowledge gaps">
              {knowledgeGaps.map((g) => (
                <EntityRow
                  key={g.path}
                  title={<FilePath path={g.path} basePath={basePath} />}
                  ariaLabel={g.path}
                  meta={[
                    <DensityBar key="d" density={g.knowledge_density} />,
                    pluralize(g.note_count, 'note'),
                    pluralize(g.decision_count, 'decision'),
                  ]}
                />
              ))}
            </EntityList>
            {knowledgeGaps.length < gapsTotal && (
              <ShowMore remaining={gapsTotal - knowledgeGaps.length} loading={loading} onClick={() => setGapsLimit((l) => l + 20)} />
            )}
          </>
        )}
      </Section>

      {/* ── Risk Assessment ──────────────────────────────────────── */}
      <Section
        title="Risk assessment"
        count={riskTotal || riskFiles.length}
        description={
          riskSummary ? (
            <span className="inline-flex flex-wrap gap-x-3">
              <span className="text-red-400">{riskSummary.critical_count} critical</span>
              <span className="text-orange-400">{riskSummary.high_count} high</span>
              <span className="text-yellow-400">{riskSummary.medium_count} medium</span>
              <span className="text-green-400">{riskSummary.low_count} low</span>
            </span>
          ) : undefined
        }
      >
        {riskFiles.length === 0 ? (
          <EmptyState size="sm" title="No risk data available." />
        ) : (
          <>
            <EntityList aria-label="Risk assessment">
              {riskFiles.map((r) => {
                const tone = RISK_TONE[r.risk_level] ?? 'neutral'
                return (
                  <EntityRow
                    key={r.path}
                    title={<FilePath path={r.path} basePath={basePath} />}
                    ariaLabel={r.path}
                    leading={<StatusDot tone={tone} label={`${r.risk_level} risk`} />}
                    trailing={r.risk_score.toFixed(3)}
                    meta={[
                      <span key="l" className={TONE_CLASSES[tone].text}>
                        {r.risk_level}
                      </span>,
                      `PageRank ${r.factors.pagerank.toFixed(4)}`,
                      `churn ${r.factors.churn.toFixed(3)}`,
                      `k-gap ${r.factors.knowledge_gap.toFixed(3)}`,
                      `betweenness ${r.factors.betweenness.toFixed(4)}`,
                    ]}
                  />
                )
              })}
            </EntityList>
            {riskFiles.length < riskTotal && (
              <ShowMore remaining={riskTotal - riskFiles.length} loading={loading} onClick={() => setRiskLimit((l) => l + 20)} />
            )}
          </>
        )}
      </Section>
    </div>
  )
}

function ShowMore({ remaining, loading, onClick }: { remaining: number; loading: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="mt-2" onClick={onClick} loading={loading}>
      Show more ({remaining} remaining)
    </Button>
  )
}

// ── KPI Card sub-component ──────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  color,
  iconColor,
  subtitle,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
  iconColor: string
  subtitle?: string
}) {
  return (
    <div className="p-3 md:p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className={iconColor}>{icon}</span>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <div className={`text-xl md:text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {subtitle && (
        <div className="text-[11px] leading-4 text-gray-500 mt-1 break-words">
          {subtitle}
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function stripBase(path: string, basePath: string): string {
  if (!path) return '—'
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) : path
}
