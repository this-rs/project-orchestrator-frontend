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
import { createNodeObject, disposeNodeCaches, setNodeQuality, getNodeQuality } from './nodeObjects'
import { buildCommunityHulls, disposeCommunityHulls, type CommunityHullGroup } from './CommunityHulls3D'
import { ENTITY_COLORS } from '@/constants/intelligence'
import {
  selectedNodeIdAtom,
  hoveredNodeIdAtom,
  energyHeatmapAtom,
  touchesHeatmapAtom,
  showCommunityHullsAtom,
  legendHoveredTypeAtom,
  hoveredProjectSlugAtom,
  highlightedGroupAtom,
  graphBrightnessAtom,
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
  /** Callback when a node is double-clicked (fractal drill-down) */
  onNodeDoubleClick?: (nodeId: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphRef = any // ForceGraph3D ref methods are dynamically extended

export default function IntelligenceGraph3D({ nodes, edges, onNodeDoubleClick }: IntelligenceGraph3DProps) {
  const graphRef = useRef<GraphRef>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const selectedNodeId = useAtomValue(selectedNodeIdAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const hoveredNodeId = useAtomValue(hoveredNodeIdAtom)
  const setHoveredNodeId = useSetAtom(hoveredNodeIdAtom)
  const activation = useAtomValue(activationStateAtom)
  const energyHeatmap = useAtomValue(energyHeatmapAtom)
  const touchesHeatmap = useAtomValue(touchesHeatmapAtom)
  const showCommunityHulls = useAtomValue(showCommunityHullsAtom)
  const legendHoveredType = useAtomValue(legendHoveredTypeAtom)
  const hoveredProjectSlug = useAtomValue(hoveredProjectSlugAtom)
  const highlightedGroup = useAtomValue(highlightedGroupAtom)
  const brightness = useAtomValue(graphBrightnessAtom)

  const { transformToGraph3D, savePositions } = useGraph3DLayout()

  // ── Community hulls ref ───────────────────────────────────────────────
  const communityHullsRef = useRef<CommunityHullGroup | null>(null)

  // ── Cleanup cached Three.js resources on unmount ────────────────────────
  useEffect(() => {
    return () => {
      disposeNodeCaches()
      // Dispose community hulls if any
      if (communityHullsRef.current) {
        disposeCommunityHulls(communityHullsRef.current)
        communityHullsRef.current = null
      }
    }
  }, [])

  // ── Container sizing ────────────────────────────────────────────────────
  // Measure via ResizeObserver + fullscreenchange + window resize.
  // The parent container may enter fullscreen (requestFullscreen on
  // IntelligenceGraphPage's div), which changes our absolute-inset-0 size.
  // ResizeObserver sometimes misses fullscreen transitions, so we also
  // listen for fullscreenchange and window resize as fallbacks.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setDimensions((prev) => {
          // Only update if dimensions actually changed (avoid unnecessary re-renders)
          if (Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1) {
            return prev
          }
          return { width: rect.width, height: rect.height }
        })
      }
    }

    const observer = new ResizeObserver(() => measure())
    observer.observe(el)

    // Initial measurement
    measure()

    // Fullscreen transitions: the browser may not fire ResizeObserver
    // synchronously when entering/exiting fullscreen. Listen to the event
    // and re-measure after a short delay to let layout settle.
    const onFullscreenChange = () => {
      // Immediate measurement + delayed re-measurement (layout may settle async)
      measure()
      setTimeout(measure, 50)
      setTimeout(measure, 200)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)

    // Window resize fallback (covers edge cases like Tauri window resize)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('resize', measure)
    }
  }, [])

  // ── Force renderer resize on fullscreen transitions ─────────────────────
  // react-force-graph-3d updates width/height via three-render-objects props,
  // but after fullscreen transitions the internal renderer may lag behind.
  // We only force-resize when dimensions change significantly (>50px delta),
  // which avoids interfering with the library's own init cycle on first mount.
  const prevDimensionsRef = useRef(dimensions)
  useEffect(() => {
    const prev = prevDimensionsRef.current
    prevDimensionsRef.current = dimensions

    // Skip small changes (initial mount jitter, sub-pixel rounding)
    const dw = Math.abs(dimensions.width - prev.width)
    const dh = Math.abs(dimensions.height - prev.height)
    if (dw < 50 && dh < 50) return

    const fg = graphRef.current
    if (!fg) return

    // Delay to let react-force-graph-3d process its own width/height prop update first
    const timer = setTimeout(() => {
      try {
        if (typeof fg.renderer === 'function') {
          const renderer = fg.renderer()
          if (renderer) {
            // updateStyle: false — don't override the canvas CSS that the library manages
            renderer.setSize(dimensions.width, dimensions.height, false)
          }
        }
        if (typeof fg.camera === 'function') {
          const camera = fg.camera()
          if (camera && 'aspect' in camera) {
            camera.aspect = dimensions.width / dimensions.height
            camera.updateProjectionMatrix()
          }
        }
      } catch {
        // ForceGraph3D may not be fully mounted — silently ignore
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [dimensions])

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

  // ── Dynamic LOD — adjust quality BEFORE nodeThreeObject runs ──────────
  useMemo(() => {
    setNodeQuality(graphData.nodes.length)
  }, [graphData.nodes.length])

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

  // ── Community hulls — rebuild when data changes or toggle flips ────────
  // graphData.nodes positions are mutable (d3-force updates x/y/z in-place),
  // so we rebuild hulls on engine stop (positions final) and on toggle change.
  const hullNeedsRebuildRef = useRef(false)

  // Mark for rebuild when toggle changes or data changes
  useEffect(() => {
    hullNeedsRebuildRef.current = true
  }, [showCommunityHulls, graphData.nodes])

  // Actually build hulls — called from onEngineStop and on toggle
  const rebuildCommunityHulls = useCallback(() => {
    try {
      const fg = graphRef.current
      if (!fg || typeof fg.scene !== 'function') return

      const scene = fg.scene()
      if (!scene) return

      // Remove previous hulls
      if (communityHullsRef.current) {
        scene.remove(communityHullsRef.current.group)
        disposeCommunityHulls(communityHullsRef.current)
        communityHullsRef.current = null
      }

      if (!showCommunityHulls || graphData.nodes.length === 0) return

      // Only build if any node has a communityId
      const hasCommunities = graphData.nodes.some((n) => n.communityId != null)
      if (!hasCommunities) return

      const hullGroup = buildCommunityHulls(graphData.nodes)
      if (hullGroup.hulls.length > 0) {
        scene.add(hullGroup.group)
        communityHullsRef.current = hullGroup
      }
    } catch (err) {
      console.warn('[IntelligenceGraph3D] community hulls error:', err)
    }
  }, [showCommunityHulls, graphData.nodes])

  // Rebuild when toggle changes (immediate — user clicked the button)
  useEffect(() => {
    // Small delay to let ForceGraph3D mount its scene
    const timer = setTimeout(() => rebuildCommunityHulls(), 100)
    return () => clearTimeout(timer)
  }, [showCommunityHulls, rebuildCommunityHulls])

  // ── Auto-zoom: fit graph on first load ──────────────────────────────────
  const hasAutoZoomedRef = useRef(false)

  // Reset auto-zoom flag when data changes significantly (new graph loaded)
  useEffect(() => {
    if (needsRelayout) {
      hasAutoZoomedRef.current = false
    }
  }, [needsRelayout])

  // ── Save positions when simulation stops ────────────────────────────────
  const onEngineStop = useCallback(() => {
    if (graphData.nodes.length > 0) {
      savePositions(graphData.nodes)
      // Rebuild community hulls now that positions are final
      if (hullNeedsRebuildRef.current) {
        hullNeedsRebuildRef.current = false
        rebuildCommunityHulls()
      }

      // Auto-zoom to fit all nodes on first layout completion
      if (!hasAutoZoomedRef.current) {
        hasAutoZoomedRef.current = true
        const fg = graphRef.current
        if (fg && typeof fg.zoomToFit === 'function') {
          // Small delay to let positions finalize
          setTimeout(() => {
            fg.zoomToFit(800, 80) // 800ms transition, 80px padding
          }, 100)
        }
      }
    }
  }, [graphData.nodes, savePositions, rebuildCommunityHulls])

  // Cleanup hulls on unmount
  useEffect(() => {
    return () => {
      disposeCommunityHulls(communityHullsRef.current)
      communityHullsRef.current = null
    }
  }, [])

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
  const INTER_COMMUNITY_COLOR = '#F8FAFC'   // slate-50 (bright white — stands out against dark bg)

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

    // Group highlight — only show edges within the group (match by entityType, not id)
    if (highlightedGroup) {
      const sourceType = typeof link.source === 'object' ? (link.source as Graph3DNode).entityType : ''
      const targetType = typeof link.target === 'object' ? (link.target as Graph3DNode).entityType : ''
      const bothInGroup = highlightedGroup.has(sourceType) && highlightedGroup.has(targetType)
      if (bothInGroup) return link.color
      // One end in group = faint connector visible
      if (highlightedGroup.has(sourceType) || highlightedGroup.has(targetType)) return 'rgba(107, 114, 128, 0.12)'
      return 'rgba(107, 114, 128, 0.03)'
    }

    // Inter-community edges get a bright distinct color when hulls are visible
    if (showCommunityHulls && link.isInterCommunity) {
      return INTER_COMMUNITY_COLOR
    }

    return link.color
  }, [hoveredNodeId, selectedNodeId, hasAnyHighlight, activation, showCommunityHulls, highlightedGroup])

  const linkWidth = useCallback((link: Graph3DLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target

    // Energy factor: weight modulates width (0.5x at weight=0 → 2x at weight=1)
    const weight = link.weight ?? 0.5
    const energyFactor = 0.5 + weight * 1.5

    // Spreading activation — boost active edges
    if (activation.phase !== 'idle' && activation.phase !== 'searching') {
      const edgeKey = `${sourceId}-${targetId}`
      const edgeKeyRev = `${targetId}-${sourceId}`
      if (activation.activeEdges.has(edgeKey) || activation.activeEdges.has(edgeKeyRev)) {
        return link.width * energyFactor * 2.5
      }
      return link.width * 0.15
    }

    if (hasAnyHighlight) {
      const isHoverConnected = hoveredNodeId
        ? (sourceId === hoveredNodeId || targetId === hoveredNodeId)
        : false
      const isSelectConnected = selectedNodeId
        ? (sourceId === selectedNodeId || targetId === selectedNodeId)
        : false
      return (isHoverConnected || isSelectConnected) ? link.width * energyFactor * 2 : link.width * 0.15
    }

    // Group highlight — edges within group keep normal width, outside dimmed (match by entityType)
    if (highlightedGroup) {
      const sourceType = typeof link.source === 'object' ? (link.source as Graph3DNode).entityType : ''
      const targetType = typeof link.target === 'object' ? (link.target as Graph3DNode).entityType : ''
      const bothInGroup = highlightedGroup.has(sourceType) && highlightedGroup.has(targetType)
      return bothInGroup ? link.width * energyFactor * 1.5 : link.width * 0.1
    }

    // Inter-community edges slightly thicker
    if (showCommunityHulls && link.isInterCommunity) {
      return link.width * energyFactor * 1.5
    }

    return link.width * energyFactor
  }, [hoveredNodeId, selectedNodeId, hasAnyHighlight, activation, showCommunityHulls, highlightedGroup])

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
    // Inter-community edges get flowing particles to show cross-boundary communication
    if (showCommunityHulls && link.isInterCommunity) {
      return 3
    }
    return link.particles
  }, [activation, showCommunityHulls])

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

  // ── Sprite-based visual effects ─────────────────────────────────────────
  // Nodes are now 100% billboard sprites (no Mesh). Effects work by modifying
  // SpriteMaterial opacity on each child sprite of the node group.
  // For tinting we modify the material's color property.

  type AnySpriteChild = THREE.Sprite
  interface SpriteOriginal { opacity: number; color: string }

  function saveSprite(sprite: AnySpriteChild): SpriteOriginal {
    const mat = sprite.material as THREE.SpriteMaterial
    return { opacity: mat.opacity, color: '#' + (mat.color?.getHexString?.() ?? 'ffffff') }
  }

  function restoreSprite(sprite: AnySpriteChild, orig: SpriteOriginal): void {
    const mat = sprite.material as THREE.SpriteMaterial
    mat.opacity = orig.opacity
    mat.color = new THREE.Color(orig.color)
    mat.needsUpdate = true
  }

  function setNodeOpacityAll(obj: THREE.Object3D, opacity: number): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Sprite && child.material) {
        ;(child.material as THREE.SpriteMaterial).opacity = opacity
        ;(child.material as THREE.SpriteMaterial).needsUpdate = true
      }
    })
  }

  // ── Spreading Activation — live 3D visual updates ───────────────────
  const activationPhase = activation.phase

  const dirtyRef = useRef<{
    sprites: Map<AnySpriteChild, SpriteOriginal>
    lights: Set<THREE.PointLight>
    nodeStates: Map<string, 'direct' | 'propagated' | 'dimmed'>
  }>({ sprites: new Map(), lights: new Set(), nodeStates: new Map() })

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return

    const isActive = activationPhase !== 'idle' && activationPhase !== 'searching'
    const dirty = dirtyRef.current

    if (activationPhase === 'searching') return

    // ── DEACTIVATION ──
    if (!isActive) {
      for (const [sprite, orig] of dirty.sprites) { restoreSprite(sprite, orig) }
      dirty.sprites.clear()
      for (const light of dirty.lights) { light.parent?.remove(light) }
      dirty.lights.clear()
      dirty.nodeStates.clear()
      return
    }

    // ── ACTIVE PHASE ──
    const newNodeStates = new Map<string, 'direct' | 'propagated' | 'dimmed'>()

    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isDirect = activation.directIds.has(node.id)
      const isPropagated = activation.propagatedIds.has(node.id)
      const desiredState: 'direct' | 'propagated' | 'dimmed' = isDirect ? 'direct' : isPropagated ? 'propagated' : 'dimmed'
      const score = activation.scores.get(node.id) ?? 0
      newNodeStates.set(node.id, desiredState)

      const prevState = dirty.nodeStates.get(node.id)
      if (prevState === desiredState && desiredState === 'dimmed') continue

      const isLit = isDirect || isPropagated

      // ── PointLight management ──
      const existingLight = obj.children.find((c): c is THREE.PointLight => c instanceof THREE.PointLight && c.userData.__act__)
      if (existingLight) { obj.remove(existingLight); dirty.lights.delete(existingLight) }

      if (isLit) {
        const lightColor = isDirect ? 0x34D399 : 0xA78BFA
        const intensity = isDirect ? 60 + score * 80 : 30 + score * 50
        const distance = isDirect ? 100 : 70
        const pointLight = new THREE.PointLight(lightColor, intensity, distance, 1.5)
        pointLight.userData.__act__ = true
        obj.add(pointLight)
        dirty.lights.add(pointLight)
      }

      // ── Sprite opacity updates ──
      const targetOpacity = isDirect ? 1.0 : isPropagated ? 0.85 : 0.12
      obj.traverse((child) => {
        if (child instanceof THREE.Sprite && child.material) {
          if (!dirty.sprites.has(child)) { dirty.sprites.set(child, saveSprite(child)) }
          ;(child.material as THREE.SpriteMaterial).opacity = targetOpacity
          ;(child.material as THREE.SpriteMaterial).needsUpdate = true
        }
      })
    }

    dirty.nodeStates = newNodeStates
  }, [activationPhase, activation.directIds, activation.propagatedIds, activation.scores, graphData.nodes])

  // ── Heatmap overlays — energy (notes) & churn (files) ────────────────────
  const heatmapDirtyRef = useRef<Map<AnySpriteChild, SpriteOriginal>>(new Map())

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return

    const isAnyHeatmap = energyHeatmap || touchesHeatmap
    const hDirty = heatmapDirtyRef.current

    if (activationPhase !== 'idle' && activationPhase !== 'searching') {
      if (hDirty.size > 0) {
        for (const [sprite, orig] of hDirty) { restoreSprite(sprite, orig) }
        hDirty.clear()
      }
      return
    }

    if (!isAnyHeatmap) {
      for (const [sprite, orig] of hDirty) { restoreSprite(sprite, orig) }
      hDirty.clear()
      return
    }

    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isNote = node.entityType === 'note'
      const isFile = node.entityType === 'file'

      if (energyHeatmap && isNote) {
        const energy = Math.min(1, Math.max(0, (node.data.energy as number) ?? 0))
        const heatColor = energyToColor3(energy)
        obj.traverse((child) => {
          if (child instanceof THREE.Sprite && child.material) {
            if (!hDirty.has(child)) { hDirty.set(child, saveSprite(child)) }
            ;(child.material as THREE.SpriteMaterial).color = heatColor
            ;(child.material as THREE.SpriteMaterial).opacity = 0.6 + energy * 0.4
            ;(child.material as THREE.SpriteMaterial).needsUpdate = true
          }
        })
      } else if (touchesHeatmap && isFile) {
        const attrs = node.data.attributes as Record<string, unknown> | undefined
        const churn = Math.min(1, Math.max(0, (attrs?.churnScore as number) ?? (node.data.churnScore as number) ?? 0))
        if (churn <= 0) continue
        const heatColor = churnToColor3(churn)
        obj.traverse((child) => {
          if (child instanceof THREE.Sprite && child.material) {
            if (!hDirty.has(child)) { hDirty.set(child, saveSprite(child)) }
            ;(child.material as THREE.SpriteMaterial).color = heatColor
            ;(child.material as THREE.SpriteMaterial).opacity = 0.6 + churn * 0.4
            ;(child.material as THREE.SpriteMaterial).needsUpdate = true
          }
        })
      } else if (isAnyHeatmap && !isNote && !isFile) {
        obj.traverse((child) => {
          if (child instanceof THREE.Sprite && child.material) {
            if (!hDirty.has(child)) { hDirty.set(child, saveSprite(child)) }
            ;(child.material as THREE.SpriteMaterial).opacity = 0.15
            ;(child.material as THREE.SpriteMaterial).needsUpdate = true
          }
        })
      }
    }
  }, [energyHeatmap, touchesHeatmap, graphData.nodes, activationPhase])

  // ── Legend hover — illuminate nodes matching the hovered entity type ─────
  const legendDirtyRef = useRef<Map<AnySpriteChild, SpriteOriginal>>(new Map())
  const legendScaledRef = useRef<Map<THREE.Object3D, THREE.Vector3>>(new Map())

  useEffect(() => {
    const lDirty = legendDirtyRef.current
    const lScaled = legendScaledRef.current

    const restoreLegend = () => {
      for (const [sprite, orig] of lDirty) { restoreSprite(sprite, orig) }
      lDirty.clear()
      for (const [obj, origScale] of lScaled) { obj.scale.copy(origScale) }
      lScaled.clear()
    }

    if (activationPhase !== 'idle' && activationPhase !== 'searching') { restoreLegend(); return }
    if (!legendHoveredType) { restoreLegend(); return }

    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isMatch = node.entityType === legendHoveredType
      const targetOpacity = isMatch ? 1.0 : 0.06

      obj.traverse((child) => {
        if (child instanceof THREE.Sprite && child.material) {
          if (!lDirty.has(child)) { lDirty.set(child, saveSprite(child)) }
          ;(child.material as THREE.SpriteMaterial).opacity = targetOpacity
          ;(child.material as THREE.SpriteMaterial).needsUpdate = true
        }
      })

      if (!lScaled.has(obj)) { lScaled.set(obj, obj.scale.clone()) }
      obj.scale.setScalar(isMatch ? 1.6 : 0.5)
    }
  }, [legendHoveredType, graphData.nodes, activationPhase])

  // ── Project hover highlight — illuminate nodes belonging to hovered project ──
  const projectDirtyRef = useRef<Map<AnySpriteChild, SpriteOriginal>>(new Map())

  useEffect(() => {
    if (!graphRef.current) return
    const pDirty = projectDirtyRef.current

    const restoreAll = () => {
      for (const [sprite, orig] of pDirty) { restoreSprite(sprite, orig) }
      pDirty.clear()
    }

    if (legendHoveredType || (activationPhase !== 'idle' && activationPhase !== 'searching')) { restoreAll(); return }
    if (!hoveredProjectSlug) { restoreAll(); return }

    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const nodeProjectSlug = (node.data.projectSlug ?? node.data.project_slug) as string | undefined
      if (!nodeProjectSlug) continue
      const isMatch = nodeProjectSlug === hoveredProjectSlug

      obj.traverse((child) => {
        if (child instanceof THREE.Sprite && child.material) {
          if (!pDirty.has(child)) { pDirty.set(child, saveSprite(child)) }
          ;(child.material as THREE.SpriteMaterial).opacity = isMatch ? 1.0 : 0.15
          ;(child.material as THREE.SpriteMaterial).needsUpdate = true
        }
      })
    }
  }, [hoveredProjectSlug, legendHoveredType, graphData.nodes, activationPhase])

  // ── Group highlight — isolate a subset of nodes (FG hover, milestone hover, etc.) ──
  const groupDirtyRef = useRef<Map<AnySpriteChild, SpriteOriginal>>(new Map())
  const groupScaledRef = useRef<Map<THREE.Object3D, THREE.Vector3>>(new Map())

  useEffect(() => {
    const gDirty = groupDirtyRef.current
    const gScaled = groupScaledRef.current

    const restoreGroup = () => {
      for (const [sprite, orig] of gDirty) { restoreSprite(sprite, orig) }
      gDirty.clear()
      for (const [obj, origScale] of gScaled) { obj.scale.copy(origScale) }
      gScaled.clear()
    }

    // Skip if higher-priority effects are active
    if (legendHoveredType || hoveredProjectSlug || (activationPhase !== 'idle' && activationPhase !== 'searching')) {
      restoreGroup()
      return
    }
    if (!highlightedGroup) { restoreGroup(); return }

    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isInGroup = highlightedGroup.has(node.entityType)
      const targetOpacity = isInGroup ? 1.0 : 0.08

      obj.traverse((child) => {
        if (child instanceof THREE.Sprite && child.material) {
          if (!gDirty.has(child)) { gDirty.set(child, saveSprite(child)) }
          ;(child.material as THREE.SpriteMaterial).opacity = targetOpacity
          ;(child.material as THREE.SpriteMaterial).needsUpdate = true
        }
      })

      // Subtle scale bump for group members
      if (!gScaled.has(obj)) { gScaled.set(obj, obj.scale.clone()) }
      obj.scale.setScalar(isInGroup ? 1.3 : 0.6)
    }
  }, [highlightedGroup, legendHoveredType, hoveredProjectSlug, graphData.nodes, activationPhase])

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

    // Reset previous selected node — restore full opacity
    if (prevSelectedRef.current && prevSelectedRef.current !== selectedNodeId) {
      const prevNode = graphData.nodes.find((n) => n.id === prevSelectedRef.current)
      const prevObj = (prevNode as Graph3DNode & { __threeObj?: THREE.Object3D } | undefined)?.__threeObj
      if (prevObj) {
        setNodeOpacityAll(prevObj, 1.0)
      }
    }

    // Highlight newly selected node — full brightness + scale pulse
    if (selectedNodeId) {
      const selNode = graphData.nodes.find((n) => n.id === selectedNodeId)
      const selObj = (selNode as Graph3DNode & { __threeObj?: THREE.Object3D } | undefined)?.__threeObj
      if (selObj) {
        setNodeOpacityAll(selObj, 1.0)
      }
    }

    prevSelectedRef.current = selectedNodeId
  }, [selectedNodeId, graphData.nodes, activation.phase])

  // ── Interactions ────────────────────────────────────────────────────────
  // Double-click detection: track last click time + node id
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onNodeClick = useCallback((node: Graph3DNode) => {
    const now = Date.now()
    const last = lastClickRef.current

    // Detect double-click (same node within 350ms)
    if (last && last.nodeId === node.id && now - last.time < 350) {
      // Clear pending single-click
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
      lastClickRef.current = null
      // Fire double-click
      onNodeDoubleClick?.(node.id)
      return
    }

    // Record click and defer single-click action
    lastClickRef.current = { nodeId: node.id, time: now }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id)
    }, 350)
  }, [selectedNodeId, setSelectedNodeId, onNodeDoubleClick])

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

  // ── Scene config (background + lights) ─────────────────────────────────
  // ── Scene configuration (background + lights) ──────────────────────────────
  // MeshLambertMaterial REQUIRES lights to be visible. Without AmbientLight,
  // all meshes render black. The scene background also defaults to white.
  //
  // GOTCHA — WHITE SCREEN BUG (recurring):
  //   ForceGraph3D creates a NEW Three.js scene when it (re)mounts.
  //   This happens when graphData.nodes goes 0→N (conditional render unmount/remount).
  //   The new scene has a white background and no lights.
  //   configureScene() MUST run on EVERY mount — it is idempotent (checks for
  //   existing lights before adding). Never gate it behind a "configured once" ref,
  //   because the scene instance changes on remount but the ref would persist.
  //   Also, graphRef isn't available until ForceGraph3D mounts asynchronously,
  //   so we poll with setInterval(50ms) until the ref is ready.

  const configureScene = useCallback(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return false

    const scene = fg.scene()
    if (!scene) return false

    // Dark background — prevents white flash
    scene.background = new THREE.Color('#0f172a')

    // Also set clear color on renderer as belt-and-suspenders
    try {
      if (typeof fg.renderer === 'function') {
        const renderer = fg.renderer()
        if (renderer) {
          renderer.setClearColor(new THREE.Color('#0f172a'), 1)
        }
      }
    } catch { /* renderer may not be ready */ }

    // Add lights — required for MeshLambertMaterial visibility (idempotent)
    const existingAmbient = scene.children.find((c: THREE.Object3D) => c instanceof THREE.AmbientLight)
    if (!existingAmbient) {
      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      scene.add(new THREE.DirectionalLight(0xffffff, 0.4))
    }

    return true
  }, [])

  // Configure scene once on mount — ForceGraph3D is ALWAYS mounted (never conditional),
  // so this runs exactly once. Uses polling because graphRef isn't available synchronously.
  useEffect(() => {
    if (configureScene()) return

    const interval = setInterval(() => {
      if (configureScene()) {
        clearInterval(interval)
      }
    }, 50)

    const timeout = setTimeout(() => clearInterval(interval), 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [configureScene])

  // ── Brightness — renderer toneMappingExposure (affects entire render output) ──
  useEffect(() => {
    const fg = graphRef.current
    if (!fg) return

    try {
      if (typeof fg.renderer === 'function') {
        const renderer = fg.renderer() as THREE.WebGLRenderer | undefined
        if (renderer) {
          // exposure 0→1 maps to 0.05→5.0 (very wide range for dramatic effect)
          renderer.toneMapping = THREE.ReinhardToneMapping
          renderer.toneMappingExposure = 0.05 + brightness * 4.95
        }
      }
    } catch { /* renderer may not be ready */ }
  }, [brightness])

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

  // Keep ForceGraph3D ALWAYS mounted to prevent white screen on preset switches.
  // When nodes are empty, pass an empty graphData — the scene stays alive with its
  // configured background + lights, avoiding the unmount/remount cycle that
  // creates a new white scene each time. See note: "ForceGraph3D white screen on (re)mount"
  const emptyGraphData = useMemo(() => ({ nodes: [] as Graph3DNode[], links: [] as Graph3DLink[] }), [])
  const activeGraphData = graphData.nodes.length > 0 ? graphData : emptyGraphData

  // Don't render ForceGraph3D until we have real container dimensions —
  // passing width=0/height=0 causes Three.js to create a degenerate renderer
  // that can produce layout artifacts when resized later.
  const hasDimensions = dimensions.width > 0 && dimensions.height > 0

  // ── Quality-adaptive render settings ──────────────────────────────────
  const quality = getNodeQuality()
  const nodeResolution = quality === 'minimal' ? 6 : quality === 'low' ? 8 : 12
  // Disable particles for large graphs (saves draw calls)
  const enableParticles = quality !== 'minimal'

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-[#0f172a]">
      {hasDimensions && <ForceGraph3D<Graph3DNode, Graph3DLink>
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={activeGraphData}
        // Node styling
        nodeColor={nodeColor}
        nodeVal={nodeVal}
        nodeLabel={nodeLabel}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeOpacity={nodeOpacity}
        nodeResolution={nodeResolution}
        // Link styling — subtle lines, energy-proportional
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.35}
        linkDirectionalParticles={enableParticles ? linkParticles : 0}
        linkDirectionalParticleSpeed={linkParticleSpeed}
        linkDirectionalParticleColor={linkParticleColor}
        linkDirectionalParticleWidth={1.0}
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
      />}
    </div>
  )
}
