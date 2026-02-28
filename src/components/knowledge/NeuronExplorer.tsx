import { useState, useMemo, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import { Zap, RefreshCw, TrendingDown, Search } from 'lucide-react'
import { notesApi } from '@/services'
import {
  Button,
  Badge,
  ImportanceBadge,
  Spinner,
  EmptyState,
  SearchInput,
  CollapsibleMarkdown,
} from '@/components/ui'
import { useConfirmDialog, useToast } from '@/hooks'
import { ConfirmDialog } from '@/components/ui'
import type { NeuronSearchResult, NeuronSearchResponse, NoteImportance } from '@/types'
import '@xyflow/react/dist/style.css'

// ── Neuron node data ────────────────────────────────────────────────────

interface NeuronNodeData extends Record<string, unknown> {
  label: string
  content: string
  noteType: string
  importance: string
  activationScore: number
  sourceType: 'direct' | 'propagated'
  energy: number
  tags: string[]
  noteId: string
}

// ── Color helpers ───────────────────────────────────────────────────────

/** Energy → hsl color: 0 = red, 0.5 = yellow, 1.0 = green */
function energyColor(energy: number): string {
  const h = Math.round(energy * 120) // 0→0(red), 0.5→60(yellow), 1→120(green)
  return `hsl(${h}, 70%, 45%)`
}

function energyBg(energy: number): string {
  const h = Math.round(energy * 120)
  return `hsl(${h}, 70%, 12%)`
}

function energyBorder(energy: number): string {
  const h = Math.round(energy * 120)
  return `hsl(${h}, 70%, 35%)`
}

const sourceColors = {
  direct: { border: '#6366f1', bg: '#1e1b4b' },
  propagated: { border: '#f59e0b', bg: '#422006' },
}

// ── Radial layout ───────────────────────────────────────────────────────

function layoutNeurons(results: NeuronSearchResult[]): {
  nodes: Node<NeuronNodeData>[]
  edges: Edge[]
} {
  if (results.length === 0) return { nodes: [], edges: [] }

  const direct = results.filter((r) => r.source.type === 'direct')
  const propagated = results.filter((r) => r.source.type === 'propagated')

  const nodes: Node<NeuronNodeData>[] = []
  const edges: Edge[] = []

  // Dynamic radii: ensure nodes don't overlap
  // Each node is ~80-100px wide, so we need circumference > count * spacing
  const nodeSpacing = 110 // min px between node centers
  const innerRadius = direct.length <= 1 ? 0 : Math.max(150, (direct.length * nodeSpacing) / (2 * Math.PI))
  const outerRadius = Math.max(innerRadius + 180, (propagated.length * nodeSpacing) / (2 * Math.PI))

  const centerX = outerRadius + 100
  const centerY = outerRadius + 100

  // Place direct matches in inner ring
  direct.forEach((r, i) => {
    const angle = (2 * Math.PI * i) / Math.max(direct.length, 1) - Math.PI / 2
    const x = direct.length <= 1 ? centerX : centerX + innerRadius * Math.cos(angle)
    const y = direct.length <= 1 ? centerY : centerY + innerRadius * Math.sin(angle)

    nodes.push({
      id: r.id,
      type: 'neuronNode',
      position: { x: x - 40, y: y - 40 },
      data: {
        label: r.content.slice(0, 50) + (r.content.length > 50 ? '...' : ''),
        content: r.content,
        noteType: r.note_type,
        importance: r.importance,
        activationScore: r.activation_score,
        sourceType: r.source.type,
        energy: r.energy,
        tags: r.tags,
        noteId: r.id,
      },
    })
  })

  // Place propagated matches in outer ring
  propagated.forEach((r, i) => {
    const angle = (2 * Math.PI * i) / Math.max(propagated.length, 1) - Math.PI / 2
    const x = centerX + outerRadius * Math.cos(angle)
    const y = centerY + outerRadius * Math.sin(angle)

    nodes.push({
      id: r.id,
      type: 'neuronNode',
      position: { x: x - 35, y: y - 35 },
      data: {
        label: r.content.slice(0, 50) + (r.content.length > 50 ? '...' : ''),
        content: r.content,
        noteType: r.note_type,
        importance: r.importance,
        activationScore: r.activation_score,
        sourceType: r.source.type,
        energy: r.energy,
        tags: r.tags,
        noteId: r.id,
      },
    })

    // Connect propagated to the direct match it was activated via (or round-robin fallback)
    const viaId = r.source.via
    const sourceNode = viaId ? direct.find((d) => d.id === viaId) : null
    const connectTo = sourceNode || (direct.length > 0 ? direct[i % direct.length] : null)
    if (connectTo) {
      edges.push({
        id: `e-${connectTo.id}-${r.id}`,
        source: connectTo.id,
        target: r.id,
        style: {
          stroke: '#4b5563',
          strokeWidth: Math.max(1, r.activation_score * 3),
          opacity: 0.5,
        },
        animated: r.activation_score > 0.5,
      })
    }
  })

  // Connect direct nodes to each other if multiple
  for (let i = 0; i < direct.length - 1; i++) {
    edges.push({
      id: `e-d-${i}`,
      source: direct[i].id,
      target: direct[i + 1].id,
      style: { stroke: '#6366f1', strokeWidth: 1.5, opacity: 0.3 },
    })
  }

  return { nodes, edges }
}

// ── Custom neuron node ──────────────────────────────────────────────────

function NeuronNodeComponent({ data, selected }: NodeProps<Node<NeuronNodeData>>) {
  const size = 60 + data.activationScore * 40
  const isDirect = data.sourceType === 'direct'
  const colors = isDirect ? sourceColors.direct : sourceColors.propagated

  return (
    <div
      className="flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: selected ? 'rgba(99, 102, 241, 0.2)' : energyBg(data.energy),
        border: `2px solid ${selected ? '#818cf8' : energyBorder(data.energy)}`,
        boxShadow: selected
          ? '0 0 16px rgba(99, 102, 241, 0.4)'
          : `0 0 ${data.energy * 12}px ${energyColor(data.energy)}40`,
        padding: 6,
        overflow: 'hidden',
      }}
    >
      <span
        className="text-[9px] font-medium leading-tight"
        style={{ color: colors.border }}
      >
        {data.noteType}
      </span>
      <span className="text-[8px] text-gray-400 mt-0.5 line-clamp-2 leading-tight">
        {data.label}
      </span>
      <span className="text-[8px] font-mono mt-0.5" style={{ color: energyColor(data.energy) }}>
        {(data.activationScore * 100).toFixed(0)}%
      </span>
    </div>
  )
}

