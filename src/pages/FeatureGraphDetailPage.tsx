import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import dagre from 'dagre'
import { motion, AnimatePresence } from 'motion/react'
import { Zap, File, Database, Link as LinkIcon, Package, FolderKanban, Plus, X, LayoutGrid, GitGraph as GitGraphIcon } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  LoadingPage,
  ErrorState,
  Badge,
  Button,
  Select,
  Input,
  ConfirmDialog,
  FormDialog,
  PageHeader,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { featureGraphsApi, projectsApi } from '@/services'
import { useConfirmDialog, useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { FeatureGraphDetail, FeatureGraphEntity, FeatureGraphRelation, FeatureGraphRole, Project } from '@/types'
import '@xyflow/react/dist/style.css'

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
// ENTITY TYPE COLORS (for graph nodes)
// ============================================================================

const entityTypeColors: Record<string, { bg: string; border: string; text: string; minimap: string }> = {
  function: { bg: '#052e16', border: '#22c55e', text: '#86efac', minimap: '#22c55e' },
  file: { bg: '#172554', border: '#3b82f6', text: '#93c5fd', minimap: '#3b82f6' },
  struct: { bg: '#2e1065', border: '#a855f7', text: '#d8b4fe', minimap: '#a855f7' },
  trait: { bg: '#431407', border: '#f97316', text: '#fdba74', minimap: '#f97316' },
  enum: { bg: '#022c22', border: '#10b981', text: '#6ee7b7', minimap: '#10b981' },
}

const relationColors: Record<string, { stroke: string; dashed: boolean; label: string }> = {
  CALLS: { stroke: '#6b7280', dashed: false, label: 'Calls' },
  IMPORTS: { stroke: '#60a5fa', dashed: true, label: 'Imports' },
  EXTENDS: { stroke: '#a855f7', dashed: false, label: 'Extends' },
  IMPLEMENTS: { stroke: '#f97316', dashed: false, label: 'Implements' },
  IMPLEMENTS_TRAIT: { stroke: '#f97316', dashed: false, label: 'Impl Trait' },
  IMPLEMENTS_FOR: { stroke: '#f59e0b', dashed: true, label: 'Impl For' },
}

const defaultRelationColor = { stroke: '#4b5563', dashed: false, label: 'Related' }

const defaultEntityColors = { bg: '#1f2937', border: '#6b7280', text: '#d1d5db', minimap: '#6b7280' }

// ============================================================================
// ENTITY TYPE ICONS
// ============================================================================

function EntityIcon({ type, className = 'w-4 h-4 shrink-0' }: { type: string; className?: string }) {
  switch (type) {
    case 'function':
      return <Zap className={`${className} text-green-400`} />
    case 'file':
      return <File className={`${className} text-blue-400`} />
    case 'struct':
    case 'enum':
      return <Database className={`${className} text-purple-400`} />
    case 'trait':
      return <LinkIcon className={`${className} text-orange-400`} />
    default:
      return <Package className={`${className} text-gray-500`} />
  }
}

// ============================================================================
// GRAPH NODE COMPONENT
// ============================================================================

interface EntityNodeData extends Record<string, unknown> {
  label: string
  entityType: string
  role: string
}

function EntityNodeComponent({ data }: NodeProps<Node<EntityNodeData>>) {
  const colors = entityTypeColors[data.entityType] || defaultEntityColors

  return (
    <div
      className="cursor-pointer transition-all duration-150 hover:scale-105 hover:shadow-lg"
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 160,
        maxWidth: 220,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 6, height: 6 }} />
      <div className="flex items-center gap-2">
        <EntityIcon type={data.entityType} className="w-3.5 h-3.5 shrink-0" />
        <span
          className="text-xs font-medium truncate"
          style={{ color: colors.text }}
          title={data.label}
        >
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 6, height: 6 }} />
    </div>
  )
}

const nodeTypes = { entityNode: EntityNodeComponent }

// ============================================================================
// DAGRE LAYOUT
// ============================================================================

