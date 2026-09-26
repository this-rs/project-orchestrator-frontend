/**
 * ProtocolsPage — protocols of the workspace (or of one project), in three views:
 *   - Protocols : the list, grouped by status (server-side status filter)
 *   - Recent runs : latest runs across the listed protocols
 *   - Scheduled : protocols that start on their own, with "Run now"
 * Search filters the protocols client-side (name, description, tags) in every view.
 */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { Folder, GitBranch, RefreshCw } from 'lucide-react'

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
  FilterBar,
  ListGroup,
  PageShell,
  RelativeTime,
  Select,
  StatusDot,
  focusRing,
  getStatusMeta,
  getStatusOptions,
  groupBy,
  pluralize,
} from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Protocol, ProtocolStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type View = 'protocols' | 'runs' | 'scheduled'

const STATUS_ORDER: ProtocolStatus[] = ['active', 'draft', 'archived']
const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('protocol')]

const EXPLAIN: Record<View, string> = {
  protocols:
    'A protocol is a state machine (FSM): states connected by transitions, taken when an event occurs. Each execution of a protocol is a run.',
  runs: 'The 3 latest runs of each protocol, newest first. A pulsing dot marks a run in progress; tap a row to open its protocol.',
  scheduled:
    'Protocols that start on their own (cron schedule, event, webhook…). “Run now” starts a run immediately, without waiting for the trigger.',
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
        const res = await protocolApi.listProtocols({ project_id: activeProjectId, status: statusParam, limit: 100, offset: 0 })
        setProtocols(res.items)
      } else {
        // Workspace mode: fetch every project in parallel, merge, dedupe
        const results = await Promise.all(
          projects.map((p) =>
            protocolApi
              .listProtocols({ project_id: p.id, status: statusParam, limit: 100, offset: 0 })
              .catch(() => ({ items: [] as Protocol[], total: 0 })),
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
    const pristine = protocols.length === 0 && statusFilter === 'all'
    content = (
      <EmptyState
        title={pristine ? 'No protocols yet' : 'No matching protocols'}
        description={
          pristine
            ? 'Protocols are created by agents or through the MCP protocol tools. They will show up here.'
            : 'Try another search or clear the filters.'
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
      title="Protocols"
      description="State machines that drive automated workflows"
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
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] disabled:opacity-50 ${focusRing}`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
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
      leading={<StatusDot kind="protocol" status={status} label={getStatusMeta('protocol', status).label} />}
      description={protocol.description}
      trailing={<RelativeTime date={protocol.updated_at ?? protocol.created_at} />}
      meta={[
        protocol.protocol_category ? <span key="cat" className="text-gray-400">{protocol.protocol_category}</span> : null,
        auto ? (
          <span key="auto" className="inline-flex items-center gap-1">
            <auto.icon className="w-3 h-3" aria-hidden="true" />
            {auto.label}
          </span>
        ) : null,
        // State counts are only present when the API includes the FSM (detail payload)
        states ? pluralize(states, 'state') : null,
        transitions ? pluralize(transitions, 'transition') : null,
        hasMacro ? (
          <span key="macro" className="inline-flex items-center gap-1">
            <GitBranch className="w-3 h-3" aria-hidden="true" />
            sub-protocols
          </span>
        ) : null,
        tags.length > 0 ? (
          <span key="tags" className="break-words">
            {tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
            {tags.length > 3 ? ` +${tags.length - 3}` : ''}
          </span>
        ) : null,
      ]}
    />
  )
}