const nodeTypes = { neuronNode: NeuronNodeComponent }

// ── Detail panel ────────────────────────────────────────────────────────

interface NeuronDetailProps {
  neuron: NeuronSearchResult
  onClose: () => void
}

function NeuronDetail({ neuron, onClose }: NeuronDetailProps) {
  return (
    <div className="absolute right-2 top-2 z-10 w-72 bg-[var(--surface-raised)]/80 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-gray-200">Neuron Detail</span>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">
          Close
        </button>
      </div>
      <div className="px-3 py-2 space-y-2 max-h-80 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="default">{neuron.note_type}</Badge>
          <ImportanceBadge importance={neuron.importance as NoteImportance} />
          <span
            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
              neuron.source.type === 'direct'
                ? 'bg-indigo-500/15 text-indigo-400'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {neuron.source.type}
          </span>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Activation:</span>
            <span className="font-mono text-gray-300">{(neuron.activation_score * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Energy:</span>
            <span className="font-mono" style={{ color: energyColor(neuron.energy) }}>
              {(neuron.energy * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Energy bar */}
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${neuron.energy * 100}%`,
              background: `linear-gradient(to right, ${energyColor(0)}, ${energyColor(neuron.energy)})`,
            }}
          />
        </div>

        {/* Content */}
        <CollapsibleMarkdown content={neuron.content} maxHeight={120} />

        {/* Tags */}
        {neuron.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {neuron.tags.map((tag, i) => (
              <Badge key={`${tag}-${i}`} variant="default">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

interface NeuronExplorerProps {
  workspaceSlug?: string
  projectSlug?: string
}

export function NeuronExplorer({ projectSlug }: NeuronExplorerProps) {
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
        const res = await notesApi.searchNeurons({
          query: q,
          project_slug: projectSlug,
          max_results: 30,
          max_hops: 3,
        })
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 500)
  }

  const rawResults = searchResponse?.results || []
  const metadata = searchResponse?.metadata

  // Client-side quality filter: if all direct match scores are clustered in a
  // narrow band (< 5% spread), the query didn't meaningfully match anything —
  // the embedding model returns high similarity for any input.
  const { results, lowQuality } = useMemo(() => {
    if (rawResults.length === 0) return { results: rawResults, lowQuality: false }
    const directScores = rawResults
      .filter((r) => r.source.type === 'direct')
      .map((r) => r.activation_score)
    if (directScores.length < 2) return { results: rawResults, lowQuality: false }
    const maxScore = Math.max(...directScores)
    const minScore = Math.min(...directScores)
    const spread = maxScore - minScore
    // If score spread is < 5% of max, results are undifferentiated
    return { results: rawResults, lowQuality: spread < maxScore * 0.05 }
  }, [rawResults])

  // Inject `selected` flag into nodes based on our manual selection state
  const { graphNodes, graphEdges } = useMemo(() => {
    const { nodes, edges } = layoutNeurons(results)
    const withSelection = nodes.map((n) => ({
      ...n,
      selected: selectedNeuronIds.has(n.id),
    }))
    return { graphNodes: withSelection, graphEdges: edges }
  }, [results, selectedNeuronIds])

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node<NeuronNodeData>) => {
      const isMulti = event.metaKey || event.ctrlKey

      if (isMulti) {
        // Toggle this node in/out of selection
        setSelectedNeuronIds((prev) => {
          const next = new Set(prev)
          if (next.has(node.id)) {
            next.delete(node.id)
          } else {
            next.add(node.id)
          }
          return next
        })
      } else {
        // Single select: only this node
        setSelectedNeuronIds(new Set([node.id]))
      }

      // Always show detail for clicked node
      const neuron = results.find((r) => r.id === node.id)
      if (neuron) setDetailNeuron(neuron)
    },
    [results],
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNeuronIds(new Set())
    setDetailNeuron(null)
  }, [])

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
      title: 'Decay Synapses',
      description:
        'This will weaken all synapses by a small amount and prune very weak ones. This is a global operation. Continue?',
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

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={handleSearchChange}
          placeholder="Search neurons by concept..."
          className="flex-1 min-w-48"
          autoFocus
        />
      </div>

      {/* Metadata bar */}
      {metadata && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <span>
            <strong className="text-gray-200">{metadata.total_activated}</strong> activated
          </span>
          <span>
            <strong className="text-indigo-400">{metadata.direct_matches}</strong> direct
          </span>
          <span>
            <strong className="text-amber-400">{metadata.propagated_matches}</strong> propagated
          </span>
          <span className="text-gray-600">{metadata.query_time_ms}ms</span>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-1.5">
            {selectedNeuronIds.size >= 2 && (
              <Button variant="primary" size="sm" onClick={handleReinforce}>
                <Zap className="w-3.5 h-3.5 mr-1" />
                Reinforce ({selectedNeuronIds.size})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleUpdateEnergy}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Update Energy
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDecay}>
              <TrendingDown className="w-3.5 h-3.5 mr-1" />
              Decay
            </Button>
          </div>
        </div>
      )}

      {/* Low quality warning */}
      {!searching && lowQuality && results.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-800/30 text-yellow-400 text-xs">
          <span className="font-medium">Low confidence:</span>
          <span className="text-yellow-500">
            All results have nearly identical scores — the query may not meaningfully match any notes.
          </span>
        </div>
      )}

      {/* Graph / states */}
      {searching && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      )}

      {!searching && hasSearched && results.length === 0 && (
        <EmptyState
          title="No neurons activated"
          description="Try a different query. Neurons are activated through spreading activation in the knowledge graph."
        />
      )}

      {!searching && results.length > 0 && (
        <div className="relative rounded-lg border border-white/[0.06] overflow-hidden" style={{ height: 500 }}>
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

          {/* Detail panel */}
          {detailNeuron && (
            <NeuronDetail neuron={detailNeuron} onClose={() => setDetailNeuron(null)} />
          )}

          {/* Legend */}
          <div className="absolute bottom-12 left-2 z-10 flex items-center gap-3 px-2.5 py-1.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: sourceColors.direct.border }} />
              Direct
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: sourceColors.propagated.border }} />
              Propagated
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: energyColor(0) }} />
              Low E
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: energyColor(1) }} />
              High E
            </span>
          </div>
        </div>
      )}

      {!searching && !hasSearched && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-10 h-10 text-gray-600 mb-3" />
          <h3 className="text-lg font-semibold text-gray-300 mb-1">Neuron Explorer</h3>
          <p className="text-sm text-gray-500 max-w-md">
            Search for a concept to visualize the neural knowledge graph. Notes are shown as neurons connected by
            weighted synapses. Shift+click to select multiple neurons, then reinforce their connections.
          </p>
        </div>
      )}

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
