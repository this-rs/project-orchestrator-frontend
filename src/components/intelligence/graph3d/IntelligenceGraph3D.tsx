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
import { useActivationSync } from './useActivationSync'
import { useObservatoryCamera } from './useObservatoryCamera'
import { createNodeObject, disposeNodeCaches, setNodeQuality, getNodeQuality, getNodeSprites } from './nodeObjects'
import { buildCommunityHulls, disposeCommunityHulls, computeHullSignature, type CommunityHullGroup } from './CommunityHulls3D'
import { buildEnergyTerrain, disposeEnergyTerrain, computeTerrainSignature } from './EnergyTerrain3D'
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
  dimmedEntityTypesAtom,
  graphBrightnessAtom,
  tissueAltitudeAtom,
  selectedEdgeAtom,
  showEnergyTerrainAtom,
  focusInvisibleCouplingsAtom,
  predictedLinksAtom,
  showPredictedLinksAtom,
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

// ── Mental tissue vs structural substrate ─────────────────────────────────────
// The Knowledge Fabric edges are the "mental tissue" projected OVER the code:
// they render as Bezier arcs elevating above the structural plane (height ∝
// weight × tissueAltitude), while structural edges stay flat and desaturate.
//
// three-forcegraph curve convention: with linkCurveRotation = -π/2, the
// quadratic Bezier control point (vLine×ẑ rotated around the link axis) points
// toward +Z for ANY non-vertical link — the layer-stacking "up" axis here.

