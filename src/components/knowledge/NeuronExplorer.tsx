/**
 * Neuron explorer — a concept search rendered as a radial graph: direct
 * matches on the inner ring, notes reached by spreading activation on the
 * outer ring. The graph itself is visual content (ReactFlow); everything
 * around it (search, facts, actions, detail sheet, states) is the design system.
 */
import { useState, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ReactFlow, Background, Controls, type Node, type Edge, type NodeProps } from '@xyflow/react'
import { CheckSquare, RefreshCw, Search, Square, TrendingDown, X, Zap } from 'lucide-react'
import { notesApi } from '@/services'
import {
  Button,
  CollapsibleMarkdown,
  ConfirmDialog,
  EmptyState,
  FilterBar,
  MetaLine,
  OverflowMenu,
  Skeleton,
  StatusText,
  TONE_CLASSES,
  focusRing,
  inlineLink,
  metaText,
} from '@/components/ui'
import { glass } from '@/components/ui/classes'
import { useConfirmDialog, useToast } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { NoteTypeLabel } from './NoteTypeLabel'
import { noteTitle } from './noteMeta'
import type { NeuronSearchResult, NeuronSearchResponse } from '@/types'
import '@xyflow/react/dist/style.css'

// ── Neuron node data ────────────────────────────────────────────────────

interface NeuronNodeData extends Record<string, unknown> {
  label: string
  noteType: string
  activationScore: number
  sourceType: 'direct' | 'propagated'
  energy: number
}

// ── Colour helpers (graph only — energy is the one continuous signal) ───

/** Energy → hsl: 0 = red, 0.5 = yellow, 1 = green */
const energyColor = (energy: number) => `hsl(${Math.round(energy * 120)}, 70%, 45%)`
const energyBg = (energy: number) => `hsl(${Math.round(energy * 120)}, 70%, 12%)`
const energyBorder = (energy: number) => `hsl(${Math.round(energy * 120)}, 70%, 35%)`

const SOURCE_COLORS = {
  direct: '#6366f1',
  propagated: '#f59e0b',
}

// ── Radial layout ───────────────────────────────────────────────────────

function layoutNeurons(results: NeuronSearchResult[]): { nodes: Node<NeuronNodeData>[]; edges: Edge[] } {
  if (results.length === 0) return { nodes: [], edges: [] }

  const direct = results.filter((r) => r.source.type === 'direct')
  const propagated = results.filter((r) => r.source.type === 'propagated')
  const nodes: Node<NeuronNodeData>[] = []
  const edges: Edge[] = []

  const nodeSpacing = 110
  const innerRadius = direct.length <= 1 ? 0 : Math.max(150, (direct.length * nodeSpacing) / (2 * Math.PI))
  const outerRadius = Math.max(innerRadius + 180, (propagated.length * nodeSpacing) / (2 * Math.PI))
  const centerX = outerRadius + 100
  const centerY = outerRadius + 100

  const toData = (r: NeuronSearchResult): NeuronNodeData => ({
    label: noteTitle(r.content),
    noteType: r.note_type,
    activationScore: r.activation_score,
    sourceType: r.source.type,
    energy: r.energy,
  })

  direct.forEach((r, i) => {
    const angle = (2 * Math.PI * i) / Math.max(direct.length, 1) - Math.PI / 2
    const x = direct.length <= 1 ? centerX : centerX + innerRadius * Math.cos(angle)
    const y = direct.length <= 1 ? centerY : centerY + innerRadius * Math.sin(angle)
    nodes.push({ id: r.id, type: 'neuronNode', position: { x: x - 40, y: y - 40 }, data: toData(r) })
  })

  propagated.forEach((r, i) => {
    const angle = (2 * Math.PI * i) / Math.max(propagated.length, 1) - Math.PI / 2
    const x = centerX + outerRadius * Math.cos(angle)
    const y = centerY + outerRadius * Math.sin(angle)
    nodes.push({ id: r.id, type: 'neuronNode', position: { x: x - 35, y: y - 35 }, data: toData(r) })

    const viaId = r.source.via
    const sourceNode = viaId ? direct.find((d) => d.id === viaId) : null
    const connectTo = sourceNode || (direct.length > 0 ? direct[i % direct.length] : null)
    if (connectTo) {
      edges.push({
        id: `e-${connectTo.id}-${r.id}`,
        source: connectTo.id,
        target: r.id,
        style: { stroke: '#4b5563', strokeWidth: Math.max(1, r.activation_score * 3), opacity: 0.5 },
        animated: r.activation_score > 0.5,
      })
    }
  })

  for (let i = 0; i < direct.length - 1; i++) {
    edges.push({
      id: `e-d-${i}`,
      source: direct[i].id,
      target: direct[i + 1].id,
      style: { stroke: SOURCE_COLORS.direct, strokeWidth: 1.5, opacity: 0.3 },
    })
  }

  return { nodes, edges }
}

