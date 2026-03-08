// ============================================================================
// IntelligenceGraph3D — 3D force-directed graph visualization
// ============================================================================
//
// Uses react-force-graph-3d with deterministic layout (seeded PRNG).
// Stable on refresh — only relayouts when >20% nodes change.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import { useAtomValue, useSetAtom } from 'jotai'
import * as THREE from 'three'

import { useGraph3DLayout, type Graph3DNode, type Graph3DLink } from './useGraph3DLayout'
import { createNodeObject } from './nodeObjects'
import { ENTITY_COLORS } from '@/constants/intelligence'
import {
  selectedNodeIdAtom,
  hoveredNodeIdAtom,
} from '@/atoms/intelligence'
import { activationStateAtom } from '../SpreadingActivation'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntelligenceGraph3DProps {
  nodes: IntelligenceNode[]
  edges: IntelligenceEdge[]
}

// ── Component ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphRef = any // ForceGraph3D ref methods are dynamically extended

export default function IntelligenceGraph3D({ nodes, edges }: IntelligenceGraph3DProps) {
  const graphRef = useRef<GraphRef>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const hoveredNodeId = useAtomValue(hoveredNodeIdAtom)
  const setHoveredNodeId = useSetAtom(hoveredNodeIdAtom)
  const activation = useAtomValue(activationStateAtom)

  const { transformToGraph3D, savePositions } = useGraph3DLayout()

  // ── Container sizing ────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDimensions({ width, height })
        }
      }
    })

    observer.observe(el)
    // initial measurement
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height })
    }

    return () => observer.disconnect()
  }, [])

  // ── Transform data ──────────────────────────────────────────────────────
  const { data: graphData, needsRelayout } = useMemo(
    () => transformToGraph3D(nodes, edges),
    [nodes, edges, transformToGraph3D],
  )

  // ── Control simulation based on relayout need ───────────────────────────
  // The ref methods (cooldownTicks, etc.) are only available after the
  // ForceGraph3D component has fully mounted. Guard with method existence check.
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.cooldownTicks !== 'function') return

    if (!needsRelayout && graphData.nodes.length > 0) {
      // Freeze the simulation — positions are already cached
      fg.cooldownTicks(0)
    } else {
      // Let simulation run briefly to settle new nodes
      fg.cooldownTicks(80)
      fg.cooldownTime?.(3000)
    }
  }, [needsRelayout, graphData])

  // ── Save positions when simulation stops ────────────────────────────────
  const onEngineStop = useCallback(() => {
    if (graphData.nodes.length > 0) {
      savePositions(graphData.nodes)
    }
  }, [graphData.nodes, savePositions])

  // ── Highlight: hover AND selection coexist simultaneously ──────────────
  const hasAnyHighlight = !!hoveredNodeId || !!selectedNodeId

  // ── Node color ──────────────────────────────────────────────────────────
  const nodeColor = useCallback((node: Graph3DNode) => {
    return ENTITY_COLORS[node.entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
  }, [])

  // ── Node size ───────────────────────────────────────────────────────────
  const nodeVal = useCallback((node: Graph3DNode) => {
    const sizes: Record<string, number> = {
      file: 4,
      function: 2,
      struct: 3,
      trait: 2.5,
      enum: 2,
      plan: 6,
      task: 4,
      step: 1,
      milestone: 3.5,
      release: 3,
      commit: 1.5,
      note: 3,
      decision: 4,
      constraint: 2,
      skill: 5,
      protocol: 5,
      protocol_state: 3,
      feature_graph: 5,
    }
    return sizes[node.entityType] ?? 2
  }, [])

  // ── Node label ──────────────────────────────────────────────────────────
  const nodeLabel = useCallback((node: Graph3DNode) => {
    return `<div style="
      background: rgba(15, 23, 42, 0.9);
      color: #e2e8f0;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      border: 1px solid ${ENTITY_COLORS[node.entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'};
      max-width: 300px;
    ">
      <div style="font-weight: 600; margin-bottom: 2px;">${node.label}</div>
      <div style="color: #94a3b8; font-size: 10px;">${node.entityType} · ${node.layer}</div>
    </div>`
  }, [])

  // ── Node 3D object ──────────────────────────────────────────────────────
  const nodeThreeObject = useCallback((node: Graph3DNode) => {
    return createNodeObject(node)
  }, [])

  // ── Highlight colors ─────────────────────────────────────────────────────
  const HIGHLIGHT_COLOR_HOVER = '#F59E0B'   // amber-500
  const HIGHLIGHT_COLOR_SELECT = '#22D3EE'  // cyan-400

  // ── Link styling (hover + selection coexist, AND spreading activation) ──
  const linkColor = useCallback((link: Graph3DLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target

    // Spreading activation — highlight active edges
    if (activation.phase !== 'idle') {
      const edgeKey = `${sourceId}-${targetId}`
      const edgeKeyRev = `${targetId}-${sourceId}`
      if (activation.activeEdges.has(edgeKey) || activation.activeEdges.has(edgeKeyRev)) {
        return '#22D3EE' // cyan — active synapse
      }
      const allActivated = new Set([...activation.directIds, ...activation.propagatedIds])
      if (allActivated.has(sourceId) && allActivated.has(targetId)) {
        return link.color
      }
      return 'rgba(107, 114, 128, 0.05)'
    }

    // Hover (amber) AND selection (cyan) coexist — hover takes visual priority on shared edges
    if (hasAnyHighlight) {
      const isHoverConnected = hoveredNodeId
        ? (sourceId === hoveredNodeId || targetId === hoveredNodeId)
        : false
      const isSelectConnected = selectedNodeId
        ? (sourceId === selectedNodeId || targetId === selectedNodeId)
        : false
      if (isHoverConnected) return HIGHLIGHT_COLOR_HOVER
      if (isSelectConnected) return HIGHLIGHT_COLOR_SELECT
      return 'rgba(107, 114, 128, 0.08)'
    }
    return link.color
  }, [hoveredNodeId, selectedNodeId, hasAnyHighlight, activation])

  const linkWidth = useCallback((link: Graph3DLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target

    // Spreading activation — boost active edges
    if (activation.phase !== 'idle') {
      const edgeKey = `${sourceId}-${targetId}`
      const edgeKeyRev = `${targetId}-${sourceId}`
      if (activation.activeEdges.has(edgeKey) || activation.activeEdges.has(edgeKeyRev)) {
        return link.width * 3
      }
      return link.width * 0.2
    }

    if (hasAnyHighlight) {
      const isHoverConnected = hoveredNodeId
        ? (sourceId === hoveredNodeId || targetId === hoveredNodeId)
        : false
      const isSelectConnected = selectedNodeId
        ? (sourceId === selectedNodeId || targetId === selectedNodeId)
        : false
      return (isHoverConnected || isSelectConnected) ? link.width * 2 : link.width * 0.3
    }
    return link.width
  }, [hoveredNodeId, selectedNodeId, hasAnyHighlight, activation])

  const linkParticles = useCallback((link: Graph3DLink) => {
    // Boost particles on activated synapse edges
    if (activation.phase !== 'idle') {
      const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
      const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target
      const edgeKey = `${sourceId}-${targetId}`
      const edgeKeyRev = `${targetId}-${sourceId}`
      if (activation.activeEdges.has(edgeKey) || activation.activeEdges.has(edgeKeyRev)) {
        return 6 // extra particles for visual emphasis
      }
    }
    return link.particles
  }, [activation])

  const linkParticleSpeed = useCallback((link: Graph3DLink) => {
    return link.particleSpeed
  }, [])

  const linkParticleColor = useCallback((link: Graph3DLink) => {
    // Cyan for activated edges (spreading activation)
    if (activation.phase !== 'idle') {
      const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
      const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target
      const edgeKey = `${sourceId}-${targetId}`
      const edgeKeyRev = `${targetId}-${sourceId}`
      if (activation.activeEdges.has(edgeKey) || activation.activeEdges.has(edgeKeyRev)) {
        return '#22D3EE'
      }
    }
    // Tint particles: hover = amber, select = cyan (hover wins on shared edges)
    if (hasAnyHighlight) {
      const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
      const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target
      const isHoverConnected = hoveredNodeId
        ? (sourceId === hoveredNodeId || targetId === hoveredNodeId)
        : false
      const isSelectConnected = selectedNodeId
        ? (sourceId === selectedNodeId || targetId === selectedNodeId)
        : false
      if (isHoverConnected) return HIGHLIGHT_COLOR_HOVER
      if (isSelectConnected) return HIGHLIGHT_COLOR_SELECT
    }
    return link.color
  }, [activation, hoveredNodeId, selectedNodeId, hasAnyHighlight])

  // ── Node opacity based on hover or selection ───────────────────────────
  const nodeOpacity = useMemo(() => {
    return hasAnyHighlight ? 0.3 : 1.0
  }, [hasAnyHighlight])

  // ── Spreading Activation — live 3D material updates ───────────────────
  // Mutate Three.js materials directly when activation state changes.
  const activationPhase = activation.phase
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return
    const scene = fg.scene()
    if (!scene) return

    const CYAN = new THREE.Color('#22D3EE')
    const VIOLET = new THREE.Color('#A78BFA')
    const isActive = activationPhase !== 'idle'

    // Traverse all nodes in the graph data to update their materials
    for (const node of graphData.nodes) {
      // ForceGraph stores the Three.js object on node.__threeObj
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isDirect = activation.directIds.has(node.id)
      const isPropagated = activation.propagatedIds.has(node.id)
      const score = activation.scores.get(node.id) ?? 0

      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhongMaterial) {
          const mat = child.material
          if (isDirect) {
            mat.emissive = CYAN
            mat.emissiveIntensity = 0.6 + score * 0.4
            mat.opacity = 1.0
          } else if (isPropagated) {
            mat.emissive = VIOLET
            mat.emissiveIntensity = 0.3 + score * 0.5
            mat.opacity = 0.95
          } else if (isActive) {
            // Dim non-activated nodes during spreading activation
            const baseColor = ENTITY_COLORS[node.entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
            mat.emissive = new THREE.Color(baseColor)
            mat.emissiveIntensity = 0.05
            mat.opacity = 0.2
          } else {
            // Reset to default
            const baseColor = ENTITY_COLORS[node.entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
            const energy = (node.data.energy as number) ?? 0
            mat.emissive = new THREE.Color(baseColor)
            mat.emissiveIntensity = 0.15 + energy * 0.3
            mat.opacity = 0.9
          }
          mat.needsUpdate = true
        }
      })
    }
  }, [activationPhase, activation.directIds, activation.propagatedIds, activation.scores, graphData.nodes])

  // ── Selected node highlight — persistent emissive ring on click ─────────
  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return
    // Skip if activation is running — it overrides materials
    if (activation.phase !== 'idle') { prevSelectedRef.current = selectedNodeId; return }

    // Reset previous selected node
    if (prevSelectedRef.current && prevSelectedRef.current !== selectedNodeId) {
      const prevNode = graphData.nodes.find((n) => n.id === prevSelectedRef.current)
      const prevObj = (prevNode as Graph3DNode & { __threeObj?: THREE.Object3D } | undefined)?.__threeObj
      if (prevObj) {
        prevObj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhongMaterial) {
            const baseColor = ENTITY_COLORS[prevNode!.entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
            const energy = (prevNode!.data.energy as number) ?? 0
            child.material.emissive = new THREE.Color(baseColor)
            child.material.emissiveIntensity = 0.15 + energy * 0.3
            child.material.opacity = 0.9
            child.material.needsUpdate = true
          }
        })
      }
    }

    // Highlight newly selected node — cyan tint
    if (selectedNodeId) {
      const selNode = graphData.nodes.find((n) => n.id === selectedNodeId)
      const selObj = (selNode as Graph3DNode & { __threeObj?: THREE.Object3D } | undefined)?.__threeObj
      if (selObj) {
        selObj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhongMaterial) {
            child.material.emissive = new THREE.Color(HIGHLIGHT_COLOR_SELECT)
            child.material.emissiveIntensity = 0.7
            child.material.opacity = 1.0
            child.material.needsUpdate = true
          }
        })
      }
    }

    prevSelectedRef.current = selectedNodeId
  }, [selectedNodeId, graphData.nodes, activation.phase])

  // ── Interactions ────────────────────────────────────────────────────────
  const onNodeClick = useCallback((node: Graph3DNode) => {
    setSelectedNodeId(node.id === selectedNodeId ? null : node.id)
  }, [selectedNodeId, setSelectedNodeId])

  const onNodeHover = useCallback((node: Graph3DNode | null) => {
    setHoveredNodeId(node?.id ?? null)
    // Change cursor
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default'
    }
  }, [setHoveredNodeId])

  const onBackgroundClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [setSelectedNodeId])

  // ── Keyboard: Esc to deselect ───────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNodeId(null)
        setHoveredNodeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSelectedNodeId, setHoveredNodeId])

  // ── Scene config ────────────────────────────────────────────────────────
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return

    // Dark background
    const scene = fg.scene()
    if (scene) {
      scene.background = new THREE.Color('#0f172a')

      // Add ambient light for better visibility
      const existingAmbient = scene.children.find((c: THREE.Object3D) => c instanceof THREE.AmbientLight)
      if (!existingAmbient) {
        scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        scene.add(new THREE.DirectionalLight(0xffffff, 0.4))
      }
    }
  }, [graphData]) // re-run when data changes (graph mounts)

  // ── Force configuration ─────────────────────────────────────────────────
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.d3Force !== 'function') return

    // Weaken default charge to prevent too much repulsion
    fg.d3Force('charge')?.strength(-30)
    // Moderate link distance
    fg.d3Force('link')?.distance((link: Graph3DLink) => {
      // Shorter for same-layer links
      const sourceLayer = typeof link.source === 'object' ? (link.source as Graph3DNode).layer : ''
      const targetLayer = typeof link.target === 'object' ? (link.target as Graph3DNode).layer : ''
      return sourceLayer === targetLayer ? 40 : 80
    })
  }, [graphData])

  return (
    <div ref={containerRef} className="absolute inset-0">
      {graphData.nodes.length > 0 && (
        <ForceGraph3D<Graph3DNode, Graph3DLink>
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          // Node styling
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeLabel={nodeLabel}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          nodeOpacity={nodeOpacity}
          nodeResolution={12}
          // Link styling
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={0.6}
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleSpeed={linkParticleSpeed}
          linkDirectionalParticleColor={linkParticleColor}
          linkDirectionalParticleWidth={1.5}
          // Interactions
          onNodeClick={onNodeClick}
          onNodeHover={onNodeHover}
          onNodeDragEnd={(node: Graph3DNode) => {
            // Pin position after drag
            node.fx = node.x
            node.fy = node.y
            node.fz = node.z
            savePositions([node])
          }}
          onBackgroundClick={onBackgroundClick}
          // Force engine
          cooldownTicks={100}
          cooldownTime={5000}
          warmupTicks={30}
          onEngineStop={onEngineStop}
          // Controls
          controlType="orbit"
          enableNavigationControls
          showNavInfo={false}
          // Background
          backgroundColor="#0f172a"
        />
      )}
    </div>
  )
}