function layoutEntities(
  entities: FeatureGraphEntity[],
  relations: FeatureGraphRelation[] = [],
): { nodes: Node<EntityNodeData>[]; edges: Edge[]; height: number } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 })

  const nodeWidth = 200
  const nodeHeight = 40

  // Build entity_id → node_id mapping (entity_id is the canonical identifier from backend)
  const entityIdToNodeId = new Map<string, string>()

  // Create nodes
  const rfNodes: Node<EntityNodeData>[] = entities.map((entity, idx) => {
    const nodeId = `${entity.entity_type}-${entity.entity_id}-${idx}`
    entityIdToNodeId.set(entity.entity_id, nodeId)
    g.setNode(nodeId, { width: nodeWidth, height: nodeHeight })
    return {
      id: nodeId,
      type: 'entityNode',
      position: { x: 0, y: 0 },
      data: {
        label: entity.name || entity.entity_id,
        entityType: entity.entity_type,
        role: entity.role || 'unknown',
      },
    }
  })

  // Create real edges from relations
  const rfEdges: Edge[] = []
  for (const rel of relations) {
    const sourceId = entityIdToNodeId.get(rel.source_id)
    const targetId = entityIdToNodeId.get(rel.target_id)
    if (!sourceId || !targetId) continue

    const color = relationColors[rel.relation_type] || defaultRelationColor
    g.setEdge(sourceId, targetId)
    rfEdges.push({
      id: `rel-${rel.source_id}-${rel.relation_type}-${rel.target_id}`,
      source: sourceId,
      target: targetId,
      style: {
        stroke: color.stroke,
        strokeWidth: 1.5,
        strokeDasharray: color.dashed ? '6 3' : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: color.stroke, width: 14, height: 14 },
      label: color.label,
      labelStyle: { fill: color.stroke, fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: '#111827', fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
    })
  }

  // If no real edges, add virtual tier edges so dagre still produces a nice hierarchical layout
  if (rfEdges.length === 0) {
    const roleGroups = new Map<string, string[]>()
    for (const entity of entities) {
      const role = entity.role || 'unknown'
      const nodeId = entityIdToNodeId.get(entity.entity_id)
      if (!nodeId) continue
      const group = roleGroups.get(role) || []
      group.push(nodeId)
      roleGroups.set(role, group)
    }

    const orderedRoles: string[] = []
    for (const role of ROLE_ORDER) {
      if (roleGroups.has(role)) orderedRoles.push(role)
    }
    for (const role of roleGroups.keys()) {
      if (!orderedRoles.includes(role)) orderedRoles.push(role)
    }

    let prevNodes: string[] = []
    for (const role of orderedRoles) {
      const current = roleGroups.get(role) || []
      if (prevNodes.length > 0 && current.length > 0) {
        g.setEdge(prevNodes[0], current[0])
        rfEdges.push({
          id: `virtual-${role}`,
          source: prevNodes[0],
          target: current[0],
          style: { stroke: 'transparent' },
          hidden: true,
        })
      }
      prevNodes = current
    }
  }

  dagre.layout(g)

  const layoutedNodes = rfNodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
    }
  })

  const maxY = layoutedNodes.reduce((max, n) => Math.max(max, n.position.y), 0)
  const height = Math.max(400, Math.min(700, maxY + 120))

  return { nodes: layoutedNodes, edges: rfEdges, height }
}

// ============================================================================
// LEGEND
// ============================================================================

