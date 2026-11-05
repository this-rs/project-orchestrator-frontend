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
  Button,
} from '@/components/ui'
import { iconButton } from '@/components/ui/classes'
import { useWorkspaceSlug } from '@/hooks'
import { activeTranslator, useT } from '@/i18n'
import { workspacePath } from '@/utils/paths'
import type { Protocol, ProtocolStatus } from '@/types/protocol'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { fetchAllPages } from '@/services/paginate'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type View = 'protocols' | 'runs' | 'scheduled'

const STATUS_ORDER: ProtocolStatus[] = ['active', 'draft', 'archived']

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
  const { t } = useT()
  const statusOptions = [{ value: 'all', label: t('siteKnowledge.shared.allStatuses') }, ...getStatusOptions('protocol')]
  const EXPLAIN: Record<View, string> = {
    protocols: t('siteKnowledge.protocols.explainProtocols'),
    runs: t('siteKnowledge.protocols.explainRuns'),
    scheduled: t('siteKnowledge.protocols.explainScheduled'),
  }

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
      setError(err instanceof Error ? err.message : activeTranslator().t('siteKnowledge.protocols.loadFailed'))
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
    content = <EmptyState title={t('siteKnowledge.protocols.noProjects')} description={t('siteKnowledge.protocols.noProjectsDescription')} />
  } else if (error) {
    content = <ErrorState title={t('siteKnowledge.protocols.loadFailed')} description={error} onRetry={handleRefresh} />
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
        title={pristine ? t('siteKnowledge.protocols.emptyTitle') : t('siteKnowledge.protocols.noMatchTitle')}
        description={
          pristine
            ? t('siteKnowledge.protocols.emptyDescription')
            : t('siteKnowledge.protocols.noMatchDescription')
        }
        action={
          pristine ? undefined : (
            <Button size="sm" variant="secondary" onClick={() => { clearFilters(); setSearch('') }}>
              {t('siteKnowledge.shared.clear')}
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
      description={t('siteKnowledge.protocols.description')}
      intro="protocols"
      count={loading || view !== 'protocols' ? undefined : visible.length}
      width="wide"
      filters={
        <div className="space-y-3">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('siteKnowledge.protocols.searchPlaceholder')}
            activeCount={activeFilterCount}
            activeLabels={activeLabels}
            onClear={clearFilters}
            filters={
              hasFilterControls ? (
                <>
                  {showProjectFilter && (
                    <Select
                      options={[{ value: 'all', label: t('siteKnowledge.shared.allProjects') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
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
                aria-label={t('siteKnowledge.shared.refresh')}
                className={`${iconButton('ghost', 'size-9 md:size-8')} text-gray-400`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
              </button>
            }
          />
          <ViewTabs
            label={t('siteKnowledge.protocols.viewsAria')}
            value={view}
            onChange={setView}
            tabs={[
              { id: 'protocols', label: t('siteKnowledge.protocols.tabProtocols') },
              { id: 'runs', label: t('siteKnowledge.protocols.tabRuns') },
              { id: 'scheduled', label: t('siteKnowledge.protocols.tabScheduled') },
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
  const { t } = useT()
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
          <Fact key="cat" icon={Shapes} title={t('siteKnowledge.protocols.category')}>
            {protocol.protocol_category}
          </Fact>
        ) : null,
        auto ? (
          <Fact key="auto" icon={auto.icon} title={t('siteKnowledge.protocols.trigger')}>
            {auto.label}
          </Fact>
        ) : null,
        // State counts are only present when the API includes the FSM (detail payload)
        states ? (states === 1 ? t('siteKnowledge.protocols.states.one', { n: 1 }) : t('siteKnowledge.protocols.states.other', { n: states })) : null,
        transitions
          ? transitions === 1
            ? t('siteKnowledge.protocols.transitions.one', { n: 1 })
            : t('siteKnowledge.protocols.transitions.other', { n: transitions })
          : null,
        hasMacro ? (
          <Fact key="macro" icon={GitBranch}>
            {t('siteKnowledge.protocols.subProtocols')}
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
