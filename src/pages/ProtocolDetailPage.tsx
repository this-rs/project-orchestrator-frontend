/**
 * ProtocolDetailPage — one protocol with all its information, then its graph
 * neighbourhood:
 *
 *   Header      name · status · category · trigger mode · counts · dates, Start run
 *   State machine  interactive FSM diagram (drill into sub-protocols)
 *   Runs        executions of this protocol — tap one to see its run tree,
 *               state spiral; cancel an active run from its ⋯ menu
 *   States / Transitions  the FSM as readable lists (descriptions, guards…)
 *   Timeline    Gantt of the runs
 *   Details     trigger configuration, ids, dates
 *
 * `?run=<id>` preselects a run (links from the "Recent runs" view).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Ban,
  Circle,
  Copy,
  Layers,
  Play,
  RefreshCw,
  Square,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { protocolApi } from '@/services'
import { FsmViewer } from '@/components/protocols/FsmViewer'
import { RunTreeView, formatRunDuration } from '@/components/protocols/RunTreeView'
import { GanttTimeline } from '@/components/protocols/GanttTimeline'
import type { GanttRun } from '@/components/protocols/GanttTimeline'
import { Explainer } from '@/components/protocols/Explainer'
import { runStateName } from '@/components/protocols/RecentRunsPanel'
import { triggerModeMeta, formatTriggerConfig } from '@/components/protocols/ScheduledActionsPanel'
import { apiErrorMessage } from '@/components/protocols/rfcLifecycle'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Facts,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  StatusText,
  formatAbsolute,
  humanizeStatus,
  rowInteractive,
  inlineLink,
} from '@/components/ui'
import { ProtocolRunWidget } from '@/components/particles/widgets'
import { useFeedbackVizData } from '@/hooks/useVizData'
import { useEventBus, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { CrudEvent } from '@/types/events'
import type { Protocol, ProtocolRun, ProtocolState, StateType } from '@/types/protocol'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { activeTranslator, useT } from '@/i18n'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_TYPE: Record<StateType, { icon: LucideIcon; cls: string }> = {
  start: { icon: Circle, cls: 'text-cyan-400 fill-cyan-400' },
  intermediate: { icon: Circle, cls: 'text-gray-500' },
  generator: { icon: Circle, cls: 'text-gray-500' },
  terminal: { icon: Square, cls: 'text-green-400' },
}
const STATE_ORDER: StateType[] = ['start', 'intermediate', 'generator', 'terminal']

const ACTIVE_RUN = new Set(['pending', 'running'])

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProtocolDetailPage() {
  const { protocolId } = useParams<{ protocolId: string }>()
  const [searchParams] = useSearchParams()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const { t } = useT()

  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [runs, setRuns] = useState<ProtocolRun[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(searchParams.get('run'))
  const [starting, setStarting] = useState(false)

  // FSM highlight (set by a click on the run spiral) + scroll target
  const [highlightedStateId, setHighlightedStateId] = useState<string | null>(null)
  const fsmRef = useRef<HTMLDivElement>(null)

  // ── Fetch protocol ───────────────────────────────────────────────────
  const fetchProtocol = useCallback(async () => {
    if (!protocolId) return
    setLoading(true)
    setError(null)
    try {
      setProtocol(await protocolApi.getProtocol(protocolId))
    } catch (err) {
      setError(err instanceof Error ? err.message : activeTranslator().t('siteKnowledge.protocol.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [protocolId])

  useEffect(() => {
    fetchProtocol()
  }, [fetchProtocol])

  // ── Fetch runs (silent refreshes keep the list in place) ─────────────
  const fetchRuns = useCallback(
    async (silent = false) => {
      if (!protocolId) return
      if (!silent) setRunsLoading(true)
      setRunsError(null)
      try {
        const res = await protocolApi.listRuns(protocolId, { limit: 100 })
        setRuns(res.items)
      } catch (err) {
        if (!silent) setRunsError(err instanceof Error ? err.message : activeTranslator().t('siteKnowledge.protocol.runsLoadFailed'))
      } finally {
        if (!silent) setRunsLoading(false)
      }
    },
    [protocolId],
  )

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  // Live: refresh the run list when any protocol run changes
  const fetchRunsRef = useRef(fetchRuns)
  useEffect(() => {
    fetchRunsRef.current = fetchRuns
  }, [fetchRuns])
  const onCrudEvent = useCallback((event: CrudEvent) => {
    if (event.entity_type === 'protocol_run') fetchRunsRef.current(true)
  }, [])
  useEventBus(onCrudEvent)

  // ── Actions ──────────────────────────────────────────────────────────
  const handleStartRun = async () => {
    if (!protocol) return
    setStarting(true)
    try {
      const run = await protocolApi.startRun(protocol.id)
      toast.success(t('siteKnowledge.protocol.runStarted'))
      await fetchRuns(true)
      if (run?.id) setSelectedRunId(run.id)
    } catch (err) {
      toast.error(apiErrorMessage(err, t('siteKnowledge.shared.startFailed')))
    } finally {
      setStarting(false)
    }
  }

  const handleCancelRun = async (run: ProtocolRun) => {
    try {
      const updated = await protocolApi.cancelRun(run.id)
      setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, ...updated, status: updated?.status ?? 'cancelled' } : r)))
      toast.success(t('siteKnowledge.protocol.runCancelled'))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('siteKnowledge.protocol.cancelFailed')))
    }
  }

  const copyId = async () => {
    if (!protocol) return
    try {
      await navigator.clipboard.writeText(protocol.id)
      toast.success(t('siteKnowledge.protocol.idCopied'))
    } catch {
      toast.error(t('siteKnowledge.shared.copyFailed'))
    }
  }

  const showStateInFsm = (stateId: string) => {
    setHighlightedStateId(stateId)
    fsmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectRunFromTimeline = (runId: string) => {
    setSelectedRunId(runId)
    // Wait for the run detail to render before scrolling to it
    window.setTimeout(() => {
      document.getElementById(`run-${runId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  // ── Derived ──────────────────────────────────────────────────────────
  const states = useMemo(() => protocol?.states ?? [], [protocol])
  const transitions = useMemo(() => protocol?.transitions ?? [], [protocol])
  const stateName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of states) m.set(s.id, s.name)
    return (id: string) => m.get(id) ?? id.slice(0, 8)
  }, [states])
  const orderedStates = useMemo(
    () => [...states].sort((a, b) => STATE_ORDER.indexOf(a.state_type) - STATE_ORDER.indexOf(b.state_type)),
    [states],
  )

  const ganttRuns: GanttRun[] = useMemo(
    () =>
      runs.map((run) => ({
        id: run.id,
        protocol_name: runStateName(run) ?? run.id.slice(0, 8),
        status: run.status,
        started_at: run.started_at,
        finished_at: run.completed_at ?? null,
      })),
    [runs],
  )

  const activeRuns = runs.filter((r) => ACTIVE_RUN.has(r.status)).length

  // ── Loading / Error ──────────────────────────────────────────────────
  if (loading && !protocol) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <div className="h-7 w-2/3 rounded bg-white/[0.04]" />
        <EntityListSkeleton rows={4} />
      </PageContainer>
    )
  }

  if (error || !protocol) {
    return (
      <PageContainer width="wide">
        <ErrorState title={t('siteKnowledge.protocol.loadFailed')} description={error ?? t('siteKnowledge.protocol.notFound')} onRetry={fetchProtocol} />
      </PageContainer>
    )
  }

  const status = protocol.status ?? 'active'
  const mode = protocol.trigger_mode && protocol.trigger_mode !== 'manual' ? triggerModeMeta(protocol.trigger_mode) : null
  const triggerConfig = protocol.trigger_config && Object.keys(protocol.trigger_config).length > 0 ? protocol.trigger_config : null
  const tags = protocol.tags ?? []

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={protocol.name}
        parentLinks={[{ icon: Workflow, label: NOMENCLATURE.protocols.plural, name: NOMENCLATURE.protocols.plural, href: workspacePath(wsSlug, `/${NOMENCLATURE.protocols.segment}`) }]}
        status={<StatusText kind="protocol" status={status} />}
        meta={[
          protocol.protocol_category ? <span key="cat">{humanizeStatus(protocol.protocol_category)}</span> : null,
          mode ? (
            <span key="mode" className="inline-flex items-center gap-1">
              <mode.icon className="w-3 h-3" aria-hidden="true" />
              {mode.label}
            </span>
          ) : (
            <span key="mode">{t('siteKnowledge.protocol.manual')}</span>
          ),
          activeRuns > 0 ? (
            <StatusText key="live" kind="run" status="running" pulse label={t('siteKnowledge.protocol.activeCount', { count: activeRuns })} />
          ) : null,
          states.length === 1
            ? t('siteKnowledge.protocols.states.one', { n: 1 })
            : t('siteKnowledge.protocols.states.other', { n: states.length }),
          transitions.length === 1
            ? t('siteKnowledge.protocols.transitions.one', { n: 1 })
            : t('siteKnowledge.protocols.transitions.other', { n: transitions.length }),
          <RelativeTime key="u" date={protocol.updated_at ?? protocol.created_at} prefix={`${t('siteKnowledge.protocol.updatedLabel')} `} />,
        ]}
        actions={
          status !== 'archived' ? (
            <Button size="sm" onClick={handleStartRun} loading={starting} className="gap-1.5">
              {!starting && <Play className="w-3.5 h-3.5" aria-hidden="true" />}
              {t('siteKnowledge.shared.run')}
            </Button>
          ) : undefined
        }
        overflowActions={[
          { label: t('siteKnowledge.shared.refresh'), icon: RefreshCw, onClick: () => { fetchProtocol(); fetchRuns() } },
          { label: t('siteKnowledge.shared.copyId'), icon: Copy, onClick: copyId },
        ]}
        description={protocol.description}
      >
        {tags.map((t) => (
          <span key={t} className="rounded border border-white/[0.08] px-1.5 text-[11px] text-gray-400">
            #{t}
          </span>
        ))}
      </PageHeader>

      {/* ── State machine ─────────────────────────────────────────────── */}
      <div ref={fsmRef} className="scroll-mt-16">
        <Section title={t('siteKnowledge.protocol.stateMachine')}>
          <Explainer className="mb-2">{t('siteKnowledge.protocol.stateMachineExplain')}</Explainer>
          {states.length === 0 ? (
            <EmptyState size="sm" title={t('siteKnowledge.protocol.noStates')} description={t('siteKnowledge.protocol.noStatesDescription')} />
          ) : (
            <div className="h-[360px] sm:h-[460px] lg:h-[540px] rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <FsmViewer protocol={protocol} highlightedStateId={highlightedStateId} />
            </div>
          )}
        </Section>
      </div>

      {/* ── Runs ──────────────────────────────────────────────────────── */}
      <Section
        title={t('siteKnowledge.protocol.runs')}
        count={runsLoading ? undefined : runs.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => fetchRuns()} disabled={runsLoading} aria-label={t('siteKnowledge.protocol.refreshRunsAria')}>
            <RefreshCw className={`w-3.5 h-3.5 ${runsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        }
      >
        <Explainer className="mb-2">{t('siteKnowledge.protocol.runsExplain')}</Explainer>
        {runsError ? (
          <ErrorState title={t('siteKnowledge.protocol.runsLoadFailed')} description={runsError} onRetry={() => fetchRuns()} />
        ) : runsLoading ? (
          <EntityListSkeleton rows={3} />
        ) : runs.length === 0 ? (
          <EmptyState size="sm" title={t('siteKnowledge.protocol.noRuns')} description={t('siteKnowledge.protocol.noRunsDescription')} />
        ) : (
          <EntityList aria-label={t('siteKnowledge.protocol.runsAria')}>
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                selected={run.id === selectedRunId}
                onToggle={() => setSelectedRunId((cur) => (cur === run.id ? null : run.id))}
                onCancel={() => handleCancelRun(run)}
                onShowState={showStateInFsm}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {/* ── States ────────────────────────────────────────────────────── */}
      {states.length > 0 && (
        <Section title={t('siteKnowledge.protocol.states')} count={states.length} collapsible defaultOpen={states.length <= 8}>
          <EntityList aria-label={t('siteKnowledge.protocol.statesAria')}>
            {orderedStates.map((s) => (
              <StateRow
                key={s.id}
                state={s}
                outgoing={transitions.filter((t) => t.from_state === s.id).map((t) => stateName(t.to_state))}
                subProtocolHref={s.sub_protocol_id ? workspacePath(wsSlug, `/protocols/${s.sub_protocol_id}`) : undefined}
              />
            ))}
          </EntityList>
        </Section>
      )}

      {/* ── Transitions ───────────────────────────────────────────────── */}
      {transitions.length > 0 && (
        <Section title={t('siteKnowledge.protocol.transitions')} count={transitions.length} collapsible defaultOpen={transitions.length <= 8}>
          <EntityList aria-label={t('siteKnowledge.protocol.transitionsAria')}>
            {transitions.map((tr) => (
              <EntityRow
                key={tr.id}
                title={`${stateName(tr.from_state)} → ${stateName(tr.to_state)}`}
                description={tr.description}
                meta={[
                  <span key="on">
                    {t('siteKnowledge.protocol.on')} <span className="font-mono text-gray-300 break-all">{tr.trigger}</span>
                  </span>,
                  tr.guard ? (
                    <span key="guard" className="break-words">
                      {t('siteKnowledge.protocol.ifGuard')} <span className="font-mono text-gray-400">{tr.guard}</span>
                    </span>
                  ) : null,
                  tr.action ? (
                    <span key="action" className="break-words">
                      {t('siteKnowledge.protocol.thenAction')} <span className="font-mono text-gray-400">{tr.action}</span>
                    </span>
                  ) : null,
                ]}
              />
            ))}
          </EntityList>
        </Section>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────── */}
      {runs.length > 0 && (
        <Section
          title={t('siteKnowledge.protocol.timeline')}
          collapsible
          defaultOpen={false}
          description={t('siteKnowledge.protocol.timelineDescription')}
        >
          <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="min-w-[480px]">
              <GanttTimeline runs={ganttRuns} onRunClick={selectRunFromTimeline} />
            </div>
          </div>
        </Section>
      )}

      {/* ── Details ───────────────────────────────────────────────────── */}
      <Section title={t('siteKnowledge.protocol.details')}>
        <Facts
          items={[
            { label: t('siteKnowledge.protocol.status'), value: <StatusText kind="protocol" status={status} /> },
            { label: t('siteKnowledge.protocols.category'), value: protocol.protocol_category ? humanizeStatus(protocol.protocol_category) : null },
            { label: t('siteKnowledge.protocol.triggerMode'), value: mode ? mode.label : t('siteKnowledge.protocol.manual') },
            {
              label: t('siteKnowledge.protocol.triggerConfig'),
              value: triggerConfig ? <span className="font-mono text-xs break-all">{formatTriggerConfig(triggerConfig)}</span> : null,
            },
            { label: t('siteKnowledge.protocol.lastTriggered'), value: protocol.last_triggered_at ? formatAbsolute(protocol.last_triggered_at) : null },
            { label: t('siteKnowledge.protocol.createdLabel'), value: formatAbsolute(protocol.created_at) },
            { label: t('siteKnowledge.protocol.updatedLabel'), value: protocol.updated_at ? formatAbsolute(protocol.updated_at) : null },
            { label: t('siteKnowledge.protocol.idLabel'), value: <span className="font-mono text-xs break-all">{protocol.id}</span> },
          ]}
        />
      </Section>

      {/* ENTITY_GRAPH_SLOT entity_type="protocol" entity_id={protocol.id} */}
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------
// Run row (+ expanded run tree / spiral)
// ---------------------------------------------------------------------------

interface RunRowProps {
  run: ProtocolRun
  selected: boolean
  onToggle: () => void
  onCancel: () => Promise<void>
  onShowState: (stateId: string) => void
}

function RunRow({ run, selected, onToggle, onCancel, onShowState }: RunRowProps) {
  const { t } = useT()
  const state = runStateName(run)
  const visited = run.states_visited?.length ?? 0
  const active = ACTIVE_RUN.has(run.status)
  return (
    <EntityRow
      title={state ?? t('siteKnowledge.shared.run')}
      titleSuffix={<span className="font-mono text-[11px] text-gray-600">{run.id.slice(0, 8)}</span>}
      ariaLabel={
        state
          ? t('siteKnowledge.protocol.runAriaIn', { id: run.id.slice(0, 8), state })
          : t('siteKnowledge.protocol.runAria', { id: run.id.slice(0, 8) })
      }
      onClick={onToggle}
      selected={selected}
      trailing={<RelativeTime date={run.started_at} />}
      meta={[
        <StatusText key="s" kind="run" status={run.status} pulse={run.status === 'running'} />,
        run.triggered_by ? <span key="t">{t('siteKnowledge.shared.by', { who: humanizeStatus(run.triggered_by) })}</span> : null,
        <span key="d" className="tabular-nums">{formatRunDuration(run.started_at, run.completed_at)}</span>,
        visited > 0
          ? visited === 1
            ? t('siteKnowledge.shared.stateVisited.one', { n: 1 })
            : t('siteKnowledge.shared.stateVisited.other', { n: visited })
          : null,
      ]}
      context={run.error ? <p className="text-xs leading-4 text-red-400/90 break-words">{run.error}</p> : undefined}
      actions={[
        {
          label: t('siteKnowledge.protocol.cancelRun'),
          icon: Ban,
          variant: 'danger',
          hidden: !active,
          onClick: onCancel,
          confirm: {
            title: t('siteKnowledge.protocol.cancelTitle'),
            description: t('siteKnowledge.protocol.cancelDescription'),
            confirmLabel: t('siteKnowledge.protocol.cancelRun'),
          },
        },
      ]}
      className="scroll-mt-24"
    >
      {selected && <RunDetail runId={run.id} onShowState={onShowState} />}
    </EntityRow>
  )
}

function RunDetail({ runId, onShowState }: { runId: string; onShowState: (stateId: string) => void }) {
  const { t } = useT()
  const feedbackViz = useFeedbackVizData(runId)
  return (
    <div id={`run-${runId}`} className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div>
        <p className="px-1 pb-1 text-[11px] font-medium text-gray-500">{t('siteKnowledge.protocol.runTree')}</p>
        <RunTreeView rootRunId={runId} />
      </div>
      {feedbackViz.data && (
        <div>
          <p className="px-1 pb-1 text-[11px] font-medium text-gray-500">{t('siteKnowledge.protocol.pathThroughStates')}</p>
          <ProtocolRunWidget
            data={feedbackViz.data}
            height={200}
            className="rounded-lg"
            interactive
            onMarkerClick={(info) => {
              const stateId = info.metadata?.state_id as string | undefined
              if (stateId) onShowState(stateId)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// State row
// ---------------------------------------------------------------------------

function StateRow({ state, outgoing, subProtocolHref }: { state: ProtocolState; outgoing: string[]; subProtocolHref?: string }) {
  const { t } = useT()
  const type = STATE_TYPE[state.state_type] ?? STATE_TYPE.intermediate
  const typeLabels: Record<StateType, string> = {
    start: t('siteKnowledge.protocol.stateStart'),
    intermediate: t('siteKnowledge.protocol.stateIntermediate'),
    generator: t('siteKnowledge.protocol.stateGenerator'),
    terminal: t('siteKnowledge.protocol.stateEnd'),
  }
  const typeLabel = typeLabels[state.state_type] ?? typeLabels.intermediate
  const Icon = state.sub_protocol_id ? Layers : type.icon
  return (
    <EntityRow
      title={state.name}
      leading={<Icon className={`w-3 h-3 ${state.sub_protocol_id ? 'text-violet-400' : type.cls}`} aria-hidden="true" />}
      description={state.description}
      meta={[
        <span key="type">{typeLabel}</span>,
        outgoing.length > 0 ? (
          <span key="out" className="break-words">→ {outgoing.join(', ')}</span>
        ) : null,
        subProtocolHref ? (
          <Link key="sub" to={subProtocolHref} className={`${rowInteractive} ${inlineLink} inline-flex items-center gap-1`}>
            <Layers className="w-3 h-3" aria-hidden="true" />
            {t('siteKnowledge.protocol.open')}
          </Link>
        ) : null,
      ]}
    />
  )
}
