import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent, Button, EmptyState, ErrorState } from '@/components/ui'
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

// ── Risk level badge ────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
}

const RISK_ROW_BG: Record<string, string> = {
  critical: 'bg-red-500/[0.04]',
  high: 'bg-orange-500/[0.04]',
}

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${RISK_COLORS[level] || RISK_COLORS.low}`}>
      {level}
    </span>
  )
}

// ── Churn bar ───────────────────────────────────────────────────────────

function ChurnBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0
  const color = pct > 66 ? 'bg-red-500' : pct > 33 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-white/[0.08] rounded-full overflow-hidden">
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
      <div className="w-24 h-2 bg-white/[0.08] rounded-full overflow-hidden">
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
    <span className="font-mono text-sm text-gray-200 truncate block max-w-[300px] lg:max-w-[400px]" title={path}>
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
      <p className="text-sm text-gray-400">
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
        <KpiCard
          icon={<Link2 className="w-5 h-5" />}
          label="Avg Coupling"
          value={health.coupling_metrics.avg_clustering_coefficient.toFixed(3)}
          color="text-gray-300"
          iconColor="text-indigo-400"
          subtitle={`most coupled: ${stripBase(health.coupling_metrics.most_coupled_file, basePath)}`}
        />
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
      <Card>
        <CardHeader>
          <CardTitle>Hotspots — Most Changed Files</CardTitle>
        </CardHeader>
        <CardContent>
          {hotspots.length === 0 ? (
            <p className="text-sm text-gray-500">No hotspots detected.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-gray-500 text-left">
                      <th className="pb-2 font-medium">File</th>
                      <th className="pb-2 font-medium">Churn Score</th>
                      <th className="pb-2 font-medium text-right">Commits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotspots.map((h) => (
                      <tr key={h.path} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-2 pr-4"><FilePath path={h.path} basePath={basePath} /></td>
                        <td className="py-2 pr-4"><ChurnBar score={h.churn_score} max={maxChurn} /></td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{h.commit_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hotspots.length < hotspotsTotal && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setHotspotsLimit((l) => l + 20)}
                  loading={loading}
                >
                  Show more ({hotspotsTotal - hotspots.length} remaining)
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Knowledge Gaps ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Gaps — Under-Documented Files</CardTitle>
        </CardHeader>
        <CardContent>
          {knowledgeGaps.length === 0 ? (
            <p className="text-sm text-gray-500">No knowledge gaps detected.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-gray-500 text-left">
                      <th className="pb-2 font-medium">File</th>
                      <th className="pb-2 font-medium">Knowledge Density</th>
                      <th className="pb-2 font-medium text-right">Notes</th>
                      <th className="pb-2 font-medium text-right">Decisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knowledgeGaps.map((g) => (
                      <tr key={g.path} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-2 pr-4"><FilePath path={g.path} basePath={basePath} /></td>
                        <td className="py-2 pr-4"><DensityBar density={g.knowledge_density} /></td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{g.note_count}</td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{g.decision_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {knowledgeGaps.length < gapsTotal && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setGapsLimit((l) => l + 20)}
                  loading={loading}
                >
                  Show more ({gapsTotal - knowledgeGaps.length} remaining)
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Risk Assessment ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Risk Assessment</CardTitle>
            {riskSummary && (
              <div className="flex gap-3 text-xs">
                <span className="text-red-400">{riskSummary.critical_count} critical</span>
                <span className="text-orange-400">{riskSummary.high_count} high</span>
                <span className="text-yellow-400">{riskSummary.medium_count} medium</span>
                <span className="text-green-400">{riskSummary.low_count} low</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {riskFiles.length === 0 ? (
            <p className="text-sm text-gray-500">No risk data available.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-gray-500 text-left">
                      <th className="pb-2 font-medium">File</th>
                      <th className="pb-2 font-medium">Level</th>
                      <th className="pb-2 font-medium text-right">Score</th>
                      <th className="pb-2 font-medium text-right">PageRank</th>
                      <th className="pb-2 font-medium text-right">Churn</th>
                      <th className="pb-2 font-medium text-right">K-Gap</th>
                      <th className="pb-2 font-medium text-right">Between.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskFiles.map((r) => (
                      <tr
                        key={r.path}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.02] ${RISK_ROW_BG[r.risk_level] || ''}`}
                      >
                        <td className="py-2 pr-4"><FilePath path={r.path} basePath={basePath} /></td>
                        <td className="py-2 pr-4"><RiskBadge level={r.risk_level} /></td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{r.risk_score.toFixed(3)}</td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{r.factors.pagerank.toFixed(4)}</td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{r.factors.churn.toFixed(3)}</td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{r.factors.knowledge_gap.toFixed(3)}</td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">{r.factors.betweenness.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {riskFiles.length < riskTotal && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setRiskLimit((l) => l + 20)}
                  loading={loading}
                >
                  Show more ({riskTotal - riskFiles.length} remaining)
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
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
    <div className="p-4 bg-white/[0.06] rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className={iconColor}>{icon}</span>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && (
        <div className="text-xs text-gray-500 mt-1 truncate" title={subtitle}>
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