// ── Custom neuron node ──────────────────────────────────────────────────

function NeuronNodeComponent({ data, selected }: NodeProps<Node<NeuronNodeData>>) {
  const size = 60 + data.activationScore * 40
  return (
    <div
      className="flex flex-col items-center justify-center text-center cursor-pointer"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: selected ? 'rgba(99, 102, 241, 0.2)' : energyBg(data.energy),
        border: `2px solid ${selected ? '#818cf8' : energyBorder(data.energy)}`,
        boxShadow: selected ? '0 0 16px rgba(99, 102, 241, 0.4)' : `0 0 ${data.energy * 12}px ${energyColor(data.energy)}40`,
        padding: 6,
        overflow: 'hidden',
      }}
    >
      <span className="text-[9px] font-medium leading-tight" style={{ color: SOURCE_COLORS[data.sourceType] }}>
        {data.noteType}
      </span>
      <span className="text-[8px] text-gray-400 mt-0.5 line-clamp-2 leading-tight">{data.label}</span>
      <span className="text-[8px] font-mono mt-0.5" style={{ color: energyColor(data.energy) }}>
        {(data.activationScore * 100).toFixed(0)}%
      </span>
    </div>
  )
}

const nodeTypes = { neuronNode: NeuronNodeComponent }

// ── Detail sheet (floating layer over the graph → glass) ────────────────

interface NeuronDetailProps {
  neuron: NeuronSearchResult
  href?: string
  selected: boolean
  onToggleSelect: () => void
  onClose: () => void
}

