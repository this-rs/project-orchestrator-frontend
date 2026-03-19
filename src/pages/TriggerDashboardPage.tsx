/**
 * TriggerDashboardPage — real-time view of EventTriggers.
 *
 * Features:
 *   - Stats cards (total, enabled, disabled, by entity type)
 *   - Filterable list of triggers with enable/disable toggle
 *   - Create trigger dialog
 *   - Delete trigger with confirmation
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RefreshCw,
  Zap,
  ZapOff,
  Trash2,
  Shield,
  Clock,
  Activity,
  Target,
  Filter,
} from 'lucide-react'

import { triggersApi } from '@/services/triggers'
import type { EventTrigger, TriggerStats } from '@/services/triggers'
import { protocolApi } from '@/services'
import type { Protocol } from '@/types/protocol'
import {
  PageShell,
  Button,
  Badge,
  Card,
  CardContent,
  StatCard,
  SkeletonCard,
  ErrorState,
  EmptyState,
  ConfirmDialog,
} from '@/components/ui'
// ---------------------------------------------------------------------------
// Status badge for triggers
// ---------------------------------------------------------------------------

function TriggerStatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge variant="success">Enabled</Badge>
  ) : (
    <Badge variant="default">Disabled</Badge>
  )
}

function EntityTypeBadge({ pattern }: { pattern: string | null }) {
  const label = pattern || '*'
  const colors: Record<string, string> = {
    Project: 'bg-blue-900/50 text-blue-400',
    Plan: 'bg-purple-900/50 text-purple-400',
    Task: 'bg-indigo-900/50 text-indigo-400',
    Note: 'bg-yellow-900/50 text-yellow-400',
    Commit: 'bg-green-900/50 text-green-400',
    Skill: 'bg-pink-900/50 text-pink-400',
    ProtocolRun: 'bg-orange-900/50 text-orange-400',
    '*': 'bg-gray-800/50 text-gray-400',
  }
  const cls = colors[label] || colors['*']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function ActionBadge({ pattern }: { pattern: string | null }) {
  const label = pattern || '*'
  const colors: Record<string, string> = {
    Created: 'text-green-400',
    Updated: 'text-blue-400',
    Deleted: 'text-red-400',
    StatusChanged: 'text-yellow-400',
    Synced: 'text-purple-400',
    '*': 'text-gray-400',
  }
  const cls = colors[label] || colors['*']
  return (
    <span className={`text-xs font-mono ${cls}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'enabled' | 'disabled'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TriggerDashboardPage() {
  const [triggers, setTriggers] = useState<EventTrigger[]>([])
  const [stats, setStats] = useState<TriggerStats | null>(null)
  const [protocols, setProtocols] = useState<Map<string, Protocol>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState<EventTrigger | null>(null)

  // Toggle state (track which trigger is being toggled)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [triggerList, triggerStats] = await Promise.all([
        triggersApi.list(),
        triggersApi.stats(),
      ])
      // Deduplicate by id (API may return duplicates from global + project scopes)
      const seen = new Set<string>()
      const dedupedTriggers = triggerList.filter(t => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
      setTriggers(dedupedTriggers)
      setStats(triggerStats)

      // Fetch protocol names for display
      const uniqueProtocolIds = [...new Set(triggerList.map(t => t.protocol_id))]
      const protocolMap = new Map<string, Protocol>()
      await Promise.all(
        uniqueProtocolIds.map(async (pid) => {
          try {
            const p = await protocolApi.getProtocol(pid)
            protocolMap.set(pid, p)
          } catch {
            // Protocol may not exist — skip
          }
        })
      )
      setProtocols(protocolMap)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load triggers')
    } finally {
      setLoading(false)
    }
  }, [refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Actions ──────────────────────────────────────────────────────────

  const handleRefresh = () => setRefreshKey(k => k + 1)

  const handleToggle = async (trigger: EventTrigger) => {
    setTogglingId(trigger.id)
    try {
      if (trigger.enabled) {
        await triggersApi.disable(trigger.id)
      } else {
        await triggersApi.enable(trigger.id)
      }
      // Update local state optimistically
      setTriggers(prev =>
        prev.map(t =>
          t.id === trigger.id ? { ...t, enabled: !t.enabled } : t
        )
      )
      // Update stats
      setStats(prev =>
        prev
          ? {
              ...prev,
              enabled: prev.enabled + (trigger.enabled ? -1 : 1),
              disabled: prev.disabled + (trigger.enabled ? 1 : -1),
            }
          : prev
      )
    } catch {
      // Revert on error by refetching
      handleRefresh()
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await triggersApi.delete(deleteTarget.id)
    setTriggers(prev => prev.filter(t => t.id !== deleteTarget.id))
    setStats(prev =>
      prev
        ? {
            ...prev,
            total: prev.total - 1,
            enabled: prev.enabled - (deleteTarget.enabled ? 1 : 0),
            disabled: prev.disabled - (deleteTarget.enabled ? 0 : 1),
          }
        : prev
    )
    setDeleteTarget(null)
  }

  // ── Filtered triggers ────────────────────────────────────────────────
  const filteredTriggers = useMemo(() => {
    if (statusFilter === 'all') return triggers
    return triggers.filter(t =>
      statusFilter === 'enabled' ? t.enabled : !t.enabled
    )
  }, [triggers, statusFilter])

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <PageShell
      title="Event Triggers"
      description="Persistent event-to-protocol triggers — automatic FSM activation"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      }
    >
      {/* Stats cards */}
      {stats && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Target className="w-5 h-5" />}
            label="Total Triggers"
            value={stats.total}
            accent="border-indigo-500"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="Enabled"
            value={stats.enabled}
            accent="border-green-500"
          />
          <StatCard
            icon={<ZapOff className="w-5 h-5" />}
            label="Disabled"
            value={stats.disabled}
            accent="border-gray-500"
          />
          <StatCard
            icon={<Filter className="w-5 h-5" />}
            label="Entity Types"
            value={stats.by_entity_type.length}
            accent="border-purple-500"
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06]">
        {(['all', 'enabled', 'disabled'] as StatusFilter[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 cursor-pointer ${
              statusFilter === tab
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'enabled' ? 'Enabled' : 'Disabled'}
            {tab === 'all' && stats ? ` (${stats.total})` : ''}
            {tab === 'enabled' && stats ? ` (${stats.enabled})` : ''}
            {tab === 'disabled' && stats ? ` (${stats.disabled})` : ''}
          </button>
        ))}
      </div>

      {/* Content */}
      {error ? (
        <ErrorState title="Failed to load triggers" description={error} onRetry={handleRefresh} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : filteredTriggers.length === 0 ? (
        <EmptyState
          title="No triggers found"
          description={
            statusFilter === 'all'
              ? 'No event triggers have been created yet. Triggers are created via the MCP tools or backend API.'
              : `No ${statusFilter} triggers.`
          }
          action={
            statusFilter !== 'all' ? (
              <Button variant="secondary" onClick={() => setStatusFilter('all')}>
                Clear filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredTriggers.map((trigger) => {
            const protocol = protocols.get(trigger.protocol_id)
            const isToggling = togglingId === trigger.id

            return (
              <Card key={trigger.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: trigger info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Zap className={`w-4 h-4 flex-shrink-0 ${trigger.enabled ? 'text-yellow-400' : 'text-gray-600'}`} />
                        <h3 className="text-sm font-semibold text-gray-100 truncate">
                          {trigger.name}
                        </h3>
                        <TriggerStatusBadge enabled={trigger.enabled} />
                      </div>

                      {/* Pattern info */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 ml-6">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500">Entity:</span>
                          <EntityTypeBadge pattern={trigger.entity_type_pattern} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500">Action:</span>
                          <ActionBadge pattern={trigger.action_pattern} />
                        </div>
                        {trigger.cooldown_secs > 0 && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-500" />
                            <span>{trigger.cooldown_secs}s cooldown</span>
                          </div>
                        )}
                        {trigger.payload_conditions && (
                          <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3 text-gray-500" />
                            <span className="font-mono text-gray-500">
                              {Object.keys(trigger.payload_conditions).length} condition{Object.keys(trigger.payload_conditions).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Protocol target */}
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2 ml-6">
                        <Activity className="w-3 h-3" />
                        <span>Protocol:</span>
                        <span className="text-indigo-400 font-medium">
                          {protocol?.name ?? trigger.protocol_id.slice(0, 8) + '...'}
                        </span>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggle(trigger)}
                        disabled={isToggling}
                        className={`p-2 rounded-lg transition-colors cursor-pointer ${
                          trigger.enabled
                            ? 'hover:bg-yellow-500/10 text-yellow-400'
                            : 'hover:bg-green-500/10 text-green-400'
                        } ${isToggling ? 'opacity-50' : ''}`}
                        title={trigger.enabled ? 'Disable trigger' : 'Enable trigger'}
                      >
                        {trigger.enabled ? (
                          <ZapOff className="w-4 h-4" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(trigger)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                        title="Delete trigger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Entity type breakdown (if stats available) */}
      {stats && stats.by_entity_type.length > 0 && !loading && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Triggers by Entity Type</h2>
          <div className="flex flex-wrap gap-3">
            {stats.by_entity_type.map((entry) => (
              <div
                key={entry.entity_type}
                className="glass rounded-lg px-4 py-3 flex items-center gap-3"
              >
                <EntityTypeBadge pattern={entry.entity_type} />
                <span className="text-lg font-bold text-gray-100">{entry.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Trigger"
        description={`Are you sure you want to delete the trigger "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </PageShell>
  )
}