function GraphLegend({ hasRelations }: { hasRelations: boolean }) {
  const types = [
    { label: 'File', color: '#3b82f6' },
    { label: 'Function', color: '#22c55e' },
    { label: 'Struct', color: '#a855f7' },
    { label: 'Trait', color: '#f97316' },
    { label: 'Enum', color: '#10b981' },
  ]

  const edges = [
    { label: 'Calls', color: '#6b7280', dashed: false },
    { label: 'Imports', color: '#60a5fa', dashed: true },
    { label: 'Extends', color: '#a855f7', dashed: false },
    { label: 'Implements', color: '#f97316', dashed: false },
  ]

  return (
    <div className="absolute top-3 right-3 z-10 glass-medium rounded-lg px-3 py-2.5 max-w-[260px]">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">Nodes</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
        {types.map((t) => (
          <div key={t.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: t.color }} />
            <span className="text-xs text-gray-400">{t.label}</span>
          </div>
        ))}
      </div>
      {hasRelations && (
        <>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">Edges</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {edges.map((e) => (
              <div key={e.label} className="flex items-center gap-1.5">
                <div className="w-4 h-0 border-t-[2px]" style={{ borderColor: e.color, borderStyle: e.dashed ? 'dashed' : 'solid' }} />
                <span className="text-xs text-gray-400">{e.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// SIDE PANEL
// ============================================================================

interface SidePanelProps {
  entity: FeatureGraphEntity | null
  onClose: () => void
}

function EntitySidePanel({ entity, onClose }: SidePanelProps) {
  if (!entity) return null
  const config = roleConfig[entity.role || ''] || defaultRoleConfig

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="absolute top-0 right-0 bottom-0 w-80 glass-medium border-l border-white/[0.06] z-20 overflow-y-auto"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-100">Entity Details</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/[0.08] text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Type */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Type</label>
            <div className="flex items-center gap-2">
              <EntityIcon type={entity.entity_type} />
              <span className="text-sm text-gray-200 capitalize">{entity.entity_type}</span>
            </div>
          </div>

          {/* Name / ID */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
              {entity.entity_type === 'file' ? 'Path' : 'Name'}
            </label>
            <code className="text-sm text-gray-200 font-mono break-all block bg-white/[0.04] px-2 py-1.5 rounded-md">
              {entity.entity_id}
            </code>
          </div>

          {/* Display Name (if different from entity_id) */}
          {entity.name && entity.name !== entity.entity_id && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Display Name</label>
              <span className="text-sm text-gray-200">{entity.name}</span>
            </div>
          )}

          {/* Role */}
          {entity.role && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Role</label>
              <Badge variant="default" className={config.color}>
                {config.label}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// ADD ENTITY FORM
// ============================================================================

function useAddEntityForm({ graphId, onSuccess }: { graphId: string; onSuccess: () => void }) {
  const [entityId, setEntityId] = useState('')
  const [entityType, setEntityType] = useState<string>('function')
  const [role, setRole] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToast()

  const typeOptions = [
    { value: 'function', label: 'Function' },
    { value: 'file', label: 'File' },
    { value: 'struct', label: 'Struct' },
    { value: 'trait', label: 'Trait' },
    { value: 'enum', label: 'Enum' },
  ]

  const roleOptions = [
    { value: '', label: 'Auto-detect' },
    { value: 'entry_point', label: 'Entry Point' },
    { value: 'core_logic', label: 'Core Logic' },
    { value: 'data_model', label: 'Data Model' },
    { value: 'trait_contract', label: 'Trait Contract' },
    { value: 'api_surface', label: 'API Surface' },
    { value: 'support', label: 'Support' },
  ]

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!entityId.trim()) errs.entity_id = 'Entity ID is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Select
          label="Entity Type"
          options={typeOptions}
          value={entityType}
          onChange={setEntityType}
        />
        <Input
          label={entityType === 'file' ? 'File Path' : 'Symbol Name'}
          placeholder={entityType === 'file' ? 'src/api/handlers.rs' : 'handle_request'}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          error={errors.entity_id}
          autoFocus
        />
        <Select
          label="Role"
          options={roleOptions}
          value={role}
          onChange={setRole}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return false
      await featureGraphsApi.addEntity(graphId, {
        entity_type: entityType as 'file' | 'function' | 'struct' | 'trait' | 'enum',
        entity_id: entityId.trim(),
        role: role ? (role as FeatureGraphRole) : undefined,
      })
      toast.success('Entity added')
      setEntityId('')
      setRole('')
      onSuccess()
    },
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface FGLocationState {
  projectId?: string
  projectSlug?: string
  projectName?: string
}

type ViewMode = 'list' | 'graph'

export function FeatureGraphDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const wsSlug = useWorkspaceSlug()
  const confirmDialog = useConfirmDialog()
  const addEntityDialog = useFormDialog()
  const toast = useToast()
  const [detail, setDetail] = useState<FeatureGraphDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [parentProject, setParentProject] = useState<Project | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [selectedEntity, setSelectedEntity] = useState<FeatureGraphEntity | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) return
    setError(null)
    setLoading(true)
    try {
      const data = await featureGraphsApi.get(id)
      setDetail(data)
    } catch (err) {
      console.error('Failed to fetch feature graph:', err)
      setError('Failed to load feature graph')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  // Resolve parent project
  useEffect(() => {
    if (!detail?.project_id) return
    const state = location.state as FGLocationState | null
    const controller = new AbortController()

    if (state?.projectSlug && state?.projectName) {
      setParentProject({ slug: state.projectSlug, name: state.projectName, id: state.projectId } as Project)
    } else {
      projectsApi.list().then((res) => {
        if (controller.signal.aborted) return
        const proj = (res.items || []).find((p) => p.id === detail.project_id) ?? null
        setParentProject(proj)
      }).catch(() => { /* graceful degradation */ })
    }

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.project_id])

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

  // Graph layout
  const { graphNodes, graphEdges, graphHeight } = useMemo(() => {
    if (!detail?.entities || detail.entities.length === 0) {
      return { graphNodes: [], graphEdges: [], graphHeight: 400 }
    }
    const { nodes, edges, height } = layoutEntities(detail.entities, detail.relations || [])
    return { graphNodes: nodes, graphEdges: edges, graphHeight: height }
  }, [detail])

  // Handle node click
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (!detail?.entities) return
    const nodeData = node.data as EntityNodeData
    const entity = detail.entities.find(
      (e) => (e.name || e.entity_id) === nodeData.label && e.entity_type === nodeData.entityType,
    )
    setSelectedEntity(entity || null)
  }, [detail])

  // Add entity form
  const addEntityForm = useAddEntityForm({
    graphId: id || '',
    onSuccess: () => {
      fetchData()
      setSelectedEntity(null)
    },
  })

  // MiniMap node color
  const minimapNodeColor = useCallback((node: Node) => {
    const data = node.data as EntityNodeData
    return (entityTypeColors[data.entityType] || defaultEntityColors).minimap
  }, [])

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !detail) return <LoadingPage />

  const totalEntities = detail.entities.length

  const parentLinks: ParentLink[] = [
    {
      icon: GitGraphIcon,
      label: 'Feature Graphs',
      name: 'Feature Graphs',
      href: workspacePath(wsSlug, '/feature-graphs'),
    },
  ]
  if (parentProject) {
    parentLinks.unshift({
      icon: FolderKanban,
      label: 'Project',
      name: parentProject.name,
      href: workspacePath(wsSlug, `/projects/${parentProject.slug}`),
    })
  }

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={detail.name}
        description={detail.description}
        parentLinks={parentLinks}
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
                  navigate(workspacePath(wsSlug, '/feature-graphs'))
                },
              }),
          },
        ]}
      />

      {/* Stats + actions bar */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addEntityDialog.open({ title: 'Add Entity', size: 'md' })}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Entity
              </Button>
              {/* View toggle */}
              <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
                <button
                  onClick={() => setViewMode('graph')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === 'graph'
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                  }`}
                  title="Graph view"
                >
                  <GitGraphIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                  }`}
                  title="List view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
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

      {/* Content area */}
      {viewMode === 'graph' ? (
        <Card>
          <CardContent className="p-0 relative">
            {graphNodes.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                No entities to visualize
              </div>
            ) : (
              <div style={{ height: graphHeight }} className="relative">
                <ReactFlow
                  nodes={graphNodes}
                  edges={graphEdges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  minZoom={0.2}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  nodesDraggable
                  nodesConnectable={false}
                  onNodeClick={onNodeClick}
                  panOnDrag
                  zoomOnScroll
                  zoomOnPinch
                >
                  <Background color="#374151" gap={20} size={1} />
                  <Controls showInteractive={false} className="dep-graph-controls" />
                  <MiniMap
                    nodeColor={minimapNodeColor}
                    maskColor="rgba(0,0,0,0.6)"
                    style={{ background: '#111827' }}
                  />
                </ReactFlow>
                <GraphLegend hasRelations={(detail.relations?.length ?? 0) > 0} />
                <AnimatePresence>
                  {selectedEntity && (
                    <EntitySidePanel
                      entity={selectedEntity}
                      onClose={() => setSelectedEntity(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* List view — grouped by role */
        <>
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
                      <button
                        key={`${entity.entity_type}-${entity.entity_id}-${idx}`}
                        onClick={() => setSelectedEntity(entity)}
                        className={`w-full flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/[0.04] transition-colors text-left ${
                          selectedEntity?.entity_id === entity.entity_id
                            ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
                            : ''
                        }`}
                      >
                        <EntityIcon type={entity.entity_type} />
                        <span className="text-sm text-gray-200 font-mono truncate min-w-0 flex-1">
                          {entity.name || entity.entity_id}
                        </span>
                        <Badge variant="default" className="shrink-0 text-[10px]">
                          {entity.entity_type}
                        </Badge>
                      </button>
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
        </>
      )}

      {/* List view side panel (absolute positioned relative to viewport) */}
      {viewMode === 'list' && selectedEntity && (
        <div className="fixed top-0 right-0 bottom-0 z-40">
          <AnimatePresence>
            <EntitySidePanel entity={selectedEntity} onClose={() => setSelectedEntity(null)} />
          </AnimatePresence>
        </div>
      )}

      <FormDialog {...addEntityDialog.dialogProps} onSubmit={addEntityForm.submit}>
        {addEntityForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
