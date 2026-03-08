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
import { createNodeObject, disposeNodeCaches } from './nodeObjects'
import { ENTITY_COLORS } from '@/constants/intelligence'
import {
  selectedNodeIdAtom,
  hoveredNodeIdAtom,
  energyHeatmapAtom,
  touchesHeatmapAtom,
} from '@/atoms/intelligence'
import { activationStateAtom } from '../SpreadingActivation'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

// ── Heatmap color interpolators (THREE.Color versions) ───────────────────────

/** Energy (0→1) → Red (#EF4444) → Yellow (#F59E0B) → Green (#22C55E) */
function energyToColor3(energy: number): THREE.Color {
  const e = Math.min(1, Math.max(0, energy))
  if (e < 0.5) {
    const t = e / 0.5
    return new THREE.Color(
      (239 + (245 - 239) * t) / 255,
      (68 + (158 - 68) * t) / 255,
      (68 + (11 - 68) * t) / 255,
    )
  } else {
    const t = (e - 0.5) / 0.5
    return new THREE.Color(
      (245 + (34 - 245) * t) / 255,
      (158 + (197 - 158) * t) / 255,
      (11 + (94 - 11) * t) / 255,
    )
  }
}

/** Churn (0→1) → Dark Green (#228B5E) → Bright Green (#86EF7F) → Yellow-Green (#FACC15) */
function churnToColor3(churn: number): THREE.Color {
  const c = Math.min(1, Math.max(0, churn))
  if (c < 0.5) {
    const t = c / 0.5
    return new THREE.Color(
      (34 + (134 - 34) * t) / 255,
      (139 + (239 - 139) * t) / 255,
      (94 + (127 - 94) * t) / 255,
    )
  } else {
    const t = (c - 0.5) / 0.5
    return new THREE.Color(
      (134 + (250 - 134) * t) / 255,
      (239 + (204 - 239) * t) / 255,
      (127 + (21 - 127) * t) / 255,
    )
  }
}

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
  const energyHeatmap = useAtomValue(energyHeatmapAtom)
  const touchesHeatmap = useAtomValue(touchesHeatmapAtom)

  const { transformToGraph3D, savePositions } = useGraph3DLayout()

  // ── Cleanup cached Three.js resources on unmount ────────────────────────
  useEffect(() => {
    return () => disposeNodeCaches()
  }, [])

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

  // ── Workaround: three.js OrbitControls + DragControls pointercancel crash ──
  // When DragControls dispatches pointercancel, OrbitControls.onPointerUp tries
  // to read .x from a pointer already removed from its internal Map → TypeError.
  // We patch the renderer's domElement to catch this race condition.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handlePointerCancel = (e: PointerEvent) => {
      // Prevent the pointercancel from reaching OrbitControls.onPointerUp
      // which crashes when the pointer is already gone from its tracking Map
      e.stopPropagation()
    }

    // Use capture phase to intercept before three.js handlers
    el.addEventListener('pointercancel', handlePointerCancel, true)
    return () => el.removeEventListener('pointercancel', handlePointerCancel, true)
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
  const ACTIVATION_COLOR_EDGE = '#34D399'    // emerald-400 (active synapse edges)

  // ── Link styling (hover + selection coexist, AND spreading activation) ──
  const linkColor = useCallback((link: Graph3DLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target

    // Spreading activation — highlight active edges
    if (activation.phase !== 'idle' && activation.phase !== 'searching') {
      const edgeKey = `${sourceId}-${targetId}`
      const edgeKeyRev = `${targetId}-${sourceId}`
      if (activation.activeEdges.has(edgeKey) || activation.activeEdges.has(edgeKeyRev)) {
        return ACTIVATION_COLOR_EDGE // emerald — active synapse
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
    if (activation.phase !== 'idle' && activation.phase !== 'searching') {
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
    if (activation.phase !== 'idle' && activation.phase !== 'searching') {
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
    // Emerald for activated edges (spreading activation)
    if (activation.phase !== 'idle' && activation.phase !== 'searching') {
      const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
      const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target
      const edgeKey = `${sourceId}-${targetId}`
      const edgeKeyRev = `${targetId}-${sourceId}`
      if (activation.activeEdges.has(edgeKey) || activation.activeEdges.has(edgeKeyRev)) {
        return ACTIVATION_COLOR_EDGE
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
  // Ref-tracked approach: we keep direct references to every Three.js object
  // we've modified, so cleanup is deterministic and independent of graphData.
  const activationPhase = activation.phase

  // Dirty tracking: materials we've modified + lights we've added
  // This survives across renders and doesn't depend on graphData.nodes
  const dirtyRef = useRef<{
    materials: Map<THREE.MeshLambertMaterial, { emissive: string; emissiveIntensity: number; opacity: number }>
    lights: Set<THREE.PointLight>
    // Track what state each node was last set to, for diff-based updates
    nodeStates: Map<string, 'direct' | 'propagated' | 'dimmed'>
  }>({ materials: new Map(), lights: new Set(), nodeStates: new Map() })

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return

    const EMERALD = new THREE.Color('#34D399')  // direct activation
    const VIOLET = new THREE.Color('#A78BFA')   // propagated activation
    const isActive = activationPhase !== 'idle' && activationPhase !== 'searching'
    const dirty = dirtyRef.current

    // During 'searching' phase, don't touch materials — keep previous state visible
    if (activationPhase === 'searching') return

    // ── DEACTIVATION: restore all tracked dirty objects ──────────────────
    if (!isActive) {
      // Restore all modified materials from saved originals
      for (const [mat, orig] of dirty.materials) {
        mat.emissive = new THREE.Color(orig.emissive)
        mat.emissiveIntensity = orig.emissiveIntensity
        mat.opacity = orig.opacity
        mat.needsUpdate = true
      }
      dirty.materials.clear()

      // Remove all tracked PointLights (two-pass: collect then remove)
      for (const light of dirty.lights) {
        light.parent?.remove(light)
      }
      dirty.lights.clear()

      // Clear node state tracking
      dirty.nodeStates.clear()
      return
    }

    // ── ACTIVE PHASE: diff-based material updates per-node ──────────────
    // Determine desired state for each node, only mutate if it changed
    const newNodeStates = new Map<string, 'direct' | 'propagated' | 'dimmed'>()

    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isDirect = activation.directIds.has(node.id)
      const isPropagated = activation.propagatedIds.has(node.id)
      const desiredState: 'direct' | 'propagated' | 'dimmed' = isDirect ? 'direct' : isPropagated ? 'propagated' : 'dimmed'
      const score = activation.scores.get(node.id) ?? 0
      newNodeStates.set(node.id, desiredState)

      // Diff check: skip if this node's state hasn't changed
      const prevState = dirty.nodeStates.get(node.id)
      if (prevState === desiredState && desiredState === 'dimmed') continue
      // For lit nodes, score may change between propagation waves, so always update

      const isLit = isDirect || isPropagated

      // ── PointLight management ──
      // Remove existing activation light if present
      const existingLight = obj.children.find((c): c is THREE.PointLight => c instanceof THREE.PointLight && c.userData.__act__)
      if (existingLight) {
        obj.remove(existingLight)
        dirty.lights.delete(existingLight)
      }

      // Add PointLight on activated nodes
      if (isLit) {
        const lightColor = isDirect ? 0x34D399 : 0xA78BFA
        const intensity = isDirect ? 80 + score * 120 : 40 + score * 80
        const distance = isDirect ? 120 : 80
        const pointLight = new THREE.PointLight(lightColor, intensity, distance, 1.5)
        pointLight.userData.__act__ = true
        obj.add(pointLight)
        dirty.lights.add(pointLight)
      }

      // ── Material updates ──
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
          const mat = child.material

          // Save original on first touch (track in ref, not on userData)
          if (!dirty.materials.has(mat)) {
            dirty.materials.set(mat, {
              emissive: '#' + mat.emissive.getHexString(),
              emissiveIntensity: mat.emissiveIntensity,
              opacity: mat.opacity,
            })
          }

          if (isDirect) {
            mat.emissive = EMERALD
            mat.emissiveIntensity = 0.8 + score * 0.6
            mat.opacity = 1.0
          } else if (isPropagated) {
            mat.emissive = VIOLET
            mat.emissiveIntensity = 0.5 + score * 0.5
            mat.opacity = 0.95
          } else {
            // Dim non-activated nodes
            const orig = dirty.materials.get(mat)!
            mat.emissive = new THREE.Color(orig.emissive)
            mat.emissiveIntensity = 0.05
            mat.opacity = 0.15
          }
          mat.needsUpdate = true
        }
      })
    }

    dirty.nodeStates = newNodeStates
  }, [activationPhase, activation.directIds, activation.propagatedIds, activation.scores, graphData.nodes])

  // ── Heatmap overlays — energy (notes) & churn (files) ────────────────────
  // Same ref-tracked pattern: save originals, mutate, restore on toggle off.
  const heatmapDirtyRef = useRef<Map<THREE.MeshLambertMaterial, { emissive: string; emissiveIntensity: number; opacity: number }>>(new Map())

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return

    const isAnyHeatmap = energyHeatmap || touchesHeatmap
    const hDirty = heatmapDirtyRef.current

    // Skip if spreading activation is running — it takes priority
    if (activationPhase !== 'idle' && activationPhase !== 'searching') {
      // Still clean up heatmap state if it was active before activation started
      if (hDirty.size > 0) {
        for (const [mat, orig] of hDirty) {
          mat.emissive = new THREE.Color(orig.emissive)
          mat.emissiveIntensity = orig.emissiveIntensity
          mat.opacity = orig.opacity
          mat.needsUpdate = true
        }
        hDirty.clear()
      }
      return
    }

    // ── DEACTIVATION: restore all heatmap-modified materials ──
    if (!isAnyHeatmap) {
      for (const [mat, orig] of hDirty) {
        mat.emissive = new THREE.Color(orig.emissive)
        mat.emissiveIntensity = orig.emissiveIntensity
        mat.opacity = orig.opacity
        mat.needsUpdate = true
      }
      hDirty.clear()
      return
    }

    // ── ACTIVE: color nodes by energy/churn ──
    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      // Energy heatmap: note nodes colored red→yellow→green by energy
      const isNote = node.entityType === 'note'
      const isFile = node.entityType === 'file'

      if (energyHeatmap && isNote) {
        const energy = Math.min(1, Math.max(0, (node.data.energy as number) ?? 0))
        const heatColor = energyToColor3(energy)

        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
            const mat = child.material
            if (!hDirty.has(mat)) {
              hDirty.set(mat, {
                emissive: '#' + mat.emissive.getHexString(),
                emissiveIntensity: mat.emissiveIntensity,
                opacity: mat.opacity,
              })
            }
            mat.emissive = heatColor
            mat.emissiveIntensity = 0.4 + energy * 0.6
            mat.opacity = 0.6 + energy * 0.4
            mat.needsUpdate = true
          }
        })
      } else if (touchesHeatmap && isFile) {
        // Churn heatmap: file nodes colored by churn score (green intensity)
        const attrs = node.data.attributes as Record<string, unknown> | undefined
        const churn = Math.min(1, Math.max(0, (attrs?.churnScore as number) ?? (node.data.churnScore as number) ?? 0))
        if (churn <= 0) continue

        const heatColor = churnToColor3(churn)

        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
            const mat = child.material
            if (!hDirty.has(mat)) {
              hDirty.set(mat, {
                emissive: '#' + mat.emissive.getHexString(),
                emissiveIntensity: mat.emissiveIntensity,
                opacity: mat.opacity,
              })
            }
            mat.emissive = heatColor
            mat.emissiveIntensity = 0.3 + churn * 0.7
            mat.opacity = 0.6 + churn * 0.4
            mat.needsUpdate = true
          }
        })
      } else if (isAnyHeatmap && !isNote && !isFile) {
        // Dim unrelated nodes when a heatmap is active
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
            const mat = child.material
            if (!hDirty.has(mat)) {
              hDirty.set(mat, {
                emissive: '#' + mat.emissive.getHexString(),
                emissiveIntensity: mat.emissiveIntensity,
                opacity: mat.opacity,
              })
            }
            mat.emissiveIntensity = 0.05
            mat.opacity = 0.2
            mat.needsUpdate = true
          }
        })
      }
    }
  }, [energyHeatmap, touchesHeatmap, graphData.nodes, activationPhase])

  // ── Spreading Activation — zoom camera to activated cluster ──────────────
  const prevActivationPhaseRef = useRef<string>('idle')
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.cameraPosition !== 'function') return

    // Zoom when transitioning into 'direct' phase (results just arrived)
    const wasIdle = prevActivationPhaseRef.current === 'idle' || prevActivationPhaseRef.current === 'searching'
    prevActivationPhaseRef.current = activationPhase

    if (!wasIdle || (activationPhase !== 'direct' && activationPhase !== 'done')) return

    const allActivated = new Set([...activation.directIds, ...activation.propagatedIds])
    if (allActivated.size === 0) return

    // Compute centroid of activated nodes
    let cx = 0, cy = 0, cz = 0, count = 0
    let maxDist = 0
    const positions: { x: number; y: number; z: number }[] = []

    for (const node of graphData.nodes) {
      if (!allActivated.has(node.id)) continue
      const x = node.x ?? 0
      const y = node.y ?? 0
      const z = node.z ?? 0
      cx += x; cy += y; cz += z; count++
      positions.push({ x, y, z })
    }

    if (count === 0) return
    cx /= count; cy /= count; cz /= count

    // Compute radius of the activated cluster
    for (const p of positions) {
      const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2)
      if (d > maxDist) maxDist = d
    }

    // Position camera at a distance proportional to cluster radius
    const dist = Math.max(maxDist * 2.5, 120)
    // Offset camera along a diagonal for better perspective
    const angle = Math.atan2(cy, cx)
    const camX = cx + dist * Math.cos(angle + 0.3)
    const camY = cy + dist * 0.4
    const camZ = cz + dist * Math.sin(angle + 0.3)

    fg.cameraPosition(
      { x: camX, y: camY, z: camZ }, // new position
      { x: cx, y: cy, z: cz },       // lookAt
      1200,                            // transition duration ms
    )
  }, [activationPhase, activation.directIds, activation.propagatedIds, graphData.nodes])

  // ── Selected node highlight — persistent emissive ring on click ─────────
  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return
    // Skip if activation is running (but not searching) — it overrides materials
    if (activation.phase !== 'idle' && activation.phase !== 'searching') { prevSelectedRef.current = selectedNodeId; return }

    // Reset previous selected node
    if (prevSelectedRef.current && prevSelectedRef.current !== selectedNodeId) {
      const prevNode = graphData.nodes.find((n) => n.id === prevSelectedRef.current)
      const prevObj = (prevNode as Graph3DNode & { __threeObj?: THREE.Object3D } | undefined)?.__threeObj
      if (prevObj) {
        prevObj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
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
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
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
