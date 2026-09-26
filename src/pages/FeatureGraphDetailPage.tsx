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
import { Zap, File, Database, Link as LinkIcon, Package, FolderKanban, Plus, X, Trash2, GitGraph as GitGraphIcon } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityRow,
  ErrorState,
  FormDialog,
  Input,
  ListGroup,
  MetaLine,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Select,
  SkeletonCard,
  SkeletonLine,
  EntityListSkeleton,
  pluralize,
} from '@/components/ui'
import { glass, popIn } from '@/components/ui/classes'
import type { ParentLink } from '@/components/ui/PageHeader'
import { featureGraphsApi, projectsApi } from '@/services'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
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
      className="cursor-pointer transition-transform duration-150 ease-out hover:scale-105"
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
// LEGEND (static, under the canvas — never covers the graph on phones)
// ============================================================================

const legendTypes = [
  { label: 'File', color: '#3b82f6' },
  { label: 'Function', color: '#22c55e' },
  { label: 'Struct', color: '#a855f7' },
  { label: 'Trait', color: '#f97316' },
  { label: 'Enum', color: '#10b981' },
]

const legendEdges = [
  { label: 'Calls', color: '#6b7280', dashed: false },
  { label: 'Imports', color: '#60a5fa', dashed: true },
  { label: 'Extends', color: '#a855f7', dashed: false },
  { label: 'Implements', color: '#f97316', dashed: false },
]

function GraphLegend({ hasRelations }: { hasRelations: boolean }) {
  return (
    <div className="space-y-1" aria-label="Legend">
      <MetaLine
        items={legendTypes.map((t) => (
          <span key={t.label} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: t.color }} aria-hidden="true" />
            {t.label}
          </span>
        ))}
      />
      {hasRelations && (
        <MetaLine
          items={legendEdges.map((e) => (
            <span key={e.label} className="inline-flex items-center gap-1.5">
              <span
                className="w-3.5 h-0 border-t-2"
                style={{ borderColor: e.color, borderStyle: e.dashed ? 'dashed' : 'solid' }}
                aria-hidden="true"
              />
              {e.label}
            </span>
          ))}
        />
      )}
    </div>
  )
}

// ============================================================================
// SELECTED NODE PANEL (floating layer over the canvas → glass)
// ============================================================================

function EntityPanel({ entity, onClose }: { entity: FeatureGraphEntity; onClose: () => void }) {
  const config = roleConfig[entity.role || ''] || defaultRoleConfig
  return (
    <div className={`absolute top-2 right-2 left-2 sm:left-auto sm:w-80 z-20 rounded-xl p-3 ${glass} ${popIn}`}>
      <div className="flex items-start gap-2">
        <EntityIcon type={entity.entity_type} className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-100 break-words">{entity.name || entity.entity_id}</p>
          <MetaLine items={[<span key="t" className="capitalize">{entity.entity_type}</span>, entity.role ? config.label : null]} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close entity details"
          className="shrink-0 -m-1 w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <code className="mt-2 block text-xs text-gray-300 font-mono break-all bg-white/[0.04] px-2 py-1.5 rounded-md">
        {entity.entity_id}
      </code>
    </div>
  )
}

// ============================================================================
// ADD ENTITY FORM
// ============================================================================

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

function useAddEntityForm({ graphId, onSuccess }: { graphId: string; onSuccess: () => void }) {
  const [entityId, setEntityId] = useState('')
  const [entityType, setEntityType] = useState<string>('function')
  const [role, setRole] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToast()

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!entityId.trim()) errs.entity_id = 'Entity ID is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <p className="text-xs text-gray-500">Ajoute à la main un fichier ou un symbole que l'auto-build n'a pas trouvé.</p>
        <Select label="Entity Type" options={typeOptions} value={entityType} onChange={setEntityType} />
        <Input
          label={entityType === 'file' ? 'File Path' : 'Symbol Name'}
          placeholder={entityType === 'file' ? 'src/api/handlers.rs' : 'handle_request'}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          error={errors.entity_id}
          className="font-mono text-base md:text-sm"
          autoFocus
        />
        <Select label="Role" options={roleOptions} value={role} onChange={setRole} />
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

