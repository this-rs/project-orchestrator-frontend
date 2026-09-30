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
import { Zap, File, Database, Link as LinkIcon, Package, FolderKanban, Plus, X, Trash2, GitGraph as GitGraphIcon } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityRow,
  ErrorState,
  FilterBar,
  FormDialog,
  Input,
  ListGroup,
  LoadMoreSentinel,
  MetaLine,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Select,
  SkeletonCard,
  SkeletonLine,
  EntityListSkeleton,
} from '@/components/ui'
import { glass, popIn } from '@/components/ui/classes'
import type { ParentLink } from '@/components/ui/PageHeader'
import { FeatureGraphDetailHelp, GraphLegend } from '@/components/featureGraphs/FeatureGraphHelp'
import { featureGraphsApi, projectsApi } from '@/services'
import { useFormDialog, useIncrementalList, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import {
  INITIAL_NODE_LIMIT,
  MAX_NODE_LIMIT,
  NODE_LIMIT_STEP,
  ROLE_ORDER,
  entityColors,
  layoutSubgraph,
  relationStyle,
  roleLabel,
  selectSubgraph,
  type GraphLayout,
  type GraphNodeData,
} from '@/utils/featureGraphModel'
import type { FeatureGraphDetail, FeatureGraphEntity, FeatureGraphRole, Project } from '@/types'
import '@xyflow/react/dist/style.css'

/** Rows rendered per role group before "Load more" (the API returns the whole graph at once). */
const ROLE_PAGE_SIZE = 40

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

function EntityNodeComponent({ data }: NodeProps<Node<GraphNodeData>>) {
  const colors = entityColors(data.entityType)

  return (
    <div
      className="cursor-pointer"
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
        <span className="text-xs font-medium truncate" style={{ color: colors.text }} title={data.label}>
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 6, height: 6 }} />
    </div>
  )
}

const nodeTypes = { entityNode: EntityNodeComponent }

/** Laid-out model → React Flow props (styles only; no layout work here). */
function toFlow(layout: GraphLayout): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  return {
    nodes: layout.nodes,
    edges: layout.edges.map((e) => {
      const style = relationStyle(e.relationType)
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        style: { stroke: style.stroke, strokeWidth: 1.5, strokeDasharray: style.dashed ? '6 3' : undefined },
        markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke, width: 14, height: 14 },
        ...(e.label
          ? {
              label: e.label,
              labelStyle: { fill: style.stroke, fontSize: 10, fontWeight: 500 },
              labelBgStyle: { fill: '#111827', fillOpacity: 0.8 },
              labelBgPadding: [4, 2] as [number, number],
            }
          : {}),
      }
    }),
  }
}

// ============================================================================
// SELECTED NODE PANEL (floating layer over the canvas → glass)
// ============================================================================

