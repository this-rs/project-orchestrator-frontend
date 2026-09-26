/**
 * RfcDashboardPage — RFC documents of the workspace (or one project).
 *
 * Search (title / preview) + filters (project, lifecycle state), grouped by
 * lifecycle state. Each row exposes the lifecycle transitions available from
 * its current state in the ⋯ menu (reject / supersede ask for confirmation).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Folder, RefreshCw } from 'lucide-react'
import { rfcApi } from '@/services/rfcApi'
import { workspacesApi } from '@/services'
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
  StatusText,
  focusRing,
  getStatusMeta,
  getStatusOptions,
  groupBy,
  pluralize,
  type OverflowMenuAction,
} from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { Explainer } from './Explainer'
import {
  RFC_STATUS_ORDER,
  apiErrorMessage,
  formatTrigger,
  isDestructiveTrigger,
  rfcPreview,
  rfcState,
  rfcTransitions,
  transitionConfirm,
  triggerIcon,
} from './rfcLifecycle'
import type { Rfc, RfcStatus } from '@/types/protocol'

interface RfcDashboardPageProps {
  /** Callback when an RFC is activated (default: navigate to its page) */
  onRfcClick?: (rfcId: string) => void
  className?: string
}

const CLOSED: RfcStatus[] = ['implemented', 'rejected', 'superseded']