export function FeatureGraphDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const wsSlug = useWorkspaceSlug()
  const addEntityDialog = useFormDialog()
  const toast = useToast()
  const [detail, setDetail] = useState<FeatureGraphDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [parentProject, setParentProject] = useState<Project | null>(null)
  /** Heavy React Flow canvas: mounted only on demand (phones first). */
  const [showGraph, setShowGraph] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<FeatureGraphEntity | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) return
    setError(null)
    setLoading(true)
    try {
      setDetail(await featureGraphsApi.get(id))
    } catch (err) {
      console.error('Failed to fetch feature graph:', err)
      setError('Failed to load feature graph')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Resolve parent project
  useEffect(() => {
    if (!detail?.project_id) return
    const state = location.state as FGLocationState | null
    const controller = new AbortController()

    if (state?.projectSlug && state?.projectName) {
      setParentProject({ slug: state.projectSlug, name: state.projectName, id: state.projectId } as Project)
    } else {
      projectsApi
        .list()
        .then((res) => {
          if (controller.signal.aborted) return
          setParentProject((res.items || []).find((p) => p.id === detail.project_id) ?? null)
        })
        .catch(() => {
          /* graceful degradation */
        })
    }

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.project_id])

  // Group entities by role
  const groupedEntities = useMemo(() => {
    const groups = new Map<string, FeatureGraphEntity[]>()
    for (const entity of detail?.entities ?? []) {
      const role = entity.role || 'unknown'
      const group = groups.get(role) || []
      group.push(entity)
      groups.set(role, group)
    }
    return groups
  }, [detail])

  const orderedRoles = useMemo(() => {
    const roles: string[] = ROLE_ORDER.filter((r) => groupedEntities.has(r))
    for (const role of groupedEntities.keys()) if (!roles.includes(role)) roles.push(role)
    return roles
  }, [groupedEntities])

  // Graph layout — computed only when the canvas is shown
  const layout = useMemo(() => {
    if (!showGraph || !detail?.entities?.length) return null
    return layoutEntities(detail.entities, detail.relations || [])
  }, [detail, showGraph])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (!detail?.entities) return
      const nodeData = node.data as EntityNodeData
      const entity = detail.entities.find(
        (e) => (e.name || e.entity_id) === nodeData.label && e.entity_type === nodeData.entityType,
      )
      setSelectedEntity(entity || null)
    },
    [detail],
  )

  const addEntityForm = useAddEntityForm({
    graphId: id || '',
    onSuccess: () => {
      fetchData()
      setSelectedEntity(null)
    },
  })

  const minimapNodeColor = useCallback((node: Node) => {
    const data = node.data as EntityNodeData
    return (entityTypeColors[data.entityType] || defaultEntityColors).minimap
  }, [])

  if (error) {
    return (
      <PageContainer width="wide">
        <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
      </PageContainer>
    )
  }
  if (loading || !detail) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <div className="space-y-2">
          <SkeletonLine width="40%" />
          <SkeletonLine width="60%" />
        </div>
        <EntityListSkeleton rows={5} />
        <SkeletonCard lines={2} />
      </PageContainer>
    )
  }

  const totalEntities = detail.entities.length
  const relationCount = detail.relations?.length ?? 0

  const parentLinks: ParentLink[] = [
    { icon: GitGraphIcon, label: 'Feature Graphs', name: 'Feature Graphs', href: workspacePath(wsSlug, '/feature-graphs') },
  ]
  if (parentProject) {
    parentLinks.unshift({
      icon: FolderKanban,
      label: 'Project',
      name: parentProject.name,
      href: workspacePath(wsSlug, `/projects/${parentProject.slug}`),
    })
  }

  const openAddEntity = () => addEntityDialog.open({ title: 'Add entity', size: 'md' })

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title={detail.name}
        description={detail.description}
        parentLinks={parentLinks}
        meta={[
          pluralize(totalEntities, 'entity', 'entities'),
          relationCount > 0 ? pluralize(relationCount, 'relation') : null,
          detail.entry_function ? (
            <span key="entry" className="inline-flex items-baseline gap-1 min-w-0">
              built from
              <code className="font-mono text-gray-300 truncate max-w-[14rem]" title={detail.entry_function}>
                {detail.entry_function}
              </code>
            </span>
          ) : null,
          detail.build_depth != null ? `depth ${detail.build_depth}` : null,
          <RelativeTime key="c" date={detail.created_at} prefix="created " />,
        ]}
        actions={
          <Button size="sm" variant="secondary" onClick={openAddEntity}>
            <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
            Add entity
          </Button>
        }
        overflowActions={[
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: async () => {
              try {
                await featureGraphsApi.delete(detail.id)
                toast.success('Feature graph deleted')
                navigate(workspacePath(wsSlug, '/feature-graphs'))
              } catch {
                toast.error('Failed to delete feature graph')
              }
            },
            confirm: {
              title: 'Delete feature graph',
              description: `Supprimer « ${detail.name} » et ses associations d'entités ? Le code n'est pas touché. Irréversible.`,
              confirmLabel: 'Delete',
            },
          },
        ]}
      />

      {/* ── Entities, grouped by role ── */}
      <Section
        title="Entities"
        count={totalEntities}
        description="Le code qui réalise cette fonctionnalité, classé par rôle : points d'entrée, logique métier, modèles de données, contrats, API, support."
      >
        {totalEntities === 0 ? (
          <EmptyState
            size="sm"
            icon={<Package />}
            title="No entity yet"
            description="Ajoutez des fichiers ou des fonctions, ou reconstruisez le graphe avec Auto-build."
            action={
              <Button size="sm" variant="secondary" onClick={openAddEntity}>
                Add entity
              </Button>
            }
          />
        ) : (
          <div>
            {orderedRoles.map((role) => {
              const config = roleConfig[role] || defaultRoleConfig
              const entities = groupedEntities.get(role) || []
              return (
                <ListGroup key={role} title={config.label} count={entities.length} collapsible>
                  {entities.map((entity, idx) => {
                    const label = entity.name || entity.entity_id
                    return (
                      <EntityRow
                        key={`${entity.entity_type}-${entity.entity_id}-${idx}`}
                        title={<span className="font-mono text-[13px]">{label}</span>}
                        ariaLabel={label}
                        leading={<EntityIcon type={entity.entity_type} className="w-3.5 h-3.5 shrink-0" />}
                        description={
                          entity.name && entity.name !== entity.entity_id ? (
                            <code className="font-mono break-all">{entity.entity_id}</code>
                          ) : undefined
                        }
                        meta={[<span key="t" className="capitalize">{entity.entity_type}</span>]}
                      />
                    )
                  })}
                </ListGroup>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── Visualisation (heavy canvas, opt-in) ── */}
      {totalEntities > 0 && (
        <Section
          title="Visualisation"
          description="Schéma interactif des entités et de leurs appels. Déplacer, zoomer ; touchez un nœud pour le détailler."
          action={
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showGraph}
              onClick={() => {
                setShowGraph((v) => !v)
                setSelectedEntity(null)
              }}
            >
              {showGraph ? 'Masquer' : 'Afficher la visualisation'}
            </Button>
          }
        >
          {showGraph && layout && (
            <div className="space-y-2">
              <div
                style={{ height: layout.height }}
                className="relative max-h-[70vh] rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
              >
                <ReactFlow
                  nodes={layout.nodes}
                  edges={layout.edges}
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
                    className="!hidden sm:!block"
                  />
                </ReactFlow>
                {selectedEntity && <EntityPanel entity={selectedEntity} onClose={() => setSelectedEntity(null)} />}
              </div>
              <GraphLegend hasRelations={relationCount > 0} />
            </div>
          )}
        </Section>
      )}

      {/* ENTITY_GRAPH_SLOT entity_type="feature_graph" entity_id={detail.id} */}

      <FormDialog {...addEntityDialog.dialogProps} onSubmit={addEntityForm.submit}>
        {addEntityForm.fields}
      </FormDialog>
    </PageContainer>
  )
}