const TISSUE_RELATIONS = new Set(['SYNAPSE', 'CO_CHANGED', 'CO_CHANGED_TRANSITIVE', 'AFFECTS', 'DISCUSSED'])
const SUBSTRATE_RELATIONS = new Set(['IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'TOUCHES'])
const TISSUE_CURVE_ROTATION = -Math.PI / 2

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntelligenceGraph3DProps {
  nodes: IntelligenceNode[]
  edges: IntelligenceEdge[]
  /** Callback when a node is double-clicked (fractal drill-down) */
  onNodeDoubleClick?: (nodeId: string) => void
  /** Callback when a node is alt-clicked (spreading activation from node) */
  onNodeAltClick?: (node: Graph3DNode) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphRef = any // ForceGraph3D ref methods are dynamically extended

export default function IntelligenceGraph3D({ nodes, edges, onNodeDoubleClick, onNodeAltClick }: IntelligenceGraph3DProps) {
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
  const dimmedEntityTypes = useAtomValue(dimmedEntityTypesAtom)
  const brightness = useAtomValue(graphBrightnessAtom)
  const tissueAltitude = useAtomValue(tissueAltitudeAtom)
  const showEnergyTerrain = useAtomValue(showEnergyTerrainAtom)
  const focusInvisibleCouplings = useAtomValue(focusInvisibleCouplingsAtom)
  const predictedLinks = useAtomValue(predictedLinksAtom)
  const showPredictedLinks = useAtomValue(showPredictedLinksAtom)

  const { transformToGraph3D, savePositions } = useGraph3DLayout()

  // ── Community hulls ref ───────────────────────────────────────────────
  const communityHullsRef = useRef<CommunityHullGroup | null>(null)

  // ── Cleanup cached Three.js resources on unmount ────────────────────────
  useEffect(() => {
    const nodeObjectCache = nodeObjectCacheRef.current
    return () => {
      // Dispose per-node owned material clones (memoized node objects)
      for (const entry of nodeObjectCache.values()) {
        for (const sprite of getNodeSprites(entry.obj)) {
          if ((sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial) {
            (sprite.material as THREE.SpriteMaterial | undefined)?.dispose()
          }
        }
      }
      nodeObjectCache.clear()
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
  // Signature of the last built hulls (community membership + quantized
  // positions) — engine stops that didn't move anything skip re-triangulation.
  const hullSignatureRef = useRef<string | null>(null)

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

      if (!showCommunityHulls || graphData.nodes.length === 0) {
        // Toggle off / no data — remove existing hulls
        if (communityHullsRef.current) {
          scene.remove(communityHullsRef.current.group)
          disposeCommunityHulls(communityHullsRef.current)
          communityHullsRef.current = null
        }
        hullSignatureRef.current = null
        return
      }

      // Only build if any node has a communityId
      const hasCommunities = graphData.nodes.some((n) => n.communityId != null)
      if (!hasCommunities) return

      // Skip re-triangulation when membership + positions are unchanged
      // (order-independent hash, positions quantized to ~2 world units)
      const signature = computeHullSignature(graphData.nodes)
      if (communityHullsRef.current && signature === hullSignatureRef.current) return

      // Remove previous hulls before rebuilding
      if (communityHullsRef.current) {
        scene.remove(communityHullsRef.current.group)
        disposeCommunityHulls(communityHullsRef.current)
        communityHullsRef.current = null
      }

      const hullGroup = buildCommunityHulls(graphData.nodes)
      if (hullGroup.hulls.length > 0) {
        scene.add(hullGroup.group)
        communityHullsRef.current = hullGroup
      }
      hullSignatureRef.current = signature
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

  // ── Energy terrain — cognitive-density membrane above the tissue ────────
  const energyTerrainRef = useRef<THREE.Mesh | null>(null)
  const terrainSignatureRef = useRef<string | null>(null)
  const lastTerrainBuildRef = useRef(0)

  const rebuildEnergyTerrain = useCallback((force = false) => {
    try {
      const fg = graphRef.current
      if (!fg || typeof fg.scene !== 'function') return
      const scene = fg.scene()
      if (!scene) return

      const enabled = showEnergyTerrain && tissueAltitude > 0 && graphData.nodes.length > 0
      if (!enabled) {
        if (energyTerrainRef.current) {
          scene.remove(energyTerrainRef.current)
          disposeEnergyTerrain(energyTerrainRef.current)
          energyTerrainRef.current = null
        }
        terrainSignatureRef.current = null
        return
      }

      // Throttle energy-driven rebuilds (WS reinforcement bursts) to 1 per 2s
      const now = Date.now()
      if (!force && now - lastTerrainBuildRef.current < 2000) return

      // Skip when sources + positions + altitude are unchanged
      const signature = computeTerrainSignature(graphData.nodes, tissueAltitude)
      if (energyTerrainRef.current && signature === terrainSignatureRef.current) return

      if (energyTerrainRef.current) {
        scene.remove(energyTerrainRef.current)
        disposeEnergyTerrain(energyTerrainRef.current)
        energyTerrainRef.current = null
      }

      const mesh = buildEnergyTerrain(graphData.nodes, tissueAltitude)
      if (mesh) {
        scene.add(mesh)
        energyTerrainRef.current = mesh
      }
      terrainSignatureRef.current = signature
      lastTerrainBuildRef.current = now
    } catch (err) {
      console.warn('[IntelligenceGraph3D] energy terrain error:', err)
    }
  }, [showEnergyTerrain, tissueAltitude, graphData.nodes])

  // Rebuild on toggle / altitude change (forced — direct user action)
  useEffect(() => {
    const timer = setTimeout(() => rebuildEnergyTerrain(true), 120)
    return () => clearTimeout(timer)
  }, [showEnergyTerrain, tissueAltitude, rebuildEnergyTerrain])

  // Cleanup terrain on unmount
  useEffect(() => {
    return () => {
      disposeEnergyTerrain(energyTerrainRef.current)
      energyTerrainRef.current = null
    }
  }, [])

  // ── Ghost links — predicted missing relations (dashed violet lines) ─────
  const ghostLinksRef = useRef<THREE.Group | null>(null)

  const disposeGhostLinks = useCallback((scene?: THREE.Scene) => {
    const group = ghostLinksRef.current
    if (!group) return
    scene?.remove(group)
    group.traverse((o) => {
      if (o instanceof THREE.Line) {
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      }
    })
    ghostLinksRef.current = null
  }, [])

  const rebuildGhostLinks = useCallback(() => {
    try {
      const fg = graphRef.current
      if (!fg || typeof fg.scene !== 'function') return
      const scene = fg.scene()
      if (!scene) return

      disposeGhostLinks(scene)
      if (!showPredictedLinks || predictedLinks.length === 0 || graphData.nodes.length === 0) return

      // Best-effort endpoint matching: predictions carry file paths, graph
      // node ids may be `file:<path>`, `<path>` or carry data.path
      const byKey = new Map<string, Graph3DNode>()
      for (const n of graphData.nodes) {
        byKey.set(n.id, n)
        const p = (n.data.path as string) ?? ''
        if (p) byKey.set(p, n)
        const colonIdx = n.id.indexOf(':')
        if (colonIdx > 0) byKey.set(n.id.slice(colonIdx + 1), n)
      }

      const group = new THREE.Group()
      group.name = 'predictedLinks'
      for (const pred of predictedLinks) {
        const a = byKey.get(pred.source)
        const b = byKey.get(pred.target)
        if (!a || !b) continue
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.x, a.y, a.z),
          new THREE.Vector3(b.x, b.y, b.z),
        ])
        const mat = new THREE.LineDashedMaterial({
          color: 0xc4b5fd, // violet-300 — "not yet real"
          transparent: true,
          opacity: 0.25 + pred.plausibility * 0.5,
          dashSize: 4,
          gapSize: 3,
          depthWrite: false,
        })
        const line = new THREE.Line(geo, mat)
        line.computeLineDistances() // REQUIRED for LineDashedMaterial
        group.add(line)
      }
      if (group.children.length > 0) {
        scene.add(group)
        ghostLinksRef.current = group
      }
    } catch (err) {
      console.warn('[IntelligenceGraph3D] ghost links error:', err)
    }
  }, [showPredictedLinks, predictedLinks, graphData.nodes, disposeGhostLinks])

  // Rebuild ghosts on toggle / data change, cleanup on unmount
  useEffect(() => {
    const timer = setTimeout(() => rebuildGhostLinks(), 150)
    return () => clearTimeout(timer)
  }, [rebuildGhostLinks])

  useEffect(() => {
    return () => disposeGhostLinks()
  }, [disposeGhostLinks])

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
      // Refresh the energy terrain with settled positions (signature-guarded)
      rebuildEnergyTerrain()
      // Reposition ghost links on settled positions
      rebuildGhostLinks()

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
  }, [graphData.nodes, savePositions, rebuildCommunityHulls, rebuildEnergyTerrain, rebuildGhostLinks])

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

  // ── Node 3D object — memoized by node.id ────────────────────────────────
  // react-force-graph re-requests node objects whenever graphData changes;
  // without memoization every update re-creates all Groups + sprites (at 500
  // nodes: ~50K allocations during layout settling). Entries are invalidated
  // only when the visual key (quality/label/status/energy/progress) changes.
  const nodeObjectCacheRef = useRef<Map<string, { key: string; obj: THREE.Object3D }>>(new Map())

  const disposeCachedNodeObject = useCallback((obj: THREE.Object3D) => {
    // Dispose per-node OWNED material clones. Texture maps are cache-shared
    // (nodeObjects.ts caches) and are disposed globally by disposeNodeCaches().
    for (const sprite of getNodeSprites(obj)) {
      if ((sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial) {
        (sprite.material as THREE.SpriteMaterial | undefined)?.dispose()
      }
    }
  }, [])

  const nodeThreeObject = useCallback((node: Graph3DNode) => {
    const d = node.data as Record<string, unknown>
    const energy = (d.energy as number) ?? 0
    const status = (d.status as string) ?? ''
    const progressKey = `${d.completed_step_count ?? d.completed_task_count ?? ''}/${d.step_count ?? d.task_count ?? ''}`
    const key = `${getNodeQuality()}:${node.label}:${status}:${Math.round(energy * 10)}:${progressKey}`

    const cache = nodeObjectCacheRef.current
    const hit = cache.get(node.id)
    if (hit && hit.key === key) return hit.obj
    if (hit) disposeCachedNodeObject(hit.obj)

    const obj = createNodeObject(node)
    cache.set(node.id, { key, obj })
    return obj
  }, [disposeCachedNodeObject])

  // Prune cache entries for nodes that left the graph
  useEffect(() => {
    const ids = new Set(graphData.nodes.map((n) => n.id))
    const cache = nodeObjectCacheRef.current
    for (const [id, entry] of cache) {
      if (!ids.has(id)) {
        disposeCachedNodeObject(entry.obj)
        cache.delete(id)
      }
    }
  }, [graphData.nodes, disposeCachedNodeObject])

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

    // Invisible-coupling lens: dim everything except the hidden couplings
    if (focusInvisibleCouplings) {
      return link.isInvisibleCoupling ? '#FBBF24' : 'rgba(107, 114, 128, 0.04)'
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

    // Invisible couplings stand out by DEFAULT — a coupling no static code
    // view can show (co-changed files with zero structural relationship)
    if (link.isInvisibleCoupling) {
      return 'rgba(251, 191, 36, 0.85)' // amber-400, near-opaque
    }

    // Tissue mode: desaturate the structural substrate proportionally to the
    // altitude so the elevated fabric arcs read as the luminous layer.
    // At altitude 0 this branch is skipped → exact legacy colors.
    if (tissueAltitude > 0 && SUBSTRATE_RELATIONS.has(link.relationType)) {
      return `rgba(148, 163, 184, ${(0.30 * (1 - 0.65 * tissueAltitude)).toFixed(3)})`
    }

    return link.color
  }, [hoveredNodeId, selectedNodeId, hasAnyHighlight, activation, showCommunityHulls, highlightedGroup, tissueAltitude, focusInvisibleCouplings])

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

    // Invisible-coupling lens: emphasize hidden couplings, fade everything else
    if (focusInvisibleCouplings) {
      return link.isInvisibleCoupling ? link.width * energyFactor * 2.2 : link.width * 0.08
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

    // Invisible couplings slightly thicker by default
    return link.width * energyFactor * (link.isInvisibleCoupling ? 1.8 : 1)
  }, [hoveredNodeId, selectedNodeId, hasAnyHighlight, activation, showCommunityHulls, highlightedGroup, focusInvisibleCouplings])

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
    // Invisible couplings always flow — they carry the hidden signal
    if (link.isInvisibleCoupling) {
      return Math.max(link.particles, 2)
    }
    return link.particles
  }, [activation, showCommunityHulls])

  const linkParticleSpeed = useCallback((link: Graph3DLink) => {
    return link.particleSpeed
  }, [])

  // ── Tissue arcs — fabric edges elevate above the structural plane ────────
  // Curvature ∝ edge weight × tissue altitude. At altitude 0 → curvature 0 →
  // three-forcegraph early-returns to a straight line (exact legacy render).
  const linkCurvature = useCallback((link: Graph3DLink) => {
    if (tissueAltitude <= 0 || !TISSUE_RELATIONS.has(link.relationType)) return 0
    const weight = link.weight ?? 0.5
    return tissueAltitude * (0.15 + weight * 0.5)
  }, [tissueAltitude])

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

  /**
   * Return the sprite's owned material. Materials are pre-cloned at node
   * creation (nodeObjects.ts ownMaterial), so this is a passthrough in
   * practice — the lazy clone below is only a safety net for sprites that
   * were NOT created by createNodeObject.
   */
  function ensureOwnedMaterial(sprite: AnySpriteChild): THREE.SpriteMaterial {
    if (!(sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial) {
      sprite.material = (sprite.material as THREE.SpriteMaterial).clone()
      ;(sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial = true
    }
    return sprite.material as THREE.SpriteMaterial
  }

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
    for (const child of getNodeSprites(obj)) {
      const mat = ensureOwnedMaterial(child)
      mat.opacity = opacity
      mat.needsUpdate = true
    }
  }

  // ── Spreading Activation — live 3D visual updates (extracted hook) ───
  const activationPhase = activation.phase
  useActivationSync(graphRef, graphData.nodes)

  // ── Observatory mode — optional auto-camera following active clusters ──
  // Off by default (observatoryAutoCameraAtom); user drag interrupts it.
  useObservatoryCamera(graphRef, containerRef, graphData.nodes)

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
        for (const child of getNodeSprites(obj)) {
          if (!hDirty.has(child)) { hDirty.set(child, saveSprite(child)) }
          const mat = ensureOwnedMaterial(child)
          mat.color = heatColor
          mat.opacity = 0.6 + energy * 0.4
          mat.needsUpdate = true
        }
      } else if (touchesHeatmap && isFile) {
        const attrs = node.data.attributes as Record<string, unknown> | undefined
        const churn = Math.min(1, Math.max(0, (attrs?.churnScore as number) ?? (node.data.churnScore as number) ?? 0))
        if (churn <= 0) continue
        const heatColor = churnToColor3(churn)
        for (const child of getNodeSprites(obj)) {
          if (!hDirty.has(child)) { hDirty.set(child, saveSprite(child)) }
          const mat = ensureOwnedMaterial(child)
          mat.color = heatColor
          mat.opacity = 0.6 + churn * 0.4
          mat.needsUpdate = true
        }
      } else if (isAnyHeatmap && !isNote && !isFile) {
        for (const child of getNodeSprites(obj)) {
          if (!hDirty.has(child)) { hDirty.set(child, saveSprite(child)) }
          const mat = ensureOwnedMaterial(child)
          mat.opacity = 0.15
          mat.needsUpdate = true
        }
      }
    }
  }, [energyHeatmap, touchesHeatmap, graphData.nodes, activationPhase])

  // ── Unified highlight effect — single source of truth for legend/project/group hover ──
  // Merged into ONE effect to eliminate race conditions between 3 independent save/restore refs.
  // Priority: activation > legendHoveredType > hoveredProjectSlug > highlightedGroup > reset
  const highlightActiveRef = useRef(false)

  useEffect(() => {
    const isActivationActive = activationPhase !== 'idle' && activationPhase !== 'searching'

    // Determine which highlight mode is active (by priority)
    const mode: 'none' | 'legend' | 'project' | 'group' =
      isActivationActive ? 'none'
      : legendHoveredType ? 'legend'
      : hoveredProjectSlug ? 'project'
      : highlightedGroup ? 'group'
      : 'none'

    // If no highlight and wasn't active before, nothing to do
    if (mode === 'none' && !highlightActiveRef.current) return

    highlightActiveRef.current = mode !== 'none'

    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      let targetOpacity = 1.0
      let targetScale = 1.0

      if (mode === 'legend') {
        const isMatch = node.entityType === legendHoveredType
        targetOpacity = isMatch ? 1.0 : 0.06
        targetScale = isMatch ? 1.6 : 0.5
      } else if (mode === 'project') {
        const nodeProjectSlug = (node.data.projectSlug ?? node.data.project_slug) as string | undefined
        targetOpacity = nodeProjectSlug === hoveredProjectSlug ? 1.0 : 0.15
      } else if (mode === 'group') {
        const isInGroup = highlightedGroup!.has(node.entityType)
        targetOpacity = isInGroup ? 1.0 : 0.08
        targetScale = isInGroup ? 1.3 : 0.6
      }
      // mode === 'none' → defaults (1.0 / 1.0) = reset

      for (const child of getNodeSprites(obj)) {
        const mat = ensureOwnedMaterial(child)
        mat.opacity = targetOpacity
        mat.needsUpdate = true
      }

      if (targetScale !== 1.0 || mode === 'none') {
        obj.scale.setScalar(targetScale)
      }
    }
  }, [legendHoveredType, hoveredProjectSlug, highlightedGroup, graphData.nodes, activationPhase])

  // ── Connection-dimmed entity types (3-state group toggle) ──────────────
  // Reduces opacity + scale for nodes whose entity type is in 'connections' mode.
  // Lower priority than highlightedGroup — only active when no highlight is set.
  const dimDirtyRef = useRef<Map<AnySpriteChild, SpriteOriginal>>(new Map())
  const dimScaledRef = useRef<Map<THREE.Object3D, THREE.Vector3>>(new Map())

  useEffect(() => {
    const dDirty = dimDirtyRef.current
    const dScaled = dimScaledRef.current

    // When higher-priority effects are active, DON'T restore or clear.
    // Keep dDirty/dScaled intact with the true originals so we can properly
    // restore when the higher-priority effect deactivates.
    // (Without this, the group-highlight effect saves the dimmed opacity as
    //  "original" and restores to it when it clears — making everything paler.)
    if (highlightedGroup || legendHoveredType || hoveredProjectSlug || (activationPhase !== 'idle' && activationPhase !== 'searching')) {
      return
    }

    // Always restore all previously dimmed sprites to their true originals first.
    // This handles: (a) dimmedEntityTypes going null, (b) the set changing, and
    // (c) returning from a higher-priority effect that left sprites in a wrong state.
    for (const [sprite, orig] of dDirty) { restoreSprite(sprite, orig) }
    dDirty.clear()
    for (const [obj, origScale] of dScaled) { obj.scale.copy(origScale) }
    dScaled.clear()

    // Nothing to dim — we already restored above
    if (!dimmedEntityTypes || dimmedEntityTypes.size === 0) return

    // Apply dimming (saves from the freshly-restored true state)
    for (const node of graphData.nodes) {
      const obj = (node as Graph3DNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isDimmed = dimmedEntityTypes.has(node.entityType)
      if (!isDimmed) continue

      for (const child of getNodeSprites(obj)) {
        if (!dDirty.has(child)) { dDirty.set(child, saveSprite(child)) }
        const mat = ensureOwnedMaterial(child)
        mat.opacity = 0.25
        mat.needsUpdate = true
      }

      if (!dScaled.has(obj)) { dScaled.set(obj, obj.scale.clone()) }
      obj.scale.setScalar(0.5)
    }
  }, [dimmedEntityTypes, highlightedGroup, legendHoveredType, hoveredProjectSlug, graphData.nodes, activationPhase])

  // ── Spreading Activation — camera zoom is handled by useActivationSync ──
  // (single shared implementation via clusterBounds.ts — the duplicated
  //  centroid/radius/camera math that lived here was removed)

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

  const onNodeClick = useCallback((node: Graph3DNode, event?: MouseEvent) => {
    // Alt-click → spreading activation from this node ("what wakes up?")
    if (event?.altKey && onNodeAltClick) {
      onNodeAltClick(node)
      return
    }

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
  }, [selectedNodeId, setSelectedNodeId, onNodeDoubleClick, onNodeAltClick])

  const onNodeHover = useCallback((node: Graph3DNode | null) => {
    setHoveredNodeId(node?.id ?? null)
    // Change cursor
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default'
    }
  }, [setHoveredNodeId])

  // ── Edge provenance — "why this link?" ──────────────────────────────────
  const setSelectedEdge = useSetAtom(selectedEdgeAtom)

  const onLinkClick = useCallback((link: Graph3DLink) => {
    const src = link.source as Graph3DNode | string
    const tgt = link.target as Graph3DNode | string
    const sourceId = typeof src === 'object' ? src.id : src
    const targetId = typeof tgt === 'object' ? tgt.id : tgt
    setSelectedEdge({
      source: sourceId,
      target: targetId,
      sourceLabel: typeof src === 'object' ? src.label : sourceId,
      targetLabel: typeof tgt === 'object' ? tgt.label : targetId,
      relationType: link.relationType,
      weight: link.weight,
      count: link.count,
    })
  }, [setSelectedEdge])

  const onLinkHover = useCallback((link: Graph3DLink | null) => {
    if (containerRef.current && !hoveredNodeId) {
      containerRef.current.style.cursor = link ? 'pointer' : 'default'
    }
  }, [hoveredNodeId])

  const onBackgroundClick = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdge(null)
  }, [setSelectedNodeId, setSelectedEdge])

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

  // Particle LOD — gradual degradation instead of a binary cut. The mental
  // tissue's blood flow (SYNAPSE/AFFECTS particles) NEVER drops to zero, even
  // at minimal quality (plan constraint: synapses stay alive at scale).
  const effectiveLinkParticles = useCallback((link: Graph3DLink) => {
    const base = linkParticles(link)
    if (quality !== 'minimal') return base
    const rt = link.relationType
    if (rt === 'SYNAPSE' || rt === 'AFFECTS') return Math.max(1, Math.min(base, 2))
    if (rt === 'CO_CHANGED' || rt === 'CO_CHANGED_TRANSITIVE' || rt === 'TRANSITION') return Math.min(base, 1)
    return 0
  }, [linkParticles, quality])

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
        // Mental tissue: fabric edges arc above the structural plane
        linkCurvature={linkCurvature}
        linkCurveRotation={TISSUE_CURVE_ROTATION}
        linkDirectionalParticles={effectiveLinkParticles}
        linkDirectionalParticleSpeed={linkParticleSpeed}
        linkDirectionalParticleColor={linkParticleColor}
        linkDirectionalParticleWidth={1.0}
        // Interactions
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onLinkClick={onLinkClick}
        onLinkHover={onLinkHover}
        linkHoverPrecision={4}
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
