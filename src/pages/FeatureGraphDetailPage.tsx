import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  LoadingPage,
  ErrorState,
  Badge,
  ConfirmDialog,
  PageHeader,
} from '@/components/ui'
import { featureGraphsApi } from '@/services'
import { useConfirmDialog, useToast } from '@/hooks'
import type { FeatureGraphDetail, FeatureGraphEntity } from '@/types'

// ============================================================================
// ROLE CONFIG
// ============================================================================

const ROLE_ORDER = [
  'entry_point',
  'core_logic',
  'data_model',
  'trait_contract',
  'api_surface',
  'support',
] as const

const roleConfig: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  entry_point: {
    label: 'Entry Points',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
  },
  core_logic: {
    label: 'Core Logic',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  data_model: {
    label: 'Data Models',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  trait_contract: {
    label: 'Trait Contracts',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  api_surface: {
    label: 'API Surface',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  support: {
    label: 'Support',
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/20',
  },
}

const defaultRoleConfig = {
  label: 'Other',
  color: 'text-gray-500',
  bg: 'bg-gray-500/10',
  border: 'border-gray-500/20',
}

// ============================================================================
// ENTITY TYPE ICONS
// ============================================================================

function EntityIcon({ type }: { type: string }) {
  const iconClass = 'w-4 h-4 shrink-0'
  switch (type) {
    case 'function':
      return (
        <svg className={`${iconClass} text-yellow-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      )
    case 'file':
      return (
        <svg className={`${iconClass} text-gray-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      )
    case 'struct':
    case 'enum':
      return (
        <svg className={`${iconClass} text-emerald-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      )
    case 'trait':
      return (
        <svg className={`${iconClass} text-purple-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      )
    default:
      return (
        <svg className={`${iconClass} text-gray-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
        </svg>
      )
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FeatureGraphDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const [detail, setDetail] = useState<FeatureGraphDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    if (!id) return
    setError(null)
    setLoading(true)
    try {
      const data = await featureGraphsApi.get(id)
      setDetail(data)
    } catch (error) {
      console.error('Failed to fetch feature graph:', error)
      setError('Failed to load feature graph')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [id])

  // Group entities by role
  const groupedEntities = useMemo(() => {
    if (!detail?.entities) return new Map<string, FeatureGraphEntity[]>()
    const groups = new Map<string, FeatureGraphEntity[]>()
    for (const entity of detail.entities) {
      const role = entity.role || 'unknown'
      const group = groups.get(role) || []
      group.push(entity)
      groups.set(role, group)
    }
    return groups
  }, [detail])

  // Ordered roles: defined order first, then any unknown roles
  const orderedRoles = useMemo(() => {
    const roles: string[] = []
    for (const role of ROLE_ORDER) {
      if (groupedEntities.has(role)) roles.push(role)
    }
    for (const role of groupedEntities.keys()) {
      if (!roles.includes(role)) roles.push(role)
    }
    return roles
  }, [groupedEntities])

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !detail) return <LoadingPage />

  const totalEntities = detail.entities.length

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={detail.name}
        description={detail.description}
        overflowActions={[
          {
            label: 'Delete',
            variant: 'danger',
            onClick: () =>
              confirmDialog.open({
                title: 'Delete Feature Graph',
                description: `Delete "${detail.name}"? This will remove the feature graph and all its entity associations. This cannot be undone.`,
                onConfirm: async () => {
                  await featureGraphsApi.delete(detail.id)
                  toast.success('Feature graph deleted')
                  navigate(-1)
                },
              }),
          },
        ]}
      />

      {/* Stats overview */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06]">
              <span className="text-2xl font-bold text-gray-200">{totalEntities}</span>
              <span className="text-xs text-gray-500">Total entities</span>
            </div>
            {orderedRoles.map((role) => {
              const config = roleConfig[role] || defaultRoleConfig
              const count = groupedEntities.get(role)?.length || 0
              return (
                <div
                  key={role}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bg} border ${config.border}`}
                >
                  <span className={`text-lg font-bold ${config.color}`}>{count}</span>
                  <span className="text-xs text-gray-400">{config.label}</span>
                </div>
              )
            })}
          </div>
          {detail.entry_function && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <span>Built from</span>
              <code className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-xs">
                {detail.entry_function}
              </code>
              {detail.build_depth != null && (
                <span>depth {detail.build_depth}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entities grouped by role */}
      {orderedRoles.map((role) => {
        const config = roleConfig[role] || defaultRoleConfig
        const entities = groupedEntities.get(role) || []
        return (
          <Card key={role}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className={config.color}>{config.label}</CardTitle>
                <Badge variant="default">{entities.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {entities.map((entity, idx) => (
                  <div
                    key={`${entity.entity_type}-${entity.entity_id}-${idx}`}
                    className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/[0.04] transition-colors"
                  >
                    <EntityIcon type={entity.entity_type} />
                    <span className="text-sm text-gray-200 font-mono truncate min-w-0 flex-1">
                      {entity.name || entity.entity_id}
                    </span>
                    <Badge variant="default" className="shrink-0 text-[10px]">
                      {entity.entity_type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {totalEntities === 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-gray-500 text-sm text-center py-8">
              No entities in this feature graph
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
