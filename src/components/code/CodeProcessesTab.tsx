import { useState, useEffect, useCallback, useMemo } from 'react'
import { Play } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  ListGroup,
  Section,
  SkeletonLine,
  focusRing,
  groupBy,
  textLink,
} from '@/components/ui'
import { useToast } from '@/hooks'
import { useT } from '@/i18n'
import { useCodeCount } from './useCodeCount'
import { codeApi } from '@/services'
import type { EntryPoint, ProcessSummary } from '@/types'

interface CodeProcessesTabProps {
  projectSlug: string | null
  onOpenFile: (path: string) => void
}

interface ProcessStep {
  function_name: string
  file_path: string
  order: number
}

const ENTRY_TYPE_ORDER = ['main', 'handler', 'cli', 'event', 'other'] as const
type EntryType = (typeof ENTRY_TYPE_ORDER)[number]
const entryType = (ep: EntryPoint): EntryType => {
  const t = (ep.type ?? '').toLowerCase()
  return (ENTRY_TYPE_ORDER as readonly string[]).includes(t) ? (t as EntryType) : 'other'
}

/** `crate::api::handlers::login` / `src/a/b.rs::f` → last segment. */
function shortName(id: string): string {
  if (!id) return '—'
  const parts = id.split(/::|\//)
  return parts[parts.length - 1] || id
}

export function CodeProcessesTab({ projectSlug, onOpenFile }: CodeProcessesTabProps) {
  const { t } = useT()
  const count = useCodeCount()
  const toast = useToast()
  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([])
  const [processes, setProcesses] = useState<ProcessSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null)
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([])
  const [loadingSteps, setLoadingSteps] = useState(false)

  const loadData = useCallback(async () => {
    if (!projectSlug) return
    setLoading(true)
    setError(null)
    try {
      const [epData, procData] = await Promise.all([
        codeApi.getEntryPoints({ project_slug: projectSlug, limit: 50 }),
        codeApi.listProcesses({ project_slug: projectSlug }),
      ])
      setEntryPoints(epData.entry_points)
      setProcesses(procData.processes)
    } catch {
      setError(t('code.processes.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [projectSlug, t])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDetect = async () => {
    if (!projectSlug) return
    setDetecting(true)
    try {
      await codeApi.detectProcesses({ project_slug: projectSlug })
      await loadData()
      toast.success(t('code.processes.detectDone'))
    } catch {
      toast.error(t('code.processes.detectFailed'))
    } finally {
      setDetecting(false)
    }
  }

  const handleExpand = async (processId: string) => {
    if (expandedProcess === processId) {
      setExpandedProcess(null)
      setProcessSteps([])
      return
    }
    setExpandedProcess(processId)
    setLoadingSteps(true)
    try {
      const data = await codeApi.getProcessDetail({ process_id: processId })
      const steps = (data as { steps?: ProcessStep[] })?.steps ?? []
      setProcessSteps([...steps].sort((a, b) => a.order - b.order))
    } catch {
      setProcessSteps([])
    } finally {
      setLoadingSteps(false)
    }
  }

  const entryGroups = useMemo(() => groupBy(entryPoints, entryType, ENTRY_TYPE_ORDER), [entryPoints])

  if (!projectSlug) {
    return (
      <EmptyState
        title={t('code.common.selectProject')}
        description={t('code.processes.needProject')}
      />
    )
  }
  if (loading && processes.length === 0 && entryPoints.length === 0) return <EntityListSkeleton rows={4} />
  if (error) return <ErrorState title={t('code.processes.unavailable')} description={error} onRetry={loadData} />

  const detectButton = (
    <Button variant="secondary" size="sm" onClick={handleDetect} loading={detecting}>
      <Play className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
      {t('code.processes.detect')}
    </Button>
  )

  return (
    <div className="space-y-6">
      <Section
        title={t('code.processes.entryPoints')}
        count={entryPoints.length}
        description={t('code.processes.entryPointsDescription')}
        action={detectButton}
      >
        {entryPoints.length === 0 ? (
          <EmptyState size="sm" title={t('code.processes.noEntryPoints')} description={t('code.processes.noEntryPointsDescription')} />
        ) : (
          <div>
            {entryGroups.map(({ key, items }) => (
              <ListGroup key={key} title={t(`code.processes.entry.${key}`)} count={items.length} collapsible defaultOpen={entryGroups.length <= 2}>
                {items.map((ep) => (
                  <EntityRow
                    key={ep.id}
                    title={<span className="font-mono">{shortName(ep.id)}</span>}
                    ariaLabel={ep.id}
                    description={ep.id !== shortName(ep.id) ? <span className="font-mono break-all">{ep.id}</span> : undefined}
                    trailing={<span title={t('code.processes.entryScore')}>{ep.score.toFixed(2)}</span>}
                  />
                ))}
              </ListGroup>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={t('code.processes.detected')}
        count={processes.length}
        description={t('code.processes.detectedDescription')}
      >
        {processes.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('code.processes.noProcesses')}
            description={t('code.processes.noProcessesDescription')}
          />
        ) : (
          <EntityList aria-label={t('code.processes.detected')}>
            {processes.map((proc) => {
              const open = expandedProcess === proc.id
              return (
                <EntityRow
                  key={proc.id}
                  title={proc.label || proc.id}
                  onClick={() => handleExpand(proc.id)}
                  selected={open}
                  expanded={open}
                  chevron
                  trailing={count('step', proc.total)}
                >
                  {open &&
                    (loadingSteps ? (
                      <div className="space-y-2" role="status" aria-label={t('code.processes.loadingSteps')}>
                        <SkeletonLine width="60%" />
                        <SkeletonLine width="45%" />
                        <SkeletonLine width="55%" />
                      </div>
                    ) : processSteps.length === 0 ? (
                      <p className="text-xs text-gray-500">{t('code.processes.noSteps')}</p>
                    ) : (
                      <ol className="space-y-2 border-l border-white/[0.08] ml-1 pl-3" aria-label={t('code.processes.stepsOf', { name: proc.label || proc.id })}>
                        {processSteps.map((step, idx) => (
                          <li key={`${step.function_name}-${idx}`} className="min-w-0">
                            <span className="block font-mono text-sm text-gray-200 break-all">{step.function_name}</span>
                            <button
                              type="button"
                              onClick={() => onOpenFile(step.file_path)}
                              title={step.file_path}
                              className={`font-mono text-[11px] leading-5 break-all text-left ${textLink} ${focusRing}`}
                            >
                              {step.file_path}
                            </button>
                          </li>
                        ))}
                      </ol>
                    ))}
                </EntityRow>
              )
            })}
          </EntityList>
        )}
      </Section>
    </div>
  )
}
