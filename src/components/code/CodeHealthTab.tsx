import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Section,
  Skeleton,
  StatusDot,
  TONE_CLASSES,
  pluralize,
  type StatusTone,
} from '@/components/ui'
import { codeApi } from '@/services'
import { Meter, StatTiles } from './metrics'
import type { CodeHealth, ChangeHotspot, KnowledgeGap, RiskFile, RiskAssessmentSummary } from '@/types'

// ── Strip common base path ──────────────────────────────────────────────

/** Longest common directory prefix among all paths. */
function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return ''
  const parts = paths[0].split('/')
  let prefix = ''
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(0, i + 1).join('/') + '/'
    if (paths.every((p) => p.startsWith(candidate))) prefix = candidate
    else break
  }
  return prefix
}

function stripBase(path: string, basePath: string): string {
  if (!path) return '—'
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) : path
}

const RISK_TONE: Record<string, StatusTone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'success',
}

/** Higher churn / lower density is worse. */
const churnTone = (ratio: number): StatusTone => (ratio > 0.66 ? 'danger' : ratio > 0.33 ? 'warning' : 'success')
const densityTone = (density: number): StatusTone => (density < 0.3 ? 'danger' : density < 0.6 ? 'warning' : 'success')

const PAGE = 20

interface CodeHealthTabProps {
  projectSlug: string | null
  onOpenFile: (path: string) => void
}

function FilePath({ path, basePath }: { path: string; basePath: string }) {
  return (
    <span className="font-mono break-all" title={path}>
      {stripBase(path, basePath)}
    </span>
  )
}

function ShowMore({ remaining, loading, onClick }: { remaining: number; loading: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="mt-2" onClick={onClick} loading={loading}>
      Show more ({remaining} remaining)
    </Button>
  )
}

function HealthSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <EntityListSkeleton rows={4} />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function CodeHealthTab({ projectSlug, onOpenFile }: CodeHealthTabProps) {
  const [health, setHealth] = useState<CodeHealth | null>(null)
  const [hotspots, setHotspots] = useState<ChangeHotspot[]>([])
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([])
  const [riskFiles, setRiskFiles] = useState<RiskFile[]>([])
  const [riskSummary, setRiskSummary] = useState<RiskAssessmentSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [hotspotsLimit, setHotspotsLimit] = useState(PAGE)
  const [gapsLimit, setGapsLimit] = useState(PAGE)
  const [riskLimit, setRiskLimit] = useState(PAGE)
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
    } catch {
      setError('Could not load the health metrics.')
    } finally {
      setLoading(false)
    }
  }, [projectSlug, hotspotsLimit, gapsLimit, riskLimit])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Common base path across every list, for shorter rows (full path in the tooltip)
  const basePath = useMemo(
    () => findCommonPrefix([...hotspots.map((h) => h.path), ...knowledgeGaps.map((g) => g.path), ...riskFiles.map((r) => r.path)]),
    [hotspots, knowledgeGaps, riskFiles],
  )

  if (!projectSlug) {
    return (
      <EmptyState
        title="Select a project"
        description="Health analysis works on one project at a time — pick one in the filter above."
      />
    )
  }

  if (loading && !health) return <HealthSkeleton />
  if (error) return <ErrorState title="Health check failed" description={error} onRetry={loadAll} />
  if (!health) return null

  const maxChurn = hotspots.length > 0 ? Math.max(...hotspots.map((h) => h.churn_score)) : 1
  const coupling = health.coupling_metrics
  const neural = health.neural_metrics
  const godFunctions = health.god_functions ?? []
  const orphanFiles = health.orphan_files ?? []
  const circular = health.circular_dependencies ?? []

  return (
    <div className="space-y-6">
      {/* ── Key numbers ──────────────────────────────────────────── */}
      <StatTiles
        items={[
          {
            label: 'God functions',
            value: health.god_function_count,
            sub: `threshold ${health.god_function_threshold}`,
            tone: health.god_function_count > 5 ? 'warning' : undefined,
          },
          { label: 'Orphan files', value: health.orphan_file_count, tone: health.orphan_file_count > 10 ? 'warning' : undefined },
          {
            label: 'Avg coupling',
            hidden: !coupling,
            value: coupling?.avg_clustering_coefficient.toFixed(3),
            sub: coupling?.most_coupled_file ? `most coupled: ${stripBase(coupling.most_coupled_file, basePath)}` : undefined,
          },
          {
            label: 'Circular deps',
            value: health.circular_dependency_count,
            tone: health.circular_dependency_count > 0 ? 'danger' : 'success',
          },
        ]}
      />

      {neural && (
        <StatTiles
          items={[
            { label: 'Active synapses', value: neural.active_synapses },
            { label: 'Avg energy', value: `${(neural.avg_energy * 100).toFixed(0)}%` },
            {
              label: 'Weak synapses',
              value: `${(neural.weak_synapses_ratio * 100).toFixed(0)}%`,
              tone: neural.weak_synapses_ratio > 0.5 ? 'warning' : undefined,
            },
            { label: 'Dead notes', value: neural.dead_notes_count, tone: neural.dead_notes_count > 10 ? 'danger' : undefined },
          ]}
        />
      )}

      {/* ── Structural problems (lists behind the numbers) ───────── */}
      {godFunctions.length > 0 && (
        <Section
          title="God functions"
          count={godFunctions.length}
          description="Functions with too many callers and callees — hard to change safely."
          collapsible
          defaultOpen={false}
        >
          <EntityList aria-label="God functions">
            {godFunctions.map((f) => (
              <EntityRow
                key={`${f.file}-${f.name}`}
                title={<span className="font-mono">{f.name}</span>}
                ariaLabel={`History of ${f.file}`}
                onClick={() => onOpenFile(f.file)}
                description={<FilePath path={f.file} basePath={basePath} />}
                meta={[`${f.in_degree} in`, `${f.out_degree} out`]}
              />
            ))}
          </EntityList>
        </Section>
      )}

      {circular.length > 0 && (
        <Section title="Circular dependencies" count={circular.length} collapsible defaultOpen={false}>
          <EntityList aria-label="Circular dependencies">
            {circular.map((c, i) => (
              <EntityRow key={`${c}-${i}`} title={<span className="font-mono break-all">{c}</span>} ariaLabel={c} />
            ))}
          </EntityList>
        </Section>
      )}

      {orphanFiles.length > 0 && (
        <Section
          title="Orphan files"
          count={orphanFiles.length}
          description="Files nothing imports and that import nothing."
          collapsible
          defaultOpen={false}
        >
          <EntityList aria-label="Orphan files">
            {orphanFiles.map((path) => (
              <EntityRow
                key={path}
                title={<FilePath path={path} basePath={basePath} />}
                ariaLabel={`History of ${path}`}
                onClick={() => onOpenFile(path)}
              />
            ))}
          </EntityList>
        </Section>
      )}

      {/* ── Hotspots ─────────────────────────────────────────────── */}
      <Section
        title="Hotspots"
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
                  ariaLabel={`History of ${h.path}`}
                  onClick={() => onOpenFile(h.path)}
                  trailing={pluralize(h.commit_count, 'commit')}
                  meta={[
                    <Meter
                      key="churn"
                      size="inline"
                      value={maxChurn > 0 ? h.churn_score / maxChurn : 0}
                      display={`churn ${h.churn_score.toFixed(2)}`}
                      tone={churnTone(maxChurn > 0 ? h.churn_score / maxChurn : 0)}
                    />,
                    h.co_change_count > 0 ? `${h.co_change_count} co-changes` : null,
                  ]}
                />
              ))}
            </EntityList>
            {hotspots.length < hotspotsTotal && (
              <ShowMore remaining={hotspotsTotal - hotspots.length} loading={loading} onClick={() => setHotspotsLimit((l) => l + PAGE)} />
            )}
          </>
        )}
      </Section>

      {/* ── Knowledge gaps ───────────────────────────────────────── */}
      <Section
        title="Knowledge gaps"
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
                  ariaLabel={`History of ${g.path}`}
                  onClick={() => onOpenFile(g.path)}
                  meta={[
                    <Meter
                      key="density"
                      size="inline"
                      value={g.knowledge_density}
                      display={`${(g.knowledge_density * 100).toFixed(0)}% covered`}
                      tone={densityTone(g.knowledge_density)}
                    />,
                    pluralize(g.note_count, 'note'),
                    pluralize(g.decision_count, 'decision'),
                  ]}
                />
              ))}
            </EntityList>
            {knowledgeGaps.length < gapsTotal && (
              <ShowMore remaining={gapsTotal - knowledgeGaps.length} loading={loading} onClick={() => setGapsLimit((l) => l + PAGE)} />
            )}
          </>
        )}
      </Section>

      {/* ── Risk assessment ──────────────────────────────────────── */}
      <Section
        title="Risk assessment"
        count={riskTotal || riskFiles.length}
        description={
          riskSummary ? (
            <span className="inline-flex flex-wrap gap-x-3">
              <span className={TONE_CLASSES.danger.text}>{riskSummary.critical_count} critical</span>
              <span className={TONE_CLASSES.warning.text}>{riskSummary.high_count} high</span>
              <span className={TONE_CLASSES.info.text}>{riskSummary.medium_count} medium</span>
              <span className={TONE_CLASSES.success.text}>{riskSummary.low_count} low</span>
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
                    ariaLabel={`History of ${r.path}`}
                    onClick={() => onOpenFile(r.path)}
                    leading={<StatusDot tone={tone} label={`${r.risk_level} risk`} />}
                    trailing={r.risk_score.toFixed(3)}
                    meta={[
                      <span key="l" className={TONE_CLASSES[tone].text}>
                        {r.risk_level}
                      </span>,
                      `PageRank ${r.factors.pagerank.toFixed(4)}`,
                      `churn ${r.factors.churn.toFixed(3)}`,
                      `knowledge gap ${r.factors.knowledge_gap.toFixed(3)}`,
                      `betweenness ${r.factors.betweenness.toFixed(4)}`,
                    ]}
                  />
                )
              })}
            </EntityList>
            {riskFiles.length < riskTotal && (
              <ShowMore remaining={riskTotal - riskFiles.length} loading={loading} onClick={() => setRiskLimit((l) => l + PAGE)} />
            )}
          </>
        )}
      </Section>
    </div>
  )
}
