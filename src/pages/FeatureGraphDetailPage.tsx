import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Zap, File, Database, Link as LinkIcon, Package } from 'lucide-react'
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
      return <Zap className={`${iconClass} text-yellow-400`} />
    case 'file':
      return <File className={`${iconClass} text-gray-400`} />
    case 'struct':
    case 'enum':
      return <Database className={`${iconClass} text-emerald-400`} />
    case 'trait':
      return <LinkIcon className={`${iconClass} text-purple-400`} />
    default:
      return <Package className={`${iconClass} text-gray-500`} />
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
