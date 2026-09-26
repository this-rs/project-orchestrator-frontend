/**
 * TriggerDashboardPage — event triggers (event → protocol run) of the backend.
 *
 *   Event triggers 12                              (PageShell, wide)
 *   [search] [filters ⚙: status · entity type] [↻]
 *   9 enabled · 3 disabled
 *   Enabled 9 ▸ trigger rows … / Disabled 3 ▸ …
 *
 * Each row: name, enabled/disabled dot, the event pattern it listens to
 * (entity · action), cooldown, payload conditions, project scope, and the
 * protocol it starts (link). ⋯ menu: Enable / Disable, Delete (confirm).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Trash2, Workflow, Zap, ZapOff } from 'lucide-react'
import { triggersApi } from '@/services/triggers'
import type { EventTrigger, TriggerStats } from '@/services/triggers'
import { protocolApi } from '@/services'
import type { Protocol } from '@/types/protocol'
import {
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FilterBar,
  ListGroup,
  MetaLine,
  PageShell,
  RelativeTime,
  Select,
  StatusDot,
  focusRing,
  groupBy,
  inlineLink,
  pluralize,
  rowInteractive,
  Button,
} from '@/components/ui'
import { Explainer } from '@/components/protocols/Explainer'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'enabled' | 'disabled'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const GROUP_ORDER = ['enabled', 'disabled'] as const
type GroupKey = (typeof GROUP_ORDER)[number]

function patternLabel(pattern: string | null): string {
  return pattern && pattern !== '*' ? pattern : 'any'
}

function matches(t: EventTrigger, protocolName: string | undefined, q: string): boolean {
  if (!q) return true
  return (
    t.name.toLowerCase().includes(q) ||
    (protocolName ?? '').toLowerCase().includes(q) ||
    (t.entity_type_pattern ?? '').toLowerCase().includes(q) ||
    (t.action_pattern ?? '').toLowerCase().includes(q)
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TriggerDashboardPage() {
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()

  const [triggers, setTriggers] = useState<EventTrigger[]>([])
  const [stats, setStats] = useState<TriggerStats | null>(null)
  const [protocols, setProtocols] = useState<Map<string, Protocol>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, triggerStats] = await Promise.all([triggersApi.list(), triggersApi.stats()])
      // The API may return duplicates (global + project scopes)
      const seen = new Set<string>()
      const deduped = list.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
      setTriggers(deduped)
      setStats(triggerStats)

      const ids = [...new Set(deduped.map((t) => t.protocol_id))]
      const map = new Map<string, Protocol>()
      await Promise.all(
        ids.map(async (pid) => {
          try {
            map.set(pid, await protocolApi.getProtocol(pid))
          } catch {
            // protocol may have been deleted — the row shows the short id
          }
        }),
      )
      setProtocols(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load triggers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Actions ──────────────────────────────────────────────────────────
  const handleToggle = async (trigger: EventTrigger) => {
    setBusyId(trigger.id)
    try {
      if (trigger.enabled) await triggersApi.disable(trigger.id)
      else await triggersApi.enable(trigger.id)
      setTriggers((prev) => prev.map((t) => (t.id === trigger.id ? { ...t, enabled: !t.enabled } : t)))
      setStats((prev) =>
        prev
          ? { ...prev, enabled: prev.enabled + (trigger.enabled ? -1 : 1), disabled: prev.disabled + (trigger.enabled ? 1 : -1) }
          : prev,
      )
      toast.success(trigger.enabled ? `Trigger “${trigger.name}” disabled` : `Trigger “${trigger.name}” enabled`)
    } catch {
      toast.error('Failed to update the trigger')
      fetchData()
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (trigger: EventTrigger) => {
    try {
      await triggersApi.delete(trigger.id)
      setTriggers((prev) => prev.filter((t) => t.id !== trigger.id))
      setStats((prev) =>
        prev
          ? {
              ...prev,
              total: prev.total - 1,
              enabled: prev.enabled - (trigger.enabled ? 1 : 0),
              disabled: prev.disabled - (trigger.enabled ? 0 : 1),
            }
          : prev,
      )
      toast.success('Trigger deleted')
    } catch {
      toast.error('Failed to delete the trigger')
    }
  }

  // ── Filters ──────────────────────────────────────────────────────────
  const entityOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of triggers) {
      const k = t.entity_type_pattern || '*'
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    // stats.by_entity_type may know types the (deduped) list does not
    for (const e of stats?.by_entity_type ?? []) if (!counts.has(e.entity_type)) counts.set(e.entity_type, e.count)
    return [
      { value: 'all', label: 'All entity types' },
      ...[...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, n]) => ({ value: k, label: `${patternLabel(k) === 'any' ? 'Any entity' : k} (${n})` })),
    ]
  }, [triggers, stats])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return triggers.filter((t) => {
      if (statusFilter === 'enabled' && !t.enabled) return false
      if (statusFilter === 'disabled' && t.enabled) return false
      if (entityFilter !== 'all' && (t.entity_type_pattern || '*') !== entityFilter) return false
      return matches(t, protocols.get(t.protocol_id)?.name, q)
    })
  }, [triggers, statusFilter, entityFilter, search, protocols])

  const groups = useMemo(() => groupBy(visible, (t): GroupKey => (t.enabled ? 'enabled' : 'disabled'), GROUP_ORDER), [visible])

  const activeCount = (statusFilter !== 'all' ? 1 : 0) + (entityFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    statusFilter !== 'all' ? STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? '' : '',
    entityFilter !== 'all' ? entityOptions.find((o) => o.value === entityFilter)?.label ?? '' : '',
  ]
  const clearFilters = () => {
    setStatusFilter('all')
    setEntityFilter('all')
  }
  const pristine = triggers.length === 0

  return (
    <PageShell
      title="Event triggers"
      description="Persistent event → protocol rules — automatic FSM activation"
      count={loading ? undefined : visible.length}
      width="wide"
      filters={
        <div className="space-y-3">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search triggers…"
            activeCount={activeCount}
            activeLabels={activeLabels}
            onClear={clearFilters}
            filters={
              <>
                <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)} />
                <Select options={entityOptions} value={entityFilter} onChange={setEntityFilter} />
              </>
            }
            trailing={
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                aria-label="Refresh"
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] disabled:opacity-50 ${focusRing}`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            }
          />
          <Explainer>
            A trigger listens to an event of the knowledge graph (an entity type and an action) and starts a protocol run
            when it happens. Enable or disable a trigger from its ⋯ menu.
          </Explainer>
        </div>
      }
    >
      {error ? (
        <ErrorState title="Failed to load triggers" description={error} onRetry={fetchData} />
      ) : loading ? (
        <EntityListSkeleton rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={pristine ? 'No triggers yet' : 'No matching triggers'}
          description={
            pristine
              ? 'Triggers are created through the MCP tools or the backend API. They will show up here.'
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
      ) : (
        <div className="space-y-2">
          {stats && (
            <MetaLine
              className="px-1"
              items={[
                <span key="on" className="text-emerald-400">{stats.enabled} enabled</span>,
                <span key="off">{stats.disabled} disabled</span>,
                stats.by_entity_type.length > 0 ? pluralize(stats.by_entity_type.length, 'entity type') : null,
              ]}
            />
          )}
          <div>
            {groups.map(({ key, items }) => (
              <ListGroup
                key={key}
                title={key === 'enabled' ? 'Enabled' : 'Disabled'}
                count={items.length}
                collapsible={key === 'disabled'}
              >
                {items.map((trigger) => (
                  <TriggerRow
                    key={trigger.id}
                    trigger={trigger}
                    protocol={protocols.get(trigger.protocol_id)}
                    protocolHref={workspacePath(wsSlug, `/protocols/${trigger.protocol_id}`)}
                    busy={busyId === trigger.id}
                    onToggle={() => handleToggle(trigger)}
                    onDelete={() => handleDelete(trigger)}
                  />
                ))}
              </ListGroup>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Trigger row
// ---------------------------------------------------------------------------

interface TriggerRowProps {
  trigger: EventTrigger
  protocol?: Protocol
  protocolHref: string
  busy: boolean
  onToggle: () => Promise<void>
  onDelete: () => Promise<void>
}

function TriggerRow({ trigger, protocol, protocolHref, busy, onToggle, onDelete }: TriggerRowProps) {
  const conditions = trigger.payload_conditions ? Object.keys(trigger.payload_conditions).length : 0
  return (
    <EntityRow
      title={trigger.name}
      muted={!trigger.enabled}
      leading={<StatusDot tone={trigger.enabled ? 'success' : 'muted'} label={trigger.enabled ? 'Enabled' : 'Disabled'} />}
      trailing={<RelativeTime date={trigger.updated_at} />}
      meta={[
        <span key="s" className={trigger.enabled ? 'text-emerald-400' : 'text-gray-500'}>{trigger.enabled ? 'Enabled' : 'Disabled'}</span>,
        <span key="on" className="break-words">
          on <span className="text-gray-300">{patternLabel(trigger.entity_type_pattern)}</span>
          {' · '}
          <span className="font-mono text-gray-300">{patternLabel(trigger.action_pattern)}</span>
        </span>,
        trigger.project_scope ? <span key="scope" className="break-all">scope {trigger.project_scope}</span> : null,
        trigger.cooldown_secs > 0 ? `${trigger.cooldown_secs}s cooldown` : null,
        conditions > 0 ? pluralize(conditions, 'condition') : null,
      ]}
      context={
        <Link to={protocolHref} className={`${rowInteractive} ${inlineLink} inline-flex items-center gap-1 text-[11px] leading-4 min-w-0 max-w-full`}>
          <Workflow className="w-3 h-3 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="text-gray-500">Starts</span>{' '}
          <span className="truncate">{protocol?.name ?? `protocol ${trigger.protocol_id.slice(0, 8)}…`}</span>
        </Link>
      }
      actions={[
        {
          label: trigger.enabled ? 'Disable' : 'Enable',
          icon: trigger.enabled ? ZapOff : Zap,
          disabled: busy,
          onClick: onToggle,
        },
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: 'Delete trigger?',
            description: `“${trigger.name}” will stop starting its protocol. This cannot be undone.`,
            confirmLabel: 'Delete',
          },
        },
      ]}
    />
  )
}
