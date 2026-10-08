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
import { Package, FolderKanban, Plus, Trash2, GitGraph as GitGraphIcon } from 'lucide-react'
import {
  Button,
  EmptyState,
  ErrorState,
  FormDialog,
  Input,
  PageContainer,
  PageHeader,
  RelativeTime,
  Section,
  Select,
  SkeletonCard,
  SkeletonLine,
  EntityListSkeleton,
} from '@/components/ui'
import type { ParentLink } from '@/components/ui/PageHeader'
import { FeatureGraphDetailHelp, GraphLegend } from '@/components/featureGraphs/FeatureGraphHelp'
import { featureGraphsApi, projectsApi } from '@/services'
import { EntityBrowser, EntityIcon } from '@/components/featureGraphs/EntityBrowser'
import { EntityDetailPanel } from '@/components/featureGraphs/EntityDetailPanel'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import {
  entityColors,
  layoutSubgraph,
  relationStyle,
  selectSubgraph,
  type GraphLayout,
  type GraphNodeData,
} from '@/utils/featureGraphModel'
import { buildEntityViews, buildNeighbourIndex, type EntityNeighbours, type EntityView } from '@/utils/featureGraphReadable'
import type { FeatureGraphDetail, FeatureGraphRole, Project } from '@/types'
import '@xyflow/react/dist/style.css'

// ============================================================================
// GRAPH NODE COMPONENT
// ============================================================================

function EntityNodeComponent({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  const colors = entityColors(data.entityType)

  return (
    <div
      className="cursor-pointer"
      title={data.codeName}
      style={{
        background: colors.bg,
        border: `${selected ? 2.5 : 1.5}px solid ${colors.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 160,
        maxWidth: 220,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 6, height: 6 }} />
      <div className="flex items-center gap-2">
        <EntityIcon type={data.entityType} className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs font-medium truncate" style={{ color: colors.text }}>
          {data.label}
        </span>
      </div>
      {selected && <div className="mt-0.5 truncate font-mono text-[11px] text-gray-400">{data.codeName}</div>}
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

type LayoutResult = { for: unknown; attempt: number } & ({ layout: GraphLayout } | { failed: true })

// ============================================================================
// GRAPH CANVAS (every node is drawn; layout computed off the first paint)
// ============================================================================

function GraphCanvas({
  detail,
  neighbours,
  viewById,
  views,
}: {
  detail: FeatureGraphDetail
  neighbours: Map<string, EntityNeighbours>
  viewById: Map<string, EntityView>
  views: EntityView[]
}) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<LayoutResult | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const total = detail.entities.length
  const subgraph = useMemo(
    () => selectSubgraph(detail.entities, detail.relations ?? [], total),
    [detail.entities, detail.relations, total],
  )

  // Layout runs in a macrotask so the skeleton paints first; big graphs use a linear layered layout.
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
  const flowNodes = useMemo(
    () => (flow ? flow.nodes.map((n) => (n.data.entityIndex === selectedIndex ? { ...n, selected: true } : n)) : []),
    [flow, selectedIndex],
  )

  const relationTypes = useMemo(() => {
    const types = new Set<string>()
    for (const r of subgraph.relations) types.add(r.relation_type)
    return [...types]
  }, [subgraph])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => setSelectedIndex((node.data as GraphNodeData).entityIndex),
    [],
  )
  const minimapNodeColor = useCallback((node: Node) => entityColors((node.data as GraphNodeData).entityType).minimap, [])
  const selectedView = selectedIndex != null ? views[selectedIndex] : undefined
  const droppedEdges = subgraph.totalRelations - subgraph.relations.length

  return (
    <div className="space-y-2">
      <p role="status" className="text-xs text-gray-400 tabular-nums">
        {subgraph.nodes.length.toLocaleString()} entities · {subgraph.relations.length.toLocaleString()} relations drawn
        {droppedEdges > 0 && (
          <span className="text-amber-400/90">
            {' '}
            ({droppedEdges.toLocaleString()} more relations are not drawn to keep panning smooth; every entity is shown)
          </span>
        )}
      </p>

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
          style={{ height: layout!.height }}
          className="relative max-h-[70vh] rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
        >
          <ReactFlow
            nodes={flowNodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.05}
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
          {selectedView && (
            <EntityDetailPanel
              floating
              view={selectedView}
              neighbours={neighbours.get(selectedView.entity.entity_id)}
              viewById={viewById}
              onSelectId={(id) => {
                const v = viewById.get(id)
                if (v) setSelectedIndex(v.index)
              }}
              onClose={() => setSelectedIndex(null)}
            />
          )}
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

  const views = useMemo(() => buildEntityViews(detail?.entities ?? []), [detail])
  const viewById = useMemo(() => {
    const m = new Map<string, EntityView>()
    for (const v of views) if (!m.has(v.entity.entity_id)) m.set(v.entity.entity_id, v)
    return m
  }, [views])
  const neighbours = useMemo(() => buildNeighbourIndex(detail?.relations ?? []), [detail])

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
        description="The code that implements this feature. Each entry has a readable title, the exact code name and a one-line explanation. Group by role, file or type; scroll to see them all."
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
          <EntityBrowser views={views} neighbours={neighbours} viewById={viewById} />
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
          {showGraph && <GraphCanvas detail={detail} neighbours={neighbours} viewById={viewById} views={views} />}
        </Section>
      )}

      {/* ENTITY_GRAPH_SLOT entity_type="feature_graph" entity_id={detail.id} */}

      <FormDialog {...addEntityDialog.dialogProps} onSubmit={addEntityForm.submit}>
        {addEntityForm.fields}
      </FormDialog>
    </PageContainer>
  )
}
