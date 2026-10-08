/**
 * ProtocolsPage — protocols of the workspace (or of one project), in three views:
 *   - Protocols : the list, grouped by status (server-side status filter)
 *   - Recent runs : latest runs across the listed protocols
 *   - Scheduled : protocols that start on their own, with "Run now"
 * Search filters the protocols client-side (name, description, tags) in every view.
 */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { Folder, GitBranch, RefreshCw, Shapes, Tag } from 'lucide-react'

import { protocolApi, workspacesApi } from '@/services'
import { RecentRunsPanel } from '@/components/protocols/RecentRunsPanel'
import { ScheduledActionsPanel, triggerModeMeta } from '@/components/protocols/ScheduledActionsPanel'
import { Explainer } from '@/components/protocols/Explainer'
import { ViewTabs } from '@/components/ui'
import {
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Fact,
  FilterBar,
  ListGroup,
  PageShell,
  RelativeTime,
  Select,
  StatusText,
  getStatusMeta,
  getStatusOptions,
  groupBy,
  pluralize,
  Button,
} from '@/components/ui'
import { iconButton } from '@/components/ui/classes'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Protocol, ProtocolStatus } from '@/types/protocol'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { fetchAllPages } from '@/services/paginate'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type View = 'protocols' | 'runs' | 'scheduled'

const STATUS_ORDER: ProtocolStatus[] = ['active', 'draft', 'archived']
const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('protocol')]

const EXPLAIN: Record<View, string> = {
  protocols:
    'A protocol is a finite state machine (FSM): states connected by transitions, taken when an event fires. Each execution of a protocol is a run; a state can hold a sub-protocol.',
  runs: 'The 3 latest runs of each protocol, newest first. A pulsing dot marks a run in progress; tap a row to open its protocol.',
  scheduled:
    'Protocols that start on their own (cron schedule, event, webhook…). “Run” starts one immediately, without waiting for the trigger.',
}

