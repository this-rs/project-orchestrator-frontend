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
  pluralize,
  rowInteractive,
  inlineLink,
} from '@/components/ui'
import { ProtocolRunWidget } from '@/components/particles/widgets'
import { useFeedbackVizData } from '@/hooks/useVizData'
import { useEventBus, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { CrudEvent } from '@/types/events'
import type { Protocol, ProtocolRun, ProtocolState, StateType } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_TYPE: Record<StateType, { label: string; icon: LucideIcon; cls: string }> = {
  start: { label: 'Start', icon: Circle, cls: 'text-cyan-400 fill-cyan-400' },
  intermediate: { label: 'Intermediate', icon: Circle, cls: 'text-gray-500' },
  generator: { label: 'Generator', icon: Circle, cls: 'text-gray-500' },
  terminal: { label: 'End', icon: Square, cls: 'text-green-400' },
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
      setError(err instanceof Error ? err.message : 'Failed to load protocol')
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
        if (!silent) setRunsError(err instanceof Error ? err.message : 'Failed to load runs')
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
      toast.success('Run started')
      await fetchRuns(true)
      if (run?.id) setSelectedRunId(run.id)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to start the run'))
    } finally {
      setStarting(false)
    }
  }

  const handleCancelRun = async (run: ProtocolRun) => {
    try {
      const updated = await protocolApi.cancelRun(run.id)
      setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, ...updated, status: updated?.status ?? 'cancelled' } : r)))
      toast.success('Run cancelled')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to cancel the run'))
    }
  }

  const copyId = async () => {
    if (!protocol) return
    try {
      await navigator.clipboard.writeText(protocol.id)
      toast.success('Protocol ID copied')
    } catch {
      toast.error('Failed to copy to clipboard')
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
        <ErrorState title="Failed to load protocol" description={error ?? 'Protocol not found'} onRetry={fetchProtocol} />
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
        parentLinks={[{ icon: Workflow, label: 'Protocols', name: 'Protocols', href: workspacePath(wsSlug, '/protocols') }]}
        status={<StatusText kind="protocol" status={status} />}
        meta={[
          protocol.protocol_category ? <span key="cat">{humanizeStatus(protocol.protocol_category)}</span> : null,
          mode ? (
            <span key="mode" className="inline-flex items-center gap-1">
              <mode.icon className="w-3 h-3" aria-hidden="true" />
              {mode.label}
            </span>
          ) : (
            <span key="mode">Manual</span>
          ),
          pluralize(states.length, 'state'),
          pluralize(transitions.length, 'transition'),
          activeRuns > 0 ? (
            <StatusText key="live" kind="run" status="running" pulse label={`${activeRuns} active`} />
          ) : null,
          <RelativeTime key="u" date={protocol.updated_at ?? protocol.created_at} prefix="updated " />,
        ]}
        actions={
          status !== 'archived' ? (
            <Button size="sm" onClick={handleStartRun} loading={starting} className="gap-1.5">
              {!starting && <Play className="w-3.5 h-3.5" aria-hidden="true" />}
              Start run
            </Button>
          ) : undefined
        }
        overflowActions={[
          { label: 'Refresh', icon: RefreshCw, onClick: () => { fetchProtocol(); fetchRuns() } },
          { label: 'Copy ID', icon: Copy, onClick: copyId },
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
        <Section title="State machine">
          <Explainer className="mb-2">
            Chaque case est un état, chaque flèche une transition, étiquetée par l’événement qui la déclenche. Un run
            part de l’état « Start » et s’arrête sur un état « End ». Les cases violettes contiennent un sous-protocole :
            touchez-les pour l’ouvrir. Glissez pour vous déplacer, pincez pour zoomer.
          </Explainer>
          {states.length === 0 ? (
            <EmptyState size="sm" title="No states defined" description="This protocol has no FSM states yet." />
          ) : (
            <div className="h-[360px] sm:h-[460px] lg:h-[540px] rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <FsmViewer protocol={protocol} highlightedStateId={highlightedStateId} />
            </div>
          )}
        </Section>
      </div>

      {/* ── Runs ──────────────────────────────────────────────────────── */}
      <Section
        title="Runs"
        count={runsLoading ? undefined : runs.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => fetchRuns()} disabled={runsLoading} aria-label="Refresh runs">
            <RefreshCw className={`w-3.5 h-3.5 ${runsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        }
      >
        <Explainer className="mb-2">
          Un run est une exécution du protocole : il avance d’état en état à chaque événement. Touchez un run pour voir son
          arbre (sous-runs lancés par les sous-protocoles) et son parcours.
        </Explainer>
        {runsError ? (
          <ErrorState title="Failed to load runs" description={runsError} onRetry={() => fetchRuns()} />
        ) : runsLoading ? (
          <EntityListSkeleton rows={3} />
        ) : runs.length === 0 ? (
          <EmptyState size="sm" title="No runs yet" description="Start a run to see its execution here." />
        ) : (
          <EntityList aria-label="Runs">
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
        <Section title="States" count={states.length} collapsible defaultOpen={states.length <= 8}>
          <EntityList aria-label="States">
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
        <Section title="Transitions" count={transitions.length} collapsible defaultOpen={transitions.length <= 8}>
          <EntityList aria-label="Transitions">
            {transitions.map((t) => (
              <EntityRow
                key={t.id}
                title={`${stateName(t.from_state)} → ${stateName(t.to_state)}`}
                description={t.description}
                meta={[
                  <span key="on">
                    on <span className="font-mono text-gray-300 break-all">{t.trigger}</span>
                  </span>,
                  t.guard ? (
                    <span key="guard" className="break-words">
                      if <span className="font-mono text-gray-400">{t.guard}</span>
                    </span>
                  ) : null,
                  t.action ? (
                    <span key="action" className="break-words">
                      then <span className="font-mono text-gray-400">{t.action}</span>
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
          title="Timeline"
          collapsible
          defaultOpen={false}
          description="Runs placed on a time axis — tap a bar to select the run."
        >
          <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="min-w-[480px]">
              <GanttTimeline runs={ganttRuns} onRunClick={selectRunFromTimeline} />
            </div>
          </div>
        </Section>
      )}

      {/* ── Details ───────────────────────────────────────────────────── */}
      <Section title="Details">
        <Facts
          items={[
            { label: 'Status', value: <StatusText kind="protocol" status={status} /> },
            { label: 'Category', value: protocol.protocol_category ? humanizeStatus(protocol.protocol_category) : null },
            { label: 'Trigger mode', value: mode ? mode.label : 'Manual' },
            {
              label: 'Trigger config',
              value: triggerConfig ? <span className="font-mono text-xs break-all">{formatTriggerConfig(triggerConfig)}</span> : null,
            },
            { label: 'Last triggered', value: protocol.last_triggered_at ? formatAbsolute(protocol.last_triggered_at) : null },
            { label: 'Created', value: formatAbsolute(protocol.created_at) },
            { label: 'Updated', value: protocol.updated_at ? formatAbsolute(protocol.updated_at) : null },
            { label: 'ID', value: <span className="font-mono text-xs break-all">{protocol.id}</span> },
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
  const state = runStateName(run)
  const visited = run.states_visited?.length ?? 0
  const active = ACTIVE_RUN.has(run.status)
  return (
    <EntityRow
      title={state ?? 'Run'}
      titleSuffix={<span className="font-mono text-[11px] text-gray-600">{run.id.slice(0, 8)}</span>}
      ariaLabel={`Run ${run.id.slice(0, 8)}${state ? ` in ${state}` : ''}`}
      onClick={onToggle}
      selected={selected}
      trailing={<RelativeTime date={run.started_at} />}
      meta={[
        <StatusText key="s" kind="run" status={run.status} pulse={run.status === 'running'} />,
        <span key="d" className="tabular-nums">{formatRunDuration(run.started_at, run.completed_at)}</span>,
        visited > 0 ? `${pluralize(visited, 'state')} visited` : null,
        run.triggered_by ? <span key="t">by {humanizeStatus(run.triggered_by)}</span> : null,
      ]}
      context={run.error ? <p className="text-xs leading-4 text-red-400/90 break-words">{run.error}</p> : undefined}
      actions={[
        {
          label: 'Cancel run',
          icon: Ban,
          variant: 'danger',
          hidden: !active,
          onClick: onCancel,
          confirm: {
            title: 'Cancel this run?',
            description: 'The run stops where it is and is marked as cancelled. This cannot be undone.',
            confirmLabel: 'Cancel run',
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
  const feedbackViz = useFeedbackVizData(runId)
  return (
    <div id={`run-${runId}`} className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div>
        <p className="px-1 pb-1 text-[11px] font-medium text-gray-500">Run tree</p>
        <RunTreeView rootRunId={runId} />
      </div>
      {feedbackViz.data && (
        <div>
          <p className="px-1 pb-1 text-[11px] font-medium text-gray-500">Path through the states — tap a marker to find it in the diagram</p>
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
  const type = STATE_TYPE[state.state_type] ?? STATE_TYPE.intermediate
  const Icon = state.sub_protocol_id ? Layers : type.icon
  return (
    <EntityRow
      title={state.name}
      leading={<Icon className={`w-3 h-3 ${state.sub_protocol_id ? 'text-violet-400' : type.cls}`} aria-hidden="true" />}
      description={state.description}
      meta={[
        <span key="type">{type.label}</span>,
        outgoing.length > 0 ? (
          <span key="out" className="break-words">→ {outgoing.join(', ')}</span>
        ) : null,
        subProtocolHref ? (
          <Link key="sub" to={subProtocolHref} className={`${rowInteractive} ${inlineLink} inline-flex items-center gap-1`}>
            <Layers className="w-3 h-3" aria-hidden="true" />
            Open sub-protocol
          </Link>
        ) : null,
      ]}
    />
  )
}