export function RfcDashboardPage({ onRfcClick, className = '' }: RfcDashboardPageProps) {
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()

  // ── Project selector ───────────────────────────────────────────────
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  const [projectFilter, setProjectFilter] = useState<string>('all')

  useEffect(() => {
    if (!wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then(setProjects)
      .catch(() => {})
  }, [wsSlug])

  const activeProjectId = projectFilter !== 'all' ? projectFilter : undefined

  const [rfcs, setRfcs] = useState<Rfc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<RfcStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  // When "All projects" is selected, omit project_id to get every RFC
  const fetchRfcs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await rfcApi.list({ limit: 200, project_id: activeProjectId })
      setRfcs(response.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RFCs')
    } finally {
      setLoading(false)
    }
  }, [activeProjectId])

  useEffect(() => {
    fetchRfcs()
  }, [fetchRfcs])

  // Count by state (for the filter labels)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const rfc of rfcs) {
      const s = rfcState(rfc)
      counts[s] = (counts[s] ?? 0) + 1
    }
    return counts
  }, [rfcs])

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: `All states (${rfcs.length})` },
      ...getStatusOptions('rfc').map((o) => ({ value: o.value, label: `${o.label} (${statusCounts[o.value] ?? 0})` })),
    ],
    [rfcs.length, statusCounts],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rfcs.filter((rfc) => {
      if (statusFilter !== 'all' && rfcState(rfc) !== statusFilter) return false
      if (!q) return true
      return (
        rfc.title.toLowerCase().includes(q) ||
        rfc.tags.some((t) => t.toLowerCase().includes(q)) ||
        rfc.sections.some((s) => s.content.toLowerCase().includes(q))
      )
    })
  }, [rfcs, statusFilter, search])

  const groups = useMemo(() => groupBy(filtered, rfcState, RFC_STATUS_ORDER), [filtered])

  // Fire a lifecycle transition from a row
  const handleAction = useCallback(
    async (rfc: Rfc, trigger: string) => {
      try {
        const updated = await rfcApi.transition(rfc.id, trigger)
        setRfcs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
        toast.success(`${formatTrigger(trigger)}: ${getStatusMeta('rfc', rfcState(updated)).label}`)
      } catch (err) {
        toast.error(apiErrorMessage(err, `Failed to ${formatTrigger(trigger).toLowerCase()} the RFC`))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
    [],
  )

  // ── Filters ────────────────────────────────────────────────────────
  const showProjectFilter = projects.length > 1
  const activeCount = (activeProjectId ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    activeProjectId ? projects.find((p) => p.id === activeProjectId)?.name ?? '' : '',
    statusFilter !== 'all' ? getStatusMeta('rfc', statusFilter).label : '',
  ]
  const clearFilters = () => {
    setProjectFilter('all')
    setStatusFilter('all')
  }
  const pristine = rfcs.length === 0

  return (
    <div className={className}>
      <PageShell
        title="RFCs"
        description="Requests for comments — proposals and their lifecycle"
        count={loading ? undefined : filtered.length}
        width="wide"
        filters={
          <div className="space-y-3">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search RFCs…"
              activeCount={activeCount}
              activeLabels={activeLabels}
              onClear={clearFilters}
              filters={
                <>
                  {showProjectFilter && (
                    <Select
                      options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                      value={projectFilter}
                      onChange={setProjectFilter}
                      icon={<Folder className="w-3 h-3" />}
                    />
                  )}
                  <Select
                    options={statusOptions}
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as RfcStatus | 'all')}
                  />
                </>
              }
              trailing={
                <button
                  type="button"
                  onClick={fetchRfcs}
                  disabled={loading}
                  aria-label="Refresh"
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] disabled:opacity-50 ${focusRing}`}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
              }
            />
            <Explainer>
              An RFC is a change proposal open for discussion. It follows a lifecycle: draft → proposed → under review →
              accepted → planning → in progress → implemented (or rejected / superseded). The next possible steps are in
              each RFC's ⋯ menu.
            </Explainer>
          </div>
        }
      >
        {loading && rfcs.length === 0 ? (
          <EntityListSkeleton rows={6} />
        ) : error ? (
          <ErrorState title="Failed to load RFCs" description={error} onRetry={fetchRfcs} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={pristine ? 'No RFCs yet' : 'No matching RFCs'}
            description={
              pristine
                ? 'RFCs are written by agents (or through the MCP note tools) to propose significant changes.'
                : 'Try another search or clear the filters.'
            }
          />
        ) : (
          <div>
            {groups.map(({ key, items }) => (
              <ListGroup
                key={key}
                title={getStatusMeta('rfc', key).label}
                count={items.length}
                collapsible={CLOSED.includes(key)}
                defaultOpen={!CLOSED.includes(key) || groups.length === 1}
              >
                {items.map((rfc) => (
                  <RfcRow
                    key={rfc.id}
                    rfc={rfc}
                    href={onRfcClick ? undefined : workspacePath(wsSlug, `/rfcs/${rfc.id}`)}
                    onClick={onRfcClick ? () => onRfcClick(rfc.id) : undefined}
                    onAction={(trigger) => handleAction(rfc, trigger)}
                  />
                ))}
              </ListGroup>
            ))}
          </div>
        )}
      </PageShell>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RFC row
// ---------------------------------------------------------------------------

interface RfcRowProps {
  rfc: Rfc
  href?: string
  onClick?: () => void
  onAction: (trigger: string) => Promise<void>
}

function RfcRow({ rfc, href, onClick, onAction }: RfcRowProps) {
  const state = rfcState(rfc)
  const actions: OverflowMenuAction[] = rfcTransitions(rfc).map((t) => {
    const destructive = isDestructiveTrigger(t.trigger)
    return {
      label: `${formatTrigger(t.trigger)} → ${getStatusMeta('rfc', t.target_state).label}`,
      icon: triggerIcon(t.trigger),
      variant: destructive ? 'danger' : 'default',
      onClick: () => onAction(t.trigger),
      confirm: destructive ? transitionConfirm(t.trigger, rfc.title) : undefined,
    }
  })
  const tags = rfc.tags.filter((t) => !t.startsWith('rfc-'))
  return (
    <EntityRow
      title={rfc.title}
      href={href}
      onClick={onClick}
      muted={state === 'rejected' || state === 'superseded'}
      description={rfcPreview(rfc)}
      trailing={<RelativeTime date={rfc.created_at} />}
      meta={[
        <StatusText key="s" kind="rfc" status={state} />,
        rfc.importance === 'high' || rfc.importance === 'critical' ? (
          <StatusText key="i" kind="importance" status={rfc.importance} dot={false} label={`${getStatusMeta('importance', rfc.importance).label} importance`} />
        ) : null,
        rfc.sections.length > 1 ? pluralize(rfc.sections.length, 'section') : null,
        tags.length > 0 ? <span key="t">{tags.slice(0, 2).map((t) => `#${t}`).join(' ')}{tags.length > 2 ? ` +${tags.length - 2}` : ''}</span> : null,
      ]}
      actions={actions.length > 0 ? actions : undefined}
    />
  )
}