function matches(p: Protocol, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    p.name.toLowerCase().includes(needle) ||
    (p.description ?? '').toLowerCase().includes(needle) ||
    (p.tags ?? []).some((t) => t.toLowerCase().includes(needle))
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProtocolsPage() {
  const wsSlug = useWorkspaceSlug()

  // ── Projects (workspace = all projects merged) ───────────────────────
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectFilter, setProjectFilter] = useState<string>('all')

  useEffect(() => {
    if (!wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then(setProjects)
      .catch(() => {})
      .finally(() => setProjectsLoaded(true))
  }, [wsSlug])

  const activeProjectId = projectFilter !== 'all' ? projectFilter : undefined

  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('protocols')
  const [statusFilter, setStatusFilter] = useState<ProtocolStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // The status filter only applies to the protocol list.
  const statusParam = view === 'protocols' && statusFilter !== 'all' ? statusFilter : undefined

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchProtocols = useCallback(async () => {
    if (projects.length === 0) {
      setProtocols([])
      setLoading(!projectsLoaded)
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (activeProjectId) {
        const res = await fetchAllPages((page) =>
          protocolApi.listProtocols({ project_id: activeProjectId, status: statusParam, ...page }),
        )
        setProtocols(res.items)
      } else {
        // Workspace mode: fetch every project in parallel, merge, dedupe
        const results = await Promise.all(
          projects.map((p) =>
            fetchAllPages((page) =>
              protocolApi.listProtocols({ project_id: p.id, status: statusParam, ...page }),
            ).catch(() => ({ items: [] as Protocol[], total: 0 })),
          ),
        )
        const byId = new Map<string, Protocol>()
        for (const p of results.flatMap((r) => r.items)) if (!byId.has(p.id)) byId.set(p.id, p)
        setProtocols([...byId.values()])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load protocols')
    } finally {
      setLoading(false)
    }
    // refreshKey: explicit refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, projects, projectsLoaded, statusParam, refreshKey])

  useEffect(() => {
    fetchProtocols()
  }, [fetchProtocols])

  const handleRefresh = () => setRefreshKey((k) => k + 1)

  const visible = useMemo(() => protocols.filter((p) => matches(p, search.trim())), [protocols, search])
  const groups = useMemo(() => groupBy(visible, (p) => p.status ?? 'active', STATUS_ORDER), [visible])

  // ── Filters ──────────────────────────────────────────────────────────
  const showProjectFilter = projects.length > 1
  const showStatusFilter = view === 'protocols'
  const activeFilterCount = (activeProjectId ? 1 : 0) + (showStatusFilter && statusFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    activeProjectId ? projects.find((p) => p.id === activeProjectId)?.name ?? '' : '',
    showStatusFilter && statusFilter !== 'all' ? getStatusMeta('protocol', statusFilter).label : '',
  ]
  const clearFilters = () => {
    setProjectFilter('all')
    setStatusFilter('all')
  }
  const hasFilterControls = showProjectFilter || showStatusFilter

  const protocolHref = (id: string) => workspacePath(wsSlug, `/protocols/${id}`)

  // ── Content ──────────────────────────────────────────────────────────
  let content: ReactNode
  if (projectsLoaded && projects.length === 0) {
    content = <EmptyState title="No projects in this workspace" description="Add a project to this workspace to see its protocols." />
  } else if (error) {
    content = <ErrorState title="Failed to load protocols" description={error} onRetry={handleRefresh} />
  } else if (loading) {
    content = <EntityListSkeleton rows={6} />
  } else if (view === 'runs') {
    content = <RecentRunsPanel protocols={visible} runHref={(pid, runId) => `${protocolHref(pid)}?run=${runId}`} />
  } else if (view === 'scheduled') {
    content = <ScheduledActionsPanel protocols={visible} onTrigger={handleRefresh} protocolHref={protocolHref} />
  } else if (visible.length === 0) {
    const pristine = protocols.length === 0 && statusFilter === 'all' && projectFilter === 'all' && !search
    content = (
      <EmptyState
        title={pristine ? 'No protocols yet' : 'No matching protocols'}
        description={
          pristine
            ? 'Ask an assistant to write one: it appears here as soon as it is saved.'
            : 'Try another search or clear the filters.'
        }
        action={
          pristine ? undefined : (
            <Button size="sm" variant="secondary" onClick={() => { clearFilters(); setSearch('') }}>
              Clear
            </Button>
          )
        }
      />
    )
  } else {
    content = (
      <div>
        {groups.map(({ key, items }) => (
          <ListGroup
            key={key}
            title={getStatusMeta('protocol', key).label}
            count={items.length}
            collapsible={key === 'archived'}
            defaultOpen={key !== 'archived' || groups.length === 1}
          >
            {items.map((p) => (
              <ProtocolRow key={p.id} protocol={p} href={protocolHref(p.id)} />
            ))}
          </ListGroup>
        ))}
      </div>
    )
  }

  return (
    <PageShell
      title={NOMENCLATURE.protocols.plural}
      description="Procedures the assistant follows step by step, every time."
      intro="protocols"
      count={loading || view !== 'protocols' ? undefined : visible.length}
      width="wide"
      filters={
        <div className="space-y-3">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search protocols…"
            activeCount={activeFilterCount}
            activeLabels={activeLabels}
            onClear={clearFilters}
            filters={
              hasFilterControls ? (
                <>
                  {showProjectFilter && (
                    <Select
                      options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                      value={projectFilter}
                      onChange={setProjectFilter}
                      icon={<Folder className="w-3 h-3" />}
                    />
                  )}
                  {showStatusFilter && (
                    <Select
                      options={statusOptions}
                      value={statusFilter}
                      onChange={(v) => setStatusFilter(v as ProtocolStatus | 'all')}
                    />
                  )}
                </>
              ) : undefined
            }
            trailing={
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                aria-label="Refresh"
                className={`${iconButton('ghost', 'size-9 md:size-8')} text-gray-400`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
              </button>
            }
          />
          <ViewTabs
            label="Protocol views"
            value={view}
            onChange={setView}
            tabs={[
              { id: 'protocols', label: 'Protocols' },
              { id: 'runs', label: 'Recent runs' },
              { id: 'scheduled', label: 'Scheduled' },
            ]}
          />
          <Explainer>{EXPLAIN[view]}</Explainer>
        </div>
      }
    >
      {content}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Protocol row
// ---------------------------------------------------------------------------

function ProtocolRow({ protocol, href }: { protocol: Protocol; href: string }) {
  const states = protocol.states?.length
  const transitions = protocol.transitions?.length
  const hasMacro = protocol.states?.some((s) => s.sub_protocol_id) ?? false
  const auto = protocol.trigger_mode && protocol.trigger_mode !== 'manual' ? triggerModeMeta(protocol.trigger_mode) : null
  const tags = protocol.tags ?? []
  const status = protocol.status ?? 'active'

  return (
    <EntityRow
      title={protocol.name}
      href={href}
      muted={status === 'archived'}
      tone={getStatusMeta('protocol', status).tone}
      status={[<StatusText key="status" kind="protocol" icon status={status} />]}
      description={protocol.description}
      trailing={<RelativeTime date={protocol.updated_at ?? protocol.created_at} />}
      meta={[
        protocol.protocol_category ? (
          <Fact key="cat" icon={Shapes} title="Category">
            {protocol.protocol_category}
          </Fact>
        ) : null,
        auto ? (
          <Fact key="auto" icon={auto.icon} title="Trigger">
            {auto.label}
          </Fact>
        ) : null,
        // State counts are only present when the API includes the FSM (detail payload)
        states ? pluralize(states, 'state') : null,
        transitions ? pluralize(transitions, 'transition') : null,
        hasMacro ? (
          <Fact key="macro" icon={GitBranch}>
            sub-protocols
          </Fact>
        ) : null,
        tags.length > 0 ? (
          <Fact key="tags" icon={Tag}>
            {tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
            {tags.length > 3 ? ` +${tags.length - 3}` : ''}
          </Fact>
        ) : null,
      ]}
    />
  )
}