function NeuronDetail({ neuron, href, selected, onToggleSelect, onClose }: NeuronDetailProps) {
  const title = noteTitle(neuron.content)
  return (
    <aside
      aria-label="Neuron detail"
      className={`absolute z-10 inset-x-2 bottom-2 sm:inset-x-auto sm:right-2 sm:top-2 sm:bottom-auto sm:w-80 rounded-xl ${glass} shadow-2xl overflow-hidden`}
    >
      <div className="flex items-start gap-2 px-3 py-2 border-b border-white/[0.06]">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm text-gray-100 line-clamp-2 break-words">
            {href ? (
              <Link to={href} className={inlineLink}>
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          <MetaLine
            className="mt-0.5"
            items={[
              <NoteTypeLabel key="t" type={neuron.note_type} />,
              <StatusText key="i" kind="importance" status={neuron.importance} dot={false} />,
              <span key="s" className={neuron.source.type === 'direct' ? TONE_CLASSES.progress.text : TONE_CLASSES.warning.text}>
                {neuron.source.type}
              </span>,
            ]}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close neuron detail"
          className={`w-9 h-9 md:w-8 md:h-8 -mr-1.5 -mt-1 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/[0.06] shrink-0 ${focusRing}`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div className="px-3 py-2 space-y-2 max-h-64 sm:max-h-80 overflow-y-auto">
        <dl className="grid grid-cols-2 gap-x-3 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-gray-500">Activation</dt>
            <dd className="text-gray-200 tabular-nums">{(neuron.activation_score * 100).toFixed(0)}%</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-gray-500">Energy</dt>
            <dd className="tabular-nums" style={{ color: energyColor(neuron.energy) }}>
              {(neuron.energy * 100).toFixed(0)}%
            </dd>
          </div>
        </dl>
        <span className="block h-1 rounded-full bg-white/[0.06] overflow-hidden" aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${neuron.energy * 100}%`, background: energyColor(neuron.energy) }} />
        </span>
        <CollapsibleMarkdown content={neuron.content} maxHeight={120} />
        {neuron.tags.length > 0 && <p className={`${metaText} break-words`}>{neuron.tags.map((t) => `#${t}`).join(' ')}</p>}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06]">
        <Button size="sm" variant={selected ? 'secondary' : 'ghost'} onClick={onToggleSelect} aria-pressed={selected}>
          {selected ? (
            <CheckSquare className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
          ) : (
            <Square className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
          )}
          {selected ? 'Selected' : 'Select'}
        </Button>
        {href && (
          <Link to={href} className={`ml-auto text-xs ${inlineLink}`}>
            Open note
          </Link>
        )}
      </div>
    </aside>
  )
}

// ── Main component ──────────────────────────────────────────────────────

interface NeuronExplorerProps {
  workspaceSlug?: string
  projectSlug?: string
}

export function NeuronExplorer({ workspaceSlug, projectSlug }: NeuronExplorerProps) {
  const [query, setQuery] = useState('')
  const [searchResponse, setSearchResponse] = useState<NeuronSearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedNeuronIds, setSelectedNeuronIds] = useState<Set<string>>(new Set())
  const [detailNeuron, setDetailNeuron] = useState<NeuronSearchResult | null>(null)
  const toast = useToast()
  const confirmDialog = useConfirmDialog()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResponse(null)
        setHasSearched(false)
        return
      }
      setSearching(true)
      setDetailNeuron(null)
      setSelectedNeuronIds(new Set())
      try {
        const res = await notesApi.searchNeurons({ query: q, project_slug: projectSlug, max_results: 30, max_hops: 3 })
        setSearchResponse(res)
        setHasSearched(true)
      } catch {
        toast.error('Neuron search failed')
        setSearchResponse(null)
      } finally {
        setSearching(false)
      }
    },
    [projectSlug, toast],
  )

  const handleSearchChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 500)
  }

  const results = useMemo(() => searchResponse?.results ?? [], [searchResponse])
  const metadata = searchResponse?.metadata

  // If every direct score sits in a < 5 % band the embedding model matched
  // nothing in particular (it returns high similarity for any input).
  const lowQuality = useMemo(() => {
    const directScores = results.filter((r) => r.source.type === 'direct').map((r) => r.activation_score)
    if (directScores.length < 2) return false
    const max = Math.max(...directScores)
    return max - Math.min(...directScores) < max * 0.05
  }, [results])

  const { graphNodes, graphEdges } = useMemo(() => {
    const { nodes, edges } = layoutNeurons(results)
    return { graphNodes: nodes.map((n) => ({ ...n, selected: selectedNeuronIds.has(n.id) })), graphEdges: edges }
  }, [results, selectedNeuronIds])

  const toggleSelected = useCallback((id: string) => {
    setSelectedNeuronIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node<NeuronNodeData>) => {
      // ⌘/Ctrl-click toggles the selection (touch users use the sheet's Select button)
      if (event.metaKey || event.ctrlKey) toggleSelected(node.id)
      const neuron = results.find((r) => r.id === node.id)
      if (neuron) setDetailNeuron(neuron)
    },
    [results, toggleSelected],
  )

  const handlePaneClick = useCallback(() => setDetailNeuron(null), [])

  // ── Actions ─────────────────────────────────────────────────────────

  const handleReinforce = async () => {
    const ids = Array.from(selectedNeuronIds)
    if (ids.length < 2) {
      toast.error('Select at least 2 neurons to reinforce')
      return
    }
    try {
      const res = await notesApi.reinforceNeurons({ note_ids: ids })
      toast.success(`Reinforced ${res.neurons_boosted} neurons`)
    } catch {
      toast.error('Reinforcement failed')
    }
  }

  const handleDecay = () => {
    confirmDialog.open({
      title: 'Decay synapses?',
      description: 'Every synapse is weakened a little and very weak ones are pruned. This applies to the whole knowledge graph.',
      confirmLabel: 'Decay',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const res = await notesApi.decaySynapses()
          toast.success(`Decayed ${res.synapses_decayed} synapses, pruned ${res.synapses_pruned}`)
        } catch {
          toast.error('Decay failed')
        }
      },
    })
  }

  const handleUpdateEnergy = async () => {
    try {
      const res = await notesApi.updateEnergy()
      toast.success(`Updated energy for ${res.notes_updated} notes`)
    } catch {
      toast.error('Energy update failed')
    }
  }

  const selectionCount = selectedNeuronIds.size

  let body: ReactNode
  if (searching) {
    body = <Skeleton className="flex-1 min-h-80 rounded-xl" />
  } else if (hasSearched && results.length === 0) {
    body = (
      <EmptyState
        variant="search"
        title="No neurons activated"
        description="Try another wording — neurons light up through spreading activation in the knowledge graph."
      />
    )
  } else if (results.length > 0) {
    body = (
      <div className="relative flex-1 min-h-80 rounded-xl border border-white/[0.06] overflow-hidden">
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
        >
          <Background color="#374151" gap={20} size={1} />
          <Controls showInteractive={false} className="dep-graph-controls" />
        </ReactFlow>

        {detailNeuron && (
          <NeuronDetail
            neuron={detailNeuron}
            href={workspaceSlug ? workspacePath(workspaceSlug, `/notes/${detailNeuron.id}`) : undefined}
            selected={selectedNeuronIds.has(detailNeuron.id)}
            onToggleSelect={() => toggleSelected(detailNeuron.id)}
            onClose={() => setDetailNeuron(null)}
          />
        )}

        <div
          className={`absolute top-2 left-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 rounded-lg ${glass} ${metaText}`}
          aria-label="Legend"
        >
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS.direct }} aria-hidden="true" />
            direct
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS.propagated }} aria-hidden="true" />
            propagated
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: energyColor(0) }} aria-hidden="true" />
            low energy
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: energyColor(1) }} aria-hidden="true" />
            high energy
          </span>
        </div>
      </div>
    )
  } else {
    body = (
      <EmptyState
        icon={<Search className="w-8 h-8 text-gray-500" />}
        title="Search a concept"
        description="Notes are neurons linked by weighted synapses. Type a concept to see which ones light up, then select several to reinforce their connections."
      />
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <FilterBar
        search={query}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search neurons by concept…"
        searchLabel="Search neurons"
        trailing={
          <>
            {selectionCount >= 2 && (
              <Button size="sm" onClick={handleReinforce}>
                <Zap className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                Reinforce {selectionCount}
              </Button>
            )}
            <OverflowMenu
              label="Neural maintenance"
              actions={[
                { label: 'Update energy', icon: RefreshCw, onClick: handleUpdateEnergy },
                { label: 'Decay synapses', icon: TrendingDown, onClick: handleDecay },
              ]}
            />
          </>
        }
      />

      {metadata && !searching && (
        <MetaLine
          className="px-1"
          items={[
            `${metadata.total_activated} activated`,
            <span key="d" className={TONE_CLASSES.progress.text}>
              {metadata.direct_matches} direct
            </span>,
            <span key="p" className={TONE_CLASSES.warning.text}>
              {metadata.propagated_matches} propagated
            </span>,
            `${metadata.query_time_ms} ms`,
            selectionCount > 0 ? `${selectionCount} selected` : null,
          ]}
        />
      )}

      {!searching && lowQuality && results.length > 0 && (
        <p className={`px-1 text-xs ${TONE_CLASSES.warning.text}`}>
          Low confidence — all results score almost the same, the query may not match any note in particular.
        </p>
      )}

      {body}

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
