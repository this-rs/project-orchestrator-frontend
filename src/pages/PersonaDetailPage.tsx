import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Users, Zap, Brain, FileText, Scale, GitBranch, Code, Activity,
  Settings, Trash2, Network,
} from 'lucide-react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { personasApi } from '@/services'
import {
  Card,
  CardContent,
  Button,
  Spinner,
  PageShell,
} from '@/components/ui'
import { useToast } from '@/hooks'
import type { Persona, PersonaSubgraph, PersonaSubgraphRelation } from '@/types'

// ── Tab type ─────────────────────────────────────────────────────────────

type TabKey = 'subgraph' | 'relations' | 'history'

// ── Helpers ─────────────────────────────────────────────────────────────

function energyColor(energy: number): string {
  if (energy >= 0.7) return 'bg-emerald-500'
  if (energy >= 0.3) return 'bg-amber-500'
  return 'bg-red-500'
}

function cohesionColor(cohesion: number): string {
  if (cohesion >= 0.7) return 'bg-indigo-500'
  if (cohesion >= 0.4) return 'bg-indigo-400'
  return 'bg-indigo-300/60'
}

function MetricBar({ label, value, colorFn }: { label: string; value: number; colorFn: (v: number) => string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorFn(value)}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  )
}

function RelationTable({
  title,
  icon: Icon,
  relations,
  onRemove,
}: {
  title: string
  icon: React.ElementType
  relations: PersonaSubgraphRelation[]
  onRemove?: (entityId: string) => void
}) {
  if (relations.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-600">
        <Icon className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No {title.toLowerCase()} linked</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
        <Icon className="h-4 w-4" />
        {title} ({relations.length})
      </h3>
      <div className="space-y-1">
        {relations.map((rel) => (
          <div
            key={rel.entity_id}
            className="flex items-center justify-between px-3 py-2 rounded-md bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors text-sm"
          >
            <span className="truncate flex-1 font-mono text-xs">{rel.entity_id}</span>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <span className="text-xs text-zinc-500">w: {rel.weight.toFixed(2)}</span>
              {onRemove && (
                <button
                  onClick={() => onRemove(rel.entity_id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Subgraph visualization ──────────────────────────────────────────────

/** Node color palette per entity type */
const entityStyles: Record<string, { bg: string; border: string; text: string }> = {
  persona:  { bg: '#581c87', border: '#a855f7', text: '#e9d5ff' },
  file:     { bg: '#1e293b', border: '#64748b', text: '#cbd5e1' },
  function: { bg: '#1e293b', border: '#94a3b8', text: '#e2e8f0' },
  note:     { bg: '#422006', border: '#f59e0b', text: '#fef3c7' },
  decision: { bg: '#1e1b4b', border: '#818cf8', text: '#e0e7ff' },
  skill:    { bg: '#052e16', border: '#22c55e', text: '#bbf7d0' },
  parent:   { bg: '#1c1917', border: '#78716c', text: '#d6d3d1' },
  child:    { bg: '#1c1917', border: '#78716c', text: '#d6d3d1' },
}

function buildSubgraphFlow(persona: Persona, subgraph: PersonaSubgraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Center persona node
  nodes.push({
    id: `persona-${persona.id}`,
    position: { x: 0, y: 0 },
    data: { label: persona.name },
    style: {
      background: entityStyles.persona.bg,
      border: `2px solid ${entityStyles.persona.border}`,
      color: entityStyles.persona.text,
      borderRadius: '12px',
      padding: '12px 20px',
      fontWeight: 700,
      fontSize: '14px',
    },
  })

  const allGroups: { type: string; items: PersonaSubgraphRelation[] }[] = [
    { type: 'file', items: subgraph.files ?? [] },
    { type: 'function', items: subgraph.functions ?? [] },
    { type: 'note', items: subgraph.notes ?? [] },
    { type: 'decision', items: subgraph.decisions ?? [] },
    { type: 'skill', items: subgraph.skills ?? [] },
    { type: 'parent', items: subgraph.parents ?? [] },
    { type: 'child', items: subgraph.children ?? [] },
  ]

  // Layout groups in a radial pattern around center
  const nonEmpty = allGroups.filter((g) => g.items.length > 0)
  const angleStep = (2 * Math.PI) / Math.max(nonEmpty.length, 1)

  nonEmpty.forEach((group, gi) => {
    const baseAngle = angleStep * gi - Math.PI / 2
    const radius = 250
    const itemAngleSpread = Math.min(0.6, (group.items.length - 1) * 0.15)

    group.items.forEach((rel, ri) => {
      const itemAngle = group.items.length === 1
        ? baseAngle
        : baseAngle - itemAngleSpread / 2 + (itemAngleSpread / (group.items.length - 1)) * ri

      const x = Math.cos(itemAngle) * (radius + ri * 30)
      const y = Math.sin(itemAngle) * (radius + ri * 30)

      const nodeId = `${group.type}-${rel.entity_id}`
      const style = entityStyles[group.type] || entityStyles.file
      const shortLabel = rel.entity_id.length > 30
        ? '...' + rel.entity_id.slice(-27)
        : rel.entity_id

      nodes.push({
        id: nodeId,
        position: { x, y },
        data: { label: shortLabel },
        style: {
          background: style.bg,
          border: `1.5px solid ${style.border}`,
          color: style.text,
          borderRadius: '8px',
          padding: '6px 12px',
          fontSize: '11px',
          maxWidth: '180px',
          whiteSpace: 'nowrap' as const,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      })

      edges.push({
        id: `e-${nodeId}`,
        source: `persona-${persona.id}`,
        target: nodeId,
        style: { stroke: style.border, strokeWidth: Math.max(1, rel.weight * 3) },
        label: rel.weight > 0 ? rel.weight.toFixed(1) : undefined,
        labelStyle: { fontSize: 9, fill: '#71717a' },
      })
    })
  })

  return { nodes, edges }
}

// ── Main page ───────────────────────────────────────────────────────────

export function PersonaDetailPage() {
  const { id: personaId } = useParams<{ id: string }>()
  const [persona, setPersona] = useState<Persona | null>(null)
  const [subgraph, setSubgraph] = useState<PersonaSubgraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Persona>>({})
  const [tab, setTab] = useState<TabKey>('subgraph')
  const toast = useToast()

  const loadPersona = useCallback(async () => {
    if (!personaId) return
    try {
      const [p, sg] = await Promise.all([
        personasApi.get(personaId),
        personasApi.getSubgraph(personaId),
      ])
      setPersona(p)
      setSubgraph(sg)
    } catch (e) {
      toast.error('Failed to load persona')
    } finally {
      setLoading(false)
    }
  }, [personaId])

  useEffect(() => { loadPersona() }, [loadPersona])

  // Build ReactFlow data from subgraph
  const flowData = useMemo(() => {
    if (!persona || !subgraph) return { nodes: [], edges: [] }
    return buildSubgraphFlow(persona, subgraph)
  }, [persona, subgraph])

  const handleSave = async () => {
    if (!personaId || !editForm) return
    try {
      const updated = await personasApi.update(personaId, {
        name: editForm.name,
        description: editForm.description,
        complexity_default: editForm.complexity_default ?? undefined,
        timeout_secs: editForm.timeout_secs ?? undefined,
        max_cost_usd: editForm.max_cost_usd ?? undefined,
        model_preference: editForm.model_preference ?? undefined,
      })
      setPersona(updated)
      setEditing(false)
      toast.success('Persona updated')
    } catch {
      toast.error('Failed to update persona')
    }
  }

  const handleActivate = async () => {
    if (!personaId) return
    try {
      await personasApi.activate(personaId)
      toast.success('Persona activated')
      loadPersona()
    } catch {
      toast.error('Failed to activate persona')
    }
  }

  const handleRemoveFile = async (filePath: string) => {
    if (!personaId) return
    try {
      await personasApi.removeFile(personaId, filePath)
      toast.success('File removed')
      loadPersona()
    } catch {
      toast.error('Failed to remove file')
    }
  }

  const handleRemoveNote = async (noteId: string) => {
    if (!personaId) return
    try {
      await personasApi.removeNote(personaId, noteId)
      toast.success('Note removed')
      loadPersona()
    } catch {
      toast.error('Failed to remove note')
    }
  }

  const handleRemoveDecision = async (decisionId: string) => {
    if (!personaId) return
    try {
      await personasApi.removeDecision(personaId, decisionId)
      toast.success('Decision removed')
      loadPersona()
    } catch {
      toast.error('Failed to remove decision')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  if (!persona) {
    return (
      <div className="text-center py-16 text-zinc-500">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p>Persona not found</p>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'subgraph', label: 'Subgraph', icon: Network },
    { key: 'relations', label: 'Relations', icon: GitBranch },
    { key: 'history', label: 'History', icon: Activity },
  ]

  return (
    <PageShell
      title={persona.name}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleActivate}>
            <Zap className="h-4 w-4 mr-1" />
            Activate
          </Button>
          <Button variant="secondary" size="sm" onClick={() => {
            setEditing(!editing)
            setEditForm({
              name: persona.name,
              description: persona.description,
              complexity_default: persona.complexity_default,
              timeout_secs: persona.timeout_secs,
              max_cost_usd: persona.max_cost_usd,
              model_preference: persona.model_preference,
            })
          }}>
            <Settings className="h-4 w-4 mr-1" />
            {editing ? 'Cancel' : 'Edit'}
          </Button>
        </div>
      }
    >
      {/* Header metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <MetricBar label="Energy" value={persona.energy ?? 0} colorFn={energyColor} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <MetricBar label="Cohesion" value={persona.cohesion ?? 0} colorFn={cohesionColor} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-zinc-500">Activations</div>
            <div className="text-2xl font-bold">{persona.activation_count ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-zinc-500">Success Rate</div>
            <div className="text-2xl font-bold">{((persona.success_rate ?? 0) * 100).toFixed(0)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Edit panel */}
      {editing && (
        <Card className="mb-6 border-purple-500/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">Edit Parameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500">Name</label>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Model Preference</label>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
                  value={editForm.model_preference || ''}
                  onChange={(e) => setEditForm({ ...editForm, model_preference: e.target.value })}
                  placeholder="opus, sonnet, haiku..."
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Timeout (secs)</label>
                <input
                  type="number"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
                  value={editForm.timeout_secs || ''}
                  onChange={(e) => setEditForm({ ...editForm, timeout_secs: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Max Cost (USD)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
                  value={editForm.max_cost_usd || ''}
                  onChange={(e) => setEditForm({ ...editForm, max_cost_usd: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Description</label>
              <textarea
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm h-20"
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs (manual state, matching project pattern) */}
      <div className="flex gap-1 mb-4 border-b border-white/[0.06]">
        {tabs.map(({ key, label, icon: TabIcon }) => (
          <button
            key={key}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setTab(key)}
          >
            <TabIcon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Subgraph tab */}
      {tab === 'subgraph' && subgraph && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{(subgraph.files ?? []).length}</div>
                <div className="text-xs text-zinc-500">Files</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{(subgraph.notes ?? []).length}</div>
                <div className="text-xs text-zinc-500">Notes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-400">{(subgraph.decisions ?? []).length}</div>
                <div className="text-xs text-zinc-500">Decisions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">{(subgraph.skills ?? []).length}</div>
                <div className="text-xs text-zinc-500">Skills</div>
              </div>
            </div>
            <div className="text-sm text-zinc-500 mb-3">
              Coverage: {((subgraph.stats?.coverage_score ?? 0) * 100).toFixed(0)}% |
              Freshness: {((subgraph.stats?.freshness ?? 0) * 100).toFixed(0)}% |
              Total entities: {subgraph.stats?.total_entities ?? 0}
            </div>
            {/* Force-directed subgraph visualization */}
            {flowData.nodes.length > 1 ? (
              <div className="h-[400px] bg-zinc-900/50 rounded-lg border border-zinc-800">
                <ReactFlow
                  nodes={flowData.nodes}
                  edges={flowData.edges}
                  fitView
                  proOptions={{ hideAttribution: true }}
                  minZoom={0.3}
                  maxZoom={2}
                  defaultEdgeOptions={{ animated: true }}
                >
                  <Background color="#27272a" gap={20} />
                  <Controls
                    showInteractive={false}
                    className="!bg-zinc-800 !border-zinc-700 !shadow-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-300 [&>button:hover]:!bg-zinc-700"
                  />
                </ReactFlow>
              </div>
            ) : (
              <div className="h-64 bg-zinc-900/50 rounded-lg flex items-center justify-center text-zinc-600 border border-zinc-800">
                <div className="text-center">
                  <Network className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No entities to visualize</p>
                  <p className="text-xs mt-1">Add files, notes, or skills to see the subgraph</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Relations tab */}
      {tab === 'relations' && (
        <div className="space-y-6">
          <RelationTable
            title="Files"
            icon={Code}
            relations={subgraph?.files || []}
            onRemove={handleRemoveFile}
          />
          <RelationTable
            title="Functions"
            icon={Code}
            relations={subgraph?.functions || []}
          />
          <RelationTable
            title="Notes"
            icon={FileText}
            relations={subgraph?.notes || []}
            onRemove={handleRemoveNote}
          />
          <RelationTable
            title="Decisions"
            icon={Scale}
            relations={subgraph?.decisions || []}

            onRemove={handleRemoveDecision}
          />
          <RelationTable
            title="Skills"
            icon={Brain}
            relations={subgraph?.skills || []}

          />
          <RelationTable
            title="Parents (EXTENDS)"
            icon={GitBranch}
            relations={subgraph?.parents || []}
          />
          <RelationTable
            title="Children"
            icon={GitBranch}
            relations={subgraph?.children || []}
          />
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <Card>
          <CardContent className="p-4">
            <div className="text-center py-12 text-zinc-600">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Execution history</p>
              <p className="text-xs mt-1">
                Tasks executed with this persona will appear here once the runner has used it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
