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
  type StatusTone,
  Meter,
  StatTiles,
} from '@/components/ui'
import { codeApi } from '@/services'
import { useT } from '@/i18n'
import { useCodeCount, useRiskLevelLabel } from './useCodeCount'
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
  const { t } = useT()
  return (
    <Button variant="ghost" size="sm" className="mt-2" onClick={onClick} loading={loading}>
      {t('code.common.showMore', { remaining })}
    </Button>
  )
}

function HealthSkeleton() {
  const { t } = useT()
  return (
    <div className="space-y-6" role="status" aria-label={t('code.common.loading')}>
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
  const { t } = useT()
  const count = useCodeCount()
  const levelLabel = useRiskLevelLabel()
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
      setError(t('code.healthTab.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [projectSlug, hotspotsLimit, gapsLimit, riskLimit, t])

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
        title={t('code.common.selectProject')}
        description={t('code.healthTab.needProject')}
      />
    )
  }

  if (loading && !health) return <HealthSkeleton />
  if (error) return <ErrorState title={t('code.healthTab.failed')} description={error} onRetry={loadAll} />
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
            label: t('code.healthTab.godFunctions'),
            value: health.god_function_count,
            sub: t('code.healthTab.threshold', { n: health.god_function_threshold }),
            tone: health.god_function_count > 5 ? 'warning' : undefined,
          },
          { label: t('code.healthTab.orphanFiles'), value: health.orphan_file_count, tone: health.orphan_file_count > 10 ? 'warning' : undefined },
          {
            label: t('code.healthTab.avgCoupling'),
            hidden: !coupling,
            value: coupling?.avg_clustering_coefficient.toFixed(3),
            sub: coupling?.most_coupled_file ? t('code.healthTab.mostCoupled', { file: stripBase(coupling.most_coupled_file, basePath) }) : undefined,
          },
          {
            label: t('code.healthTab.circularDeps'),
            value: health.circular_dependency_count,
            tone: health.circular_dependency_count > 0 ? 'danger' : 'success',
          },
        ]}
      />

      {neural && (
        <StatTiles
          items={[
            { label: t('code.healthTab.activeSynapses'), value: neural.active_synapses },
            { label: t('code.healthTab.avgEnergy'), value: `${(neural.avg_energy * 100).toFixed(0)}%` },
            {
              label: t('code.healthTab.weakSynapses'),
              value: `${(neural.weak_synapses_ratio * 100).toFixed(0)}%`,
              tone: neural.weak_synapses_ratio > 0.5 ? 'warning' : undefined,
            },
            { label: t('code.healthTab.deadNotes'), value: neural.dead_notes_count, tone: neural.dead_notes_count > 10 ? 'danger' : undefined },
          ]}
        />
      )}

      {/* ── Structural problems (lists behind the numbers) ───────── */}
      {godFunctions.length > 0 && (
        <Section
          title={t('code.healthTab.godFunctions')}
          count={godFunctions.length}
          description={t('code.healthTab.godFunctionsDescription')}
          collapsible
          defaultOpen={false}
        >
          <EntityList aria-label={t('code.healthTab.godFunctions')}>
            {godFunctions.map((f) => (
              <EntityRow
                key={`${f.file}-${f.name}`}
                title={<span className="font-mono">{f.name}</span>}
                ariaLabel={t('code.common.historyOf', { path: f.file })}
                onClick={() => onOpenFile(f.file)}
                description={<FilePath path={f.file} basePath={basePath} />}
                meta={[t('code.healthTab.inCount', { n: f.in_degree }), t('code.healthTab.outCount', { n: f.out_degree })]}
              />
            ))}
          </EntityList>
        </Section>
      )}

      {circular.length > 0 && (
        <Section title={t('code.healthTab.circularDependencies')} count={circular.length} collapsible defaultOpen={false}>
          <EntityList aria-label={t('code.healthTab.circularDependencies')}>
            {circular.map((c, i) => (
              <EntityRow key={`${c}-${i}`} title={<span className="font-mono break-all">{c}</span>} ariaLabel={c} />
            ))}
          </EntityList>
        </Section>
      )}

      {orphanFiles.length > 0 && (
        <Section
          title={t('code.healthTab.orphanFiles')}
          count={orphanFiles.length}
          description={t('code.healthTab.orphanFilesDescription')}
          collapsible
          defaultOpen={false}
        >
          <EntityList aria-label={t('code.healthTab.orphanFiles')}>
            {orphanFiles.map((path) => (
              <EntityRow
                key={path}
                title={<FilePath path={path} basePath={basePath} />}
                ariaLabel={t('code.common.historyOf', { path })}
                onClick={() => onOpenFile(path)}
              />
            ))}
          </EntityList>
        </Section>
      )}

      {/* ── Hotspots ─────────────────────────────────────────────── */}
      <Section
        title={t('code.healthTab.hotspots')}
        count={hotspotsTotal || hotspots.length}
        description={t('code.healthTab.hotspotsDescription')}
      >
        {hotspots.length === 0 ? (
          <EmptyState size="sm" title={t('code.healthTab.noHotspots')} />
        ) : (
          <>
            <EntityList aria-label={t('code.healthTab.hotspots')}>
              {hotspots.map((h) => (
                <EntityRow
                  key={h.path}
                  title={<FilePath path={h.path} basePath={basePath} />}
                  ariaLabel={t('code.common.historyOf', { path: h.path })}
                  onClick={() => onOpenFile(h.path)}
                  trailing={count('commit', h.commit_count)}
                  meta={[
                    <Meter
                      key="churn"
                      size="inline"
                      value={maxChurn > 0 ? h.churn_score / maxChurn : 0}
                      display={t('code.healthTab.churn', { value: h.churn_score.toFixed(2) })}
                      tone={churnTone(maxChurn > 0 ? h.churn_score / maxChurn : 0)}
                    />,
                    h.co_change_count > 0 ? count('coChange', h.co_change_count) : null,
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
        title={t('code.healthTab.knowledgeGaps')}
        count={gapsTotal || knowledgeGaps.length}
        description={t('code.healthTab.knowledgeGapsDescription')}
      >
        {knowledgeGaps.length === 0 ? (
          <EmptyState size="sm" title={t('code.healthTab.noKnowledgeGaps')} />
        ) : (
          <>
            <EntityList aria-label={t('code.healthTab.knowledgeGaps')}>
              {knowledgeGaps.map((g) => (
                <EntityRow
                  key={g.path}
                  title={<FilePath path={g.path} basePath={basePath} />}
                  ariaLabel={t('code.common.historyOf', { path: g.path })}
                  onClick={() => onOpenFile(g.path)}
                  meta={[
                    <Meter
                      key="density"
                      size="inline"
                      value={g.knowledge_density}
                      display={t('code.healthTab.covered', { percent: (g.knowledge_density * 100).toFixed(0) })}
                      tone={densityTone(g.knowledge_density)}
                    />,
                    count('note', g.note_count),
                    count('decision', g.decision_count),
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
        title={t('code.healthTab.riskAssessment')}
        count={riskTotal || riskFiles.length}
        description={
          riskSummary ? (
            <span className="inline-flex flex-wrap gap-x-3">
              <span className={TONE_CLASSES.danger.text}>{t('code.healthTab.critical', { n: riskSummary.critical_count })}</span>
              <span className={TONE_CLASSES.warning.text}>{t('code.healthTab.high', { n: riskSummary.high_count })}</span>
              <span className={TONE_CLASSES.info.text}>{t('code.healthTab.medium', { n: riskSummary.medium_count })}</span>
              <span className={TONE_CLASSES.success.text}>{t('code.healthTab.low', { n: riskSummary.low_count })}</span>
            </span>
          ) : undefined
        }
      >
        {riskFiles.length === 0 ? (
          <EmptyState size="sm" title={t('code.healthTab.noRisk')} />
        ) : (
          <>
            <EntityList aria-label={t('code.healthTab.riskAssessment')}>
              {riskFiles.map((r) => {
                const tone = RISK_TONE[r.risk_level] ?? 'neutral'
                return (
                  <EntityRow
                    key={r.path}
                    title={<FilePath path={r.path} basePath={basePath} />}
                    ariaLabel={t('code.common.historyOf', { path: r.path })}
                    onClick={() => onOpenFile(r.path)}
                    leading={<StatusDot tone={tone} label={t('code.healthTab.riskLevel', { level: levelLabel(r.risk_level) })} />}
                    trailing={r.risk_score.toFixed(3)}
                    meta={[
                      <span key="l" className={TONE_CLASSES[tone].text}>
                        {levelLabel(r.risk_level)}
                      </span>,
                      t('code.healthTab.pagerank', { value: r.factors.pagerank.toFixed(4) }),
                      t('code.healthTab.churn', { value: r.factors.churn.toFixed(3) }),
                      t('code.healthTab.knowledgeGap', { value: r.factors.knowledge_gap.toFixed(3) }),
                      t('code.healthTab.betweenness', { value: r.factors.betweenness.toFixed(4) }),
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