function EntityPanel({ entity, onClose }: { entity: FeatureGraphEntity; onClose: () => void }) {
  return (
    <div className={`absolute top-2 right-2 left-2 sm:left-auto sm:w-80 z-20 rounded-xl p-3 ${glass} ${popIn}`}>
      <div className="flex items-start gap-2">
        <EntityIcon type={entity.entity_type} className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-100 break-words">{entity.name || entity.entity_id}</p>
          <MetaLine items={[<span key="t" className="capitalize">{entity.entity_type}</span>, entity.role ? roleLabel(entity.role) : null]} />
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
        <p className="text-xs text-gray-500">Add a file or a symbol that Auto-build did not pick up.</p>
        <Select label="Entity Type" options={typeOptions} value={entityType} onChange={setEntityType} />
        <Input
          label={entityType === 'file' ? 'File Path' : 'Symbol Name'}
          placeholder={entityType === 'file' ? 'src/api/handlers.rs' : 'handle_request'}
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          error={errors.entity_id}
          className="font-mono"
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
// ENTITIES OF ONE ROLE (incremental: never thousands of rows in the DOM)
// ============================================================================

function RoleGroup({ role, entities, resetKey }: { role: string; entities: FeatureGraphEntity[]; resetKey: string }) {
  const { visible, hasMore, remaining, showMore } = useIncrementalList(entities, ROLE_PAGE_SIZE, resetKey)
  return (
    <ListGroup title={roleLabel(role)} count={entities.length} collapsible>
      {visible.map((entity, idx) => {
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
      <LoadMoreSentinel sentinelRef={noopRef} loadingMore={false} hasMore={hasMore} remaining={remaining} onLoadMore={showMore} />
    </ListGroup>
  )
}

const noopRef = () => {}

// ============================================================================
// GRAPH CANVAS (bounded: top-N entities, layout computed off the first paint)
// ============================================================================

type LayoutResult = { for: unknown; attempt: number } & ({ layout: GraphLayout } | { failed: true })

function GraphCanvas({ detail }: { detail: FeatureGraphDetail }) {
  const [nodeLimit, setNodeLimit] = useState(INITIAL_NODE_LIMIT)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<LayoutResult | null>(null)
  const [selected, setSelected] = useState<FeatureGraphEntity | null>(null)

  const total = detail.entities.length
  const limit = Math.min(nodeLimit, MAX_NODE_LIMIT, total)
  const subgraph = useMemo(
    () => selectSubgraph(detail.entities, detail.relations ?? [], limit),
    [detail.entities, detail.relations, limit],
  )

  // Layout runs in a macrotask so the skeleton paints first; it is bounded by the node/edge caps.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setResult({ for: subgraph, attempt, layout: layoutSubgraph(subgraph) })
      } catch (err) {
        console.error('Feature graph layout failed:', err)
        setResult({ for: subgraph, attempt, failed: true })
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [subgraph, attempt])

  const current = result && result.for === subgraph && result.attempt === attempt ? result : null
  const layout = current && 'layout' in current ? current.layout : null
  const failed = !!current && 'failed' in current
  const flow = useMemo(() => (layout ? toFlow(layout) : null), [layout])

  const relationTypes = useMemo(() => {
    const types = new Set<string>()
    for (const r of subgraph.relations) types.add(r.relation_type)
    return [...types]
  }, [subgraph])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => setSelected(detail.entities[(node.data as GraphNodeData).entityIndex] ?? null),
    [detail.entities],
  )
  const minimapNodeColor = useCallback((node: Node) => entityColors((node.data as GraphNodeData).entityType).minimap, [])

  const canShowMore = limit < Math.min(total, MAX_NODE_LIMIT)
  const capped = total > MAX_NODE_LIMIT && limit >= MAX_NODE_LIMIT

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
        <span role="status" className="tabular-nums">
          Showing {subgraph.nodes.length.toLocaleString()} of {total.toLocaleString()} entities
          {' · '}
          {subgraph.relations.length.toLocaleString()} of {subgraph.totalRelations.toLocaleString()} relations
        </span>
        {total > subgraph.nodes.length && (
          <span className="text-gray-500">Most important first: by role, then by number of links.</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {limit > INITIAL_NODE_LIMIT && (
            <Button size="sm" variant="ghost" onClick={() => setNodeLimit(INITIAL_NODE_LIMIT)}>
              Reset
            </Button>
          )}
          {canShowMore && (
            <Button size="sm" variant="secondary" onClick={() => setNodeLimit(limit + NODE_LIMIT_STEP)}>
              Show {Math.min(NODE_LIMIT_STEP, Math.min(total, MAX_NODE_LIMIT) - limit).toLocaleString()} more
            </Button>
          )}
        </span>
      </div>
      {capped && (
        <p className="text-xs text-amber-400/90">
          The canvas stops at {MAX_NODE_LIMIT} entities to stay responsive. Use the list above to browse the remaining{' '}
          {(total - MAX_NODE_LIMIT).toLocaleString()}.
        </p>
      )}

      {failed ? (
        <ErrorState
          title="The graph could not be drawn"
          description="Computing the layout failed. The entity list above is unaffected."
          onRetry={() => setAttempt((a) => a + 1)}
        />
      ) : !flow ? (
        <div
          role="status"
          aria-label="Computing layout"
          style={{ height: 400 }}
          className="animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03] flex items-center justify-center text-xs text-gray-500"
        >
          Laying out {subgraph.nodes.length.toLocaleString()} entities…
        </div>
      ) : (
        <div
          style={{ height: flow ? layout!.height : 400 }}
          className="relative max-h-[70vh] rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
        >
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            maxZoom={2}
            onlyRenderVisibleElements
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
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
              pannable
              zoomable
            />
          </ReactFlow>
          {selected && <EntityPanel entity={selected} onClose={() => setSelected(null)} />}
        </div>
      )}
      <GraphLegend relationTypes={relationTypes} />
    </div>
  )
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
  const [query, setQuery] = useState('')

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

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = detail?.entities ?? []
    if (!q) return all
    return all.filter((e) => [e.name, e.entity_id, e.entity_type].some((v) => v?.toLowerCase().includes(q)))
  }, [detail, query])

  // Group entities by role
  const groupedEntities = useMemo(() => {
    const groups = new Map<string, FeatureGraphEntity[]>()
    for (const entity of matching) {
      const role = entity.role || 'unknown'
      const group = groups.get(role) || []
      group.push(entity)
      groups.set(role, group)
    }
    return groups
  }, [matching])

  const orderedRoles = useMemo(() => {
    const roles: string[] = ROLE_ORDER.filter((r) => groupedEntities.has(r))
    for (const role of groupedEntities.keys()) if (!roles.includes(role)) roles.push(role)
    return roles
  }, [groupedEntities])

  const addEntityForm = useAddEntityForm({
    graphId: id || '',
    onSuccess: () => {
      fetchData()
    },
  })

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
          detail.entry_function ? (
            <span key="entry" className="inline-flex items-baseline gap-1 min-w-0">
              built from
              <code className="font-mono text-gray-300 truncate max-w-[14rem]" title={detail.entry_function}>
                {detail.entry_function}
              </code>
            </span>
          ) : null,
          detail.build_depth != null ? `depth ${detail.build_depth}` : null,
          `${totalEntities.toLocaleString()} ${totalEntities === 1 ? 'entity' : 'entities'}`,
          relationCount > 0 ? `${relationCount.toLocaleString()} ${relationCount === 1 ? 'relation' : 'relations'}` : null,
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
              title: 'Delete feature graph?',
              description: `Delete “${detail.name}” and its entity associations? The code itself is not touched. This cannot be undone.`,
              confirmLabel: 'Delete',
            },
          },
        ]}
      />

      <FeatureGraphDetailHelp />

      {/* ── Entities, grouped by role ── */}
      <Section
        title="Entities"
        count={totalEntities}
        description="The code that implements this feature, grouped by role: entry points, core logic, data models, contracts, API surface, support."
      >
        {totalEntities === 0 ? (
          <EmptyState
            size="sm"
            icon={<Package />}
            title="No entities yet"
            description="This graph is empty. Add files or functions by hand, or create a new one with Auto-build from an entry function."
            action={
              <Button size="sm" variant="secondary" onClick={openAddEntity}>
                Add entity
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {totalEntities > 12 && (
              <FilterBar search={query} onSearchChange={setQuery} searchPlaceholder="Search entities…" />
            )}
            {matching.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<Package />}
                title="No matching entities"
                description="Try another name, path or type."
                action={
                  <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                    Clear
                  </Button>
                }
              />
            ) : (
              <div>
                {query.trim() && (
                  <p className="mb-1 text-xs text-gray-500 tabular-nums">
                    {matching.length.toLocaleString()} of {totalEntities.toLocaleString()} entities match
                  </p>
                )}
                {orderedRoles.map((role) => (
                  <RoleGroup key={role} role={role} entities={groupedEntities.get(role) || []} resetKey={query} />
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Graph (heavy canvas, opt-in) ── */}
      {totalEntities > 0 && (
        <Section
          title="Graph"
          description="Interactive diagram of the entities and their relations. Drag to pan, pinch or scroll to zoom, tap a node for its details."
          action={
            <Button size="sm" variant="ghost" aria-expanded={showGraph} onClick={() => setShowGraph((v) => !v)}>
              {showGraph ? 'Hide graph' : 'Show graph'}
            </Button>
          }
        >
          {showGraph && <GraphCanvas detail={detail} />}
        </Section>
      )}

      {/* ENTITY_GRAPH_SLOT entity_type="feature_graph" entity_id={detail.id} */}

      <FormDialog {...addEntityDialog.dialogProps} onSubmit={addEntityForm.submit}>
        {addEntityForm.fields}
      </FormDialog>
    </PageContainer>
  )
}
