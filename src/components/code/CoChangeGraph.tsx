import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react'
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui'
import { GitBranch } from 'lucide-react'
import { commitsApi, projectsApi } from '@/services'
import type { CoChangeEdge } from '@/types'
import '@xyflow/react/dist/style.css'

// ── Types ───────────────────────────────────────────────────────────────

interface CoChangeGraphProps {
  projectSlug: string
}

interface FileNodeData extends Record<string, unknown> {
  label: string
  fullPath: string
  directory: string
}

// ── Directory color palette ─────────────────────────────────────────────

const DIR_COLORS = [
  { bg: '#1e1b4b', border: '#6366f1', text: '#a5b4fc' },
  { bg: '#052e16', border: '#22c55e', text: '#86efac' },
  { bg: '#422006', border: '#d97706', text: '#fcd34d' },
  { bg: '#1a1a2e', border: '#e94560', text: '#fca5a5' },
  { bg: '#0c1a3a', border: '#3b82f6', text: '#93c5fd' },
  { bg: '#2d1b36', border: '#a855f7', text: '#d8b4fe' },
  { bg: '#1a2e2e', border: '#14b8a6', text: '#99f6e4' },
  { bg: '#2e1a1a', border: '#f97316', text: '#fed7aa' },
]

function getDirectory(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
}

function getBasename(path: string): string {
  return path.split('/').pop() || path
}

// ── Custom node ─────────────────────────────────────────────────────────

function FileNode({ data }: NodeProps<Node<FileNodeData>>) {
  const dirIndex = data.directory ? Math.abs(hashString(data.directory)) % DIR_COLORS.length : 0
  const colors = DIR_COLORS[dirIndex]

  return (
    <div
      className="px-3 py-2 rounded-lg border text-xs font-mono shadow-md max-w-[180px]"
      style={{ background: colors.bg, borderColor: colors.border, color: colors.text }}
      title={data.fullPath}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-600 !w-1.5 !h-1.5" />
      <div className="truncate">{data.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-gray-600 !w-1.5 !h-1.5" />
    </div>
  )
}

function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i)
    hash |= 0
  }
  return hash
}

const nodeTypes = { fileNode: FileNode }

// ── Edge color interpolation ────────────────────────────────────────────

function edgeColor(confidence: number): string {
  // Low confidence → gray, high confidence → indigo
  const r = Math.round(100 + (99 - 100) * confidence)
  const g = Math.round(100 + (102 - 100) * confidence)
  const b = Math.round(100 + (241 - 100) * confidence)
  return `rgb(${r}, ${g}, ${b})`
}

// ── Force-directed layout (simple) ──────────────────────────────────────

function layoutNodes(nodeIds: string[], edges: CoChangeEdge[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  // Place nodes in a circle initially
  const count = nodeIds.length
  const radius = Math.max(200, count * 30)
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / count
    positions.set(id, {
      x: radius * Math.cos(angle) + radius,
      y: radius * Math.sin(angle) + radius,
    })
  })

  // Simple force-directed iterations
  const iterations = 50
  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all nodes
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = positions.get(nodeIds[i])!
        const b = positions.get(nodeIds[j])!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 5000 / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.x -= fx
        a.y -= fy
        b.x += fx
        b.y += fy
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = positions.get(edge.file_a)
      const b = positions.get(edge.file_b)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = dist * 0.01 * edge.co_change_count
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.x += fx
      a.y += fy
      b.x -= fx
      b.y -= fy
    }
  }

  return positions
}

// ── Main component ──────────────────────────────────────────────────────

export function CoChangeGraph({ projectSlug }: CoChangeGraphProps) {
  const [edges, setEdges] = useState<CoChangeEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [minCount, setMinCount] = useState(2)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Resolve slug → project ID first
        const project = await projectsApi.get(projectSlug)
        const res = await commitsApi.getCoChangeGraph(project.id)
        setEdges(res.edges || [])
      } catch {
        setEdges([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectSlug])

  const filteredEdges = useMemo(
    () => edges.filter((e) => e.co_change_count >= minCount),
    [edges, minCount],
  )

  const maxCount = useMemo(
    () => Math.max(1, ...filteredEdges.map((e) => e.co_change_count)),
    [filteredEdges],
  )

  const { flowNodes, flowEdges } = useMemo(() => {
    // Collect unique files
    const fileSet = new Set<string>()
    for (const e of filteredEdges) {
      fileSet.add(e.file_a)
      fileSet.add(e.file_b)
    }
    const fileIds = Array.from(fileSet)
    const positions = layoutNodes(fileIds, filteredEdges)

    const flowNodes: Node<FileNodeData>[] = fileIds.map((f) => {
      const pos = positions.get(f) || { x: 0, y: 0 }
      return {
        id: f,
        type: 'fileNode',
        position: pos,
        data: {
          label: getBasename(f),
          fullPath: f,
          directory: getDirectory(f),
        },
      }
    })

    const flowEdges: Edge[] = filteredEdges.map((e, i) => ({
      id: `e-${i}`,
      source: e.file_a,
      target: e.file_b,
      style: {
        stroke: edgeColor(e.co_change_count / maxCount),
        strokeWidth: Math.max(1, Math.min(6, (e.co_change_count / maxCount) * 6)),
        opacity: 0.7,
      },
      label: `×${e.co_change_count}`,
      labelStyle: { fill: '#9ca3af', fontSize: 10, fontFamily: 'monospace' },
      labelBgStyle: { fill: '#18181b', fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
    }))

    return { flowNodes, flowEdges }
  }, [filteredEdges, maxCount])

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 100)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12">
        <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Loading co-change graph...</span>
      </div>
    )
  }

  if (edges.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="w-8 h-8 text-gray-500" />}
        title="No co-change data available"
        description="Co-change data is built from commit history. Register commits with file changes to populate this graph."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-gray-500" />
            <CardTitle>Co-Change Graph</CardTitle>
            <span className="text-xs text-gray-500">
              {flowNodes.length} files · {flowEdges.length} relationships
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Min co-changes:</label>
            <input
              type="range"
              min={1}
              max={Math.max(10, maxCount)}
              value={minCount}
              onChange={(e) => setMinCount(Number(e.target.value))}
              className="w-24 h-1 accent-indigo-500"
            />
            <span className="text-xs text-gray-400 font-mono w-6 text-right">{minCount}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[500px] bg-zinc-950 rounded-b-lg">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onInit={onInit}
            fitView
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#27272a" gap={20} />
            <Controls className="!bg-zinc-800 !border-white/[0.1] !shadow-lg [&>button]:!bg-zinc-800 [&>button]:!border-white/[0.06] [&>button]:!text-gray-400 [&>button:hover]:!bg-zinc-700" />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  )
}
