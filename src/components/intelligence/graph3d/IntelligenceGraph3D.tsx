// ============================================================================
// IntelligenceGraph3D — 3D force-directed graph visualization
// ============================================================================
//
// Uses react-force-graph-3d with deterministic layout (seeded PRNG).
// Stable on refresh — only relayouts when >20% nodes change.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import * as THREE from 'three'
import { useT } from '@/i18n'
import { ZoomIn } from 'lucide-react'

import { useGraph3DLayout, type Graph3DNode, type Graph3DLink } from './useGraph3DLayout'
import { useActivationSync } from './useActivationSync'
import {
  useRenderLoop,
  isMobileLikeDevice,
  WAKE_DATA_MS,
  WAKE_MUTATION_MS,
} from './useRenderLoop'
import { createNodeObject, disposeNodeCaches, setNodeQuality, getNodeQuality } from './nodeObjects'
import { layerRgb, resolveNodeBaseRgb } from './layerColors'
import { createLinkRenderer, parseColor, type LinkRenderer, type LinkStyle } from './linkSegments'
import { computeLinkAlpha, linkFamilyAlpha, LINK_OPACITY } from './linkFamily'
import { classifyLinkScale, linkScaleAlpha } from './linkScale'
import { LINK_FOCUS_GAIN, classifyLinkFocus, countLinksByFocus } from './linkFocus'
import { createNodePoints, shapeForType, sizeForType, type NodePoints, type NodeStyle } from './nodePoints'
import { buildCommunityHulls, disposeCommunityHulls, type CommunityHull, type CommunityHullGroup } from './CommunityHulls3D'
import { buildCommunityRings, disposeCommunityRings, type CommunityRingGroup } from './CommunityRings3D'
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
  graphScaleAtom,
  drilledCommunityAtom,
} from '@/atoms/intelligence'
import { buildGroupedGraph, resolutionForLevel, groupHullNodes } from './graphAggregation'
import { nextScaleLevel } from './scaleDecision'
import { zoomAdaptivePixelRatioCeiling } from './pixelRatioZoom'
import { createSuperNodeLabels, type SuperNodeLabels } from './superNodeLabels'
import { currentDeviceBudget } from './deviceTier'
import { createSuperLinkTubes, TUBE_MAX_EDGES, type SuperLinkTubes } from './superLinkTubes'
import { FrameAnimator } from './frameAnimator'
import { useLivePulse } from './useLivePulse'
import { useCommunityActivity } from './useCommunityActivity'
import { buildCommunityIndex } from './communityActivity'
import { useAgentMarkers } from './useAgentMarkers'
import type { AgentMarkers } from './agentMarkers'
import { communityFocus, nodeSetSignature } from './useGraph3DLayout'
import { activationStateAtom } from '../SpreadingActivation'
import { GraphPanel } from '../GraphPanel'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

/** True when a key event came from a text-entry field (search, chat, select). */
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

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

// ── Renderer init config ─────────────────────────────────────────────────────
// `rendererConfig` is an init-only prop of ForceGraph3D (it is forwarded to the
// WebGLRenderer constructor), so it must be a stable, module-level value.
// The library's own default is `{ antialias: true, alpha: true }`.
//
// MSAA on a phone is a full-screen multisample resolve every frame for a
// difference that is invisible at ~460 ppi on a 6" screen. It stays on for
// desktop. Detection is capability-based (coarse pointer / narrow viewport),
// never user-agent sniffing.
const IS_MOBILE_LIKE = isMobileLikeDevice()
/** Thresholds of this device's tier (deviceTier.ts): halos, labels, pixel ratio. */
const DEVICE_BUDGET = currentDeviceBudget().budget
const RENDERER_CONFIG = { antialias: !IS_MOBILE_LIKE }

/**
 * Upper bound on the device pixel ratio, for BOTH the renderer and the Points
 * shader's `uPx`. po-graph opens with `PR0 = Math.min(1.5, devicePixelRatio)`
 * (po-graph.js:271): a retina panel asks for 2, i.e. four times the fragments
 * to shade, for a gain no eye reads on a points cloud. 1.5 removes ~44 % of
 * them (2² → 1.5²) and is the cheapest win on the canvas.
 *
 * This is a CEILING, not the value in force: the render loop starts here and
 * steps DOWN 0.5 at a time when the measured frame interval says the machine
 * cannot follow (frameQuality.ts). The old code hard-set the cap, which was
 * both too expensive for an integrated GPU and too cheap for a discrete one.
 */
const MAX_PIXEL_RATIO = 1.5

/**
 * Ceiling for a coarse pointer (touch). A phone's retina panel asks for 2–3×
 * the fragments for a difference no finger reads on a points cloud, and the
 * extra resolve hits the battery as hard as the GPU. Cap the CEILING at 1.0 so
 * the frame budget never opens above one device pixel per CSS pixel; the loop
 * still steps down from there (frameQuality.ts). Detection is capability-based
 * (`pointer: coarse`), never user-agent sniffing.
 */
const MAX_PIXEL_RATIO_COARSE = 1.0

/** Coarse pointer (touch) — safe in jsdom/tests where `matchMedia` is absent. */
function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * The ceiling the render loop's frame budget may raise the pixel ratio back to:
 * the device's own ratio, clamped. This is an upper bound, NOT the value in
 * force — useRenderLoop starts here and steps down 0.5 at a time when the
 * measured frame interval says the machine cannot follow (frameQuality.ts).
 */
function pixelRatioCeiling(): number {
  if (typeof window === 'undefined') return 1
  const ceiling = isCoarsePointer() ? MAX_PIXEL_RATIO_COARSE : MAX_PIXEL_RATIO
  return Math.min(ceiling, DEVICE_BUDGET.maxPixelRatio, window.devicePixelRatio || 1)
}

/**
 * The canvas background is the PO surface token, not a hard-coded slate.
 * `#0f172a` (Tailwind slate-900) was visibly a different dark from
 * `--color-surface-base` (#0f1117): the graph read as a foreign panel inside
 * the product. Read once at module load; the fallback keeps it working in a
 * test environment where no stylesheet is applied.
 */
const PO_CANVAS_BG = readCssColor('--color-surface-base', '#0f1117')

function readCssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * Node count above which the 3D view opens in the aggregated step instead of
 * the raw cloud. Below it the detail is legible; above it the same picture is a
 * texture and the user has no way to tell a community from a neighbour.
 */
const AUTO_AGGREGATE_ABOVE = 4000

// Link opacity policy — the per-family budget (LINK_FAMILY_ALPHA), the density
// reference/ceiling, the alpha floor, the library-path base (LINK_OPACITY) and
// computeLinkAlpha — all live in linkFamily.ts (imported at the top of this file).

/**
 * Node count at or above which nodes are drawn as one THREE.Points (overview
 * tier) instead of one Group + sprites per node. Below it the emoji/label
 * identity is preserved; above it the sprite path's O(3·N) draw calls defeat
 * the purpose. Tune here, not at the call site.
 */
const NODE_POINTS_THRESHOLD = 2000


/** Highest aggregation level the scale stepper offers (resolutionForLevel saturates at ~2). */
const MAX_SCALE = 6

/** Precomputed ENTITY_COLORS → normalized RGB (avoids a THREE.Color per node). */
const ENTITY_RGB: Record<string, { r: number; g: number; b: number }> = Object.fromEntries(
  Object.entries(ENTITY_COLORS).map(([k, hex]) => {
    const p = parseColor(hex)
    return [k, { r: p.r, g: p.g, b: p.b }]
  }),
)
const DEFAULT_NODE_RGB = { r: 0.42, g: 0.45, b: 0.5 } // #6B7280

/** Flexible node↔activation-id match (raw UUID, prefixed id, or suffix). */
function activationMatches(id: string, activated: Set<string>): boolean {
  if (activated.has(id)) return true
  const colon = id.indexOf(':')
  return colon !== -1 && activated.has(id.slice(colon + 1))
}

export default function IntelligenceGraph3D({ nodes, edges, onNodeDoubleClick }: IntelligenceGraph3DProps) {
  const { t } = useT()
  const graphRef = useRef<GraphRef>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  // Don't render ForceGraph3D until we have real container dimensions —
  // passing width=0/height=0 causes Three.js to create a degenerate renderer
  // that can produce layout artifacts when resized later. Every effect that
  // needs the library's scene/camera must also re-run when this flips.
  const hasDimensions = dimensions.width > 0 && dimensions.height > 0

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
  const [scaleLevel, setScaleLevel] = useAtom(graphScaleAtom)
  // A community opened by a click: its members replace the super-nodes until
  // the breadcrumb closes it.
  const [drilledCommunity, setDrilledCommunity] = useAtom(drilledCommunityAtom)

  const { transformToGraph3D, savePositions } = useGraph3DLayout(nodes, edges)

  // ── Single Points renderer for nodes (overview tier) ──────────────────
  // Declared BEFORE the render loop: the loop's frame budget owns the pixel
  // ratio, and the Points shader must be told about every change.
  const nodePointsRef = useRef<NodePoints | null>(null)
  /** Framing distance of the current dataset (bounding sphere → camera), the near bound of the density distance factor. */
  const framingDistanceRef = useRef(0)

  /**
   * Pixel ratio currently in force, shared by the renderer and the Points
   * shader. A ref (not state) because nothing renders differently: the two
   * consumers are imperative, and a re-render must not reset a decision the
   * frame budget took from measured timings.
   */
  const pixelRatioRef = useRef(pixelRatioCeiling())

  /**
   * The single write path for the pixel ratio. The render loop calls this when
   * its frame budget moves the ratio, and the Points creation effect calls it
   * once so a shader built later starts in lockstep. The renderer is written by
   * the loop itself, in the same call — the two cannot drift apart.
   */
  const applyPixelRatio = useCallback((pixelRatio: number) => {
    pixelRatioRef.current = pixelRatio
    nodePointsRef.current?.setPixelRatio(pixelRatio)
  }, [])

  // ── On-demand render loop ─────────────────────────────────────────────
  // See useRenderLoop.ts. `wake(ms)` must be called by EVERY code path that
  // can change what is on screen; the wake-up inventory is annotated at each
  // call site below with a `wake:` comment.
  //
  // The third argument is the frame budget: the loop measures the real
  // inter-frame interval and lowers the pixel ratio 0.5 at a time when the
  // machine cannot keep up (~34 ms over ~90 frames), raising it back on a long
  // cheap window and stopping after two drops (see frameQuality.ts). It
  // replaces the fixed 1.5 cap: the same guarantee on the worst device, no
  // penalty on the best one.
  const initialPixelRatio = pixelRatioRef.current
  const { wake, setEngineRunning, setParticlesAnimating, setMaxPixelRatio, setZoomPixelRatioCeiling } = useRenderLoop(
    graphRef,
    containerRef,
    {
      maxPixelRatio: initialPixelRatio,
      initialPixelRatio,
      onPixelRatioChange: applyPixelRatio,
    },
  )

  // ── Zoom-adaptive pixel ratio ceiling ─────────────────────────────────
  // Closer than the framing distance, fewer nodes fill the viewport, so the GPU
  // can afford more pixels: the sampling ceiling follows the zoom. The rule is
  // the pure `zoomAdaptivePixelRatioCeiling` (pixelRatioZoom.ts, tested); this
  // reads the camera as it stands and returns the ceiling to hand the budget.
  // The base ceiling when nothing is framed yet or the library is not mounted.
  const zoomedPixelRatioCeiling = useCallback((): number => {
    const base = pixelRatioCeiling()
    const fg = graphRef.current
    const camera = fg && typeof fg.camera === 'function' ? fg.camera() : null
    const controls = fg && typeof fg.controls === 'function' ? fg.controls() : null
    if (!camera || !controls?.target) return base
    const deviceRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    return zoomAdaptivePixelRatioCeiling(
      camera.position.distanceTo(controls.target),
      framingDistanceRef.current,
      base,
      deviceRatio,
    )
  }, [])

  // ── Community hulls ref ───────────────────────────────────────────────
  const communityHullsRef = useRef<CommunityHullGroup | null>(null)
  const communityRingsRef = useRef<CommunityRingGroup | null>(null)
  // Entity id -> community id, rebuilt alongside the hulls (same numbering).
  const communityIndexRef = useRef<Map<string, number>>(new Map())

  // ── Single LineSegments renderer for links (optimized path) ───────────
  const linkSegmentsRef = useRef<LinkRenderer | null>(null)

  // ── Aggregated tier: tube links + named super-nodes ───────────────────
  // At scaleLevel ≥ 1 the super-edges become tubes and the largest super-nodes
  // get a billboard name. Both are imperative groups added to / removed from the
  // scene, mirroring the Points / LineSegments lifecycle below.
  const superLinkTubesRef = useRef<SuperLinkTubes | null>(null)
  const superNodeLabelsRef = useRef<SuperNodeLabels | null>(null)
  // Live agents' labels (useAgentMarkers fills it; declared here so the
  // engine-tick callback below can re-anchor them like the other overlays).
  const agentMarkersRef = useRef<AgentMarkers | null>(null)

  // ── Cleanup cached Three.js resources on unmount ────────────────────────
  useEffect(() => {
    return () => {
      disposeNodeCaches()
      // Dispose community hulls if any
      if (communityHullsRef.current) {
        disposeCommunityHulls(communityHullsRef.current)
        communityHullsRef.current = null
      }
      // Dispose community rings if any
      if (communityRingsRef.current) {
        disposeCommunityRings(communityRingsRef.current)
        communityRingsRef.current = null
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

  // wake: container resized / fullscreen toggled / window resized.
  // Covers every size change, including the sub-50px ones the effect above
  // deliberately ignores.
  useEffect(() => {
    wake(1000)
  }, [dimensions, wake])

  // ── Device pixel ratio: the CEILING only ─────────────────────────────────
  // The ratio in force is owned by the render loop's frame budget
  // (useRenderLoop + frameQuality.ts): it opens at `min(1.5, devicePixelRatio)`
  // — po-graph's `PR0`, po-graph.js:271 — and steps down 0.5 at a time when the
  // measured frame interval says the machine cannot follow. This effect reports
  // the ceiling, and re-reports it when the screen changes: a window dragged to
  // another display changes the ratio without a resize, which po-graph watches
  // through `matchMedia('(resolution: Xdppx)')`.
  useEffect(() => {
    // The zoom-adapted ceiling, not the bare one: a resize while zoomed in must
    // not throw the close-up back to the overview's sharpness.
    const max = zoomedPixelRatioCeiling()
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    const onChange = () => {
      setMaxPixelRatio(zoomedPixelRatioCeiling())
      wake(WAKE_MUTATION_MS)
    }
    setMaxPixelRatio(max)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [dimensions, setMaxPixelRatio, zoomedPixelRatioCeiling, wake])

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

  // ── Multi-scale aggregation (see graphAggregation.ts) ──────────────────
  // scaleLevel 0 = detail (raw nodes); >0 = super-nodes grouped by COMMUNITY,
  // not by a blind 3D grid: the bundles then mean something — one edge per pair
  // of communities, thickness = how many real links it replaces. That is what
  // turns 40 000 threads into thirty readable strands. A node with no
  // `groupKey` still falls back to the grid (see aggregateByGroup).
  const aggregated = scaleLevel > 0
  const scaleRes = aggregated ? resolutionForLevel(graphData.nodes.length, scaleLevel) : 0
  const displayData = useMemo(() => {
    // An opened community wins over the aggregation step: it shows its real
    // members, so a click inside it reaches an actual element (its fiche, its
    // framing) instead of the community blob.
    if (drilledCommunity != null) {
      const members = graphData.nodes.filter((n) => n.communityId === drilledCommunity)
      if (members.length > 0) {
        const ids = new Set(members.map((n) => n.id))
        return {
          nodes: members,
          links: graphData.links.filter((l) => ids.has(l.source) && ids.has(l.target)),
        }
      }
    }
    if (!aggregated || scaleRes <= 0 || graphData.nodes.length === 0) return graphData
    return buildGroupedGraph(graphData, scaleRes)
  }, [aggregated, scaleRes, graphData, drilledCommunity])

  // True in the optimized path (minimal quality: ≥500 nodes, particles off):
  // links are drawn as ONE LineSegments instead of one cylinder per link.
  // Aggregated tiers always draw points + segments (few, size-coded super-nodes).
  const useOptimizedLinks = aggregated || getNodeQuality() === 'minimal'

  // Above NODE_POINTS_THRESHOLD the sprite path (a Group + 3 sprites per node)
  // stops scaling, so nodes are drawn as ONE THREE.Points instead (see
  // nodePoints.ts). Below it, the rich sprite identity (emoji + ring + label)
  // is kept. The threshold keeps the familiar look for everyday graphs and
  // switches to the overview tier only when the count would choke WebGL.
  const useOptimizedNodes = aggregated || graphData.nodes.length >= NODE_POINTS_THRESHOLD

  // wake: new data arrived (REST load, WebSocket update, preset/filter change).
  // ForceGraph3D rebuilds its node/link objects inside tickFrame(), and the
  // force engine restarts, so the loop must be running. `setEngineRunning(true)`
  // keeps it running until onEngineStop fires, however long the layout takes.
  useEffect(() => {
    setEngineRunning(true)
    wake(WAKE_DATA_MS)
  }, [graphData, wake, setEngineRunning])

  // ── Freeze the force simulation — the layout is deterministic ───────────
  // Nodes are placed by useGraph3DLayout's Fermat-spiral pass (O(N log N),
  // instant), so there is nothing to "settle": run zero ticks. This removes
  // the multi-second jiggle that made the graph feel slow to load, and the
  // per-frame force cost. The library still positions node objects from
  // node.x/y/z on its single tick (see three-forcegraph's tickFrame).
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.cooldownTicks !== 'function') return
    fg.cooldownTicks(0)
  }, [graphData])

  // ── Community hulls — rebuild when data changes or toggle flips ────────
  // graphData.nodes positions are mutable (d3-force updates x/y/z in-place),
  // so we rebuild hulls on engine stop (positions final) and on toggle change.
  const hullNeedsRebuildRef = useRef(false)

  // Mark for rebuild when toggle changes or data changes
  useEffect(() => {
    hullNeedsRebuildRef.current = true
  }, [showCommunityHulls, graphData.nodes])

  // A cheap, stable signature of "which communities exist and how big they are".
  // Positions are deterministic per node set, so this is all the hulls depend on.
  const hullSignature = useMemo(() => {
    // Hulls exist only at the aggregated tier, where the "communities" are the
    // capped semantic groups (community / directory), not the raw Louvain ids.
    if (!aggregated || scaleRes <= 0) return ''
    let total = 0
    let seen = ''
    const counts = new Map<number, number>()
    for (const node of groupHullNodes(graphData.nodes, scaleRes)) {
      if (node.communityId == null) continue
      total++
      counts.set(node.communityId, (counts.get(node.communityId) ?? 0) + 1)
    }
    for (const [id, c] of [...counts].sort((a, b) => a[0] - b[0])) seen += `${id}:${c},`
    return `${total}|${seen}`
  }, [graphData.nodes, aggregated, scaleRes])

  // The callback reads the CURRENT nodes without depending on their identity.
  const nodesRef = useRef(graphData.nodes)
  const scaleResRef = useRef(scaleRes)
  useEffect(() => {
    scaleResRef.current = scaleRes
  }, [scaleRes])
  useEffect(() => {
    nodesRef.current = graphData.nodes
  }, [graphData.nodes])

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
      // Remove previous rings
      if (communityRingsRef.current) {
        scene.remove(communityRingsRef.current.group)
        disposeCommunityRings(communityRingsRef.current)
        communityRingsRef.current = null
      }
      communityIndexRef.current = new Map()

      const current = nodesRef.current
      // Halos are one convex hull per community: past the tier's node threshold
      // (low-end phones) they are skipped, whatever the toggle says.
      if (!showCommunityHulls || current.length === 0 || current.length > DEVICE_BUDGET.maxNodesForHulls) return

      // Hulls exist ONLY at the aggregated tier, where the "communities" are the
      // capped semantic groups (community / directory). At the detail tier every
      // node is its own cluster, so an envelope would swallow the graph — the
      // fan-triangulated hull of 02/11 covered the whole scene in solid colour.
      if (!aggregated || scaleRes <= 0) return

      // Wrap each capped group's REAL members (the super-nodes alone are 24
      // points): `groupHullNodes` renumbers the groups biggest-first so the
      // envelope selection is stable and size-ordered.
      const hullNodes = groupHullNodes(current, scaleRes)

      const hullGroup = buildCommunityHulls(hullNodes, {})
      if (hullGroup.hulls.length > 0) {
        scene.add(hullGroup.group)
        communityHullsRef.current = hullGroup
        communityIndexRef.current = buildCommunityIndex(hullNodes)
      }

      // Two thin rings per community (p50 core, p90 halo), built once here with
      // the same member set and bounds as the envelopes — never in the loop.
      const ringGroup = buildCommunityRings(hullNodes, {})
      if (ringGroup.rings.length > 0) {
        scene.add(ringGroup.group)
        communityRingsRef.current = ringGroup
      }
    } catch (err) {
      console.warn('[IntelligenceGraph3D] community hulls error:', err)
    } finally {
      // wake: hull meshes were added to or removed from the scene.
      wake(WAKE_MUTATION_MS)
    }
    // Memoised on the SIGNATURE, not on the array identity: the transform
    // recreates `graphData.nodes` on every update (WebSocket event, cache hit),
    // and this callback used to change with it — which re-ran the effect below
    // and rebuilt a convex hull per community, on the
    // main thread, for an identical result. That is the "layout blocks".
  }, [showCommunityHulls, hullSignature, aggregated, scaleRes, wake])

  // Rebuild when toggle changes (immediate — user clicked the button)
  useEffect(() => {
    // Small delay to let ForceGraph3D mount its scene
    const timer = setTimeout(() => rebuildCommunityHulls(), 100)
    return () => clearTimeout(timer)
  }, [showCommunityHulls, rebuildCommunityHulls])

  // ── Force-layout lifecycle → render loop ────────────────────────────────
  // onEngineTick fires on every simulation tick: node positions are moving, so
  // the loop must keep running. onEngineStop releases that keep-alive.
  const onEngineTick = useCallback(() => {
    setEngineRunning(true)
    // The force sim has just advanced node x/y/z (layoutTick fires this AFTER
    // state.layout.tick()), so the single LineSegments / Points must re-read positions.
    linkSegmentsRef.current?.updatePositions()
    nodePointsRef.current?.updatePositions()
    superLinkTubesRef.current?.updatePositions()
    superNodeLabelsRef.current?.updatePositions()
    agentMarkersRef.current?.updatePositions()
  }, [setEngineRunning])

  // ── A full graph must stay readable: open aggregated past a threshold ─────
  // Above this many nodes the raw cloud is a texture, not a structure. The view
  // opens one step aggregated (≈5:1 per cell) ONCE per graph size, so the user
  // still sees everything — grouped — and can come back to detail with the
  // stepper. The ref keeps it from fighting a manual choice.
  const autoScaledForRef = useRef(0)
  useEffect(() => {
    const count = graphData.nodes.length
    if (count <= AUTO_AGGREGATE_ABOVE) return
    if (autoScaledForRef.current === count) return
    autoScaledForRef.current = count
    if (scaleLevel === 0) setScaleLevel(1)
  }, [graphData.nodes.length, scaleLevel, setScaleLevel])

  // ── Manual-interaction guard: an automatic re-frame never fights a gesture ─
  // OrbitControls fires `start` when the user begins orbiting/panning/zooming
  // and `end` when the gesture settles. While a gesture is in flight the
  // framing effect below is skipped, so a re-frame cannot yank the camera
  // out from under the user's hand.
  const userInteractingRef = useRef(false)

  // ── Multi-scale zoom: the camera distance picks the aggregation step ─────
  // The answer to "millions of single links": above the detail, links are drawn
  // as bundles between groups and zooming IN degroups them a step at a time
  // (po-graph's semantic zoom).
  //
  // Thresholds are expressed in a CHARACTERISTIC CLUSTER RADIUS, not in the
  // graph's own radius. A ratio against the whole graph is the wrong yardstick:
  // at 1.7× the graph's radius the clusters are still tiny on screen, so the
  // view degrouped before the user could read the level they were on. Measured
  // against one cluster, the level only changes when the members are really
  // distinguishable or really blurred:
  //
  //   • DEGROUP_DISTANCE_RATIO = 3 — closer than 3× a cluster radius, the
  //     members spread over ≈1 cluster radius and become resolvable, so one
  //     step DOWN is allowed.
  //   • REGROUP_DISTANCE_RATIO = 6 — further than 6× a cluster radius, the
  //     cluster is small enough that its internal detail is lost, so one step
  //     UP is safe.
  //
  // The 3×…6× gap is the dead zone (hysteresis): the level holds inside it, so
  // a boundary never flickers. The decision itself is the pure function
  // `nextScaleLevel` (scaleDecision.ts), unit-tested without WebGL.
  //
  // The characteristic radius is the MEDIAN super-node radius of the current
  // tier — or of the first aggregated tier while at the detail level, where
  // there are no super-nodes yet. Median, not mean: one huge catch-all group
  // ("everything else") must not drag a mean out to its own scale.

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.controls !== 'function') return
    const controls = fg.controls()
    if (!controls || typeof controls.addEventListener !== 'function') return
    const onEnd = () => {
      userInteractingRef.current = false
      const camera = typeof fg.camera === 'function' ? fg.camera() : null
      const target = controls.target
      if (!camera || !target) return
      const distance = camera.position.distanceTo(target)
      // Ladder on the radius of the WHOLE graph, not on a cluster's: the
      // cluster radius is dragged out by the catch-all group, so the camera
      // never got close enough to reach the detail level — near and far both
      // showed few points, and the scale looked inverted. With the graph
      // radius, zooming in always ends at the detail (most points) and
      // zooming out at the coarsest (fewest).
      let radius = 40
      for (const n of graphData.nodes) {
        radius = Math.max(radius, Math.hypot(n.x, n.y, n.z))
      }
      setScaleLevel((current) => {
        const next = nextScaleLevel(distance, radius, current)
        return Math.max(0, Math.min(MAX_SCALE, next))
      })
    }
    const onStart = () => {
      userInteractingRef.current = true
    }
    // uDensK and the pixel ratio ceiling follow the camera distance.
    // - uDensK: setCameraDistance only touches the uniform when the factor moves.
    // - Ceiling: closer = sharper. The ceiling is stepped (ZOOM_RATIO_QUANTUM),
    //   so a smooth zoom crosses a few values, and `setZoomPixelRatioCeiling`
    //   is a no-op when it did not move — no canvas resize per frame. It keeps
    //   the budget's drop history: a zoom is the same screen, not a new one.
    const onChange = () => {
      const camera = typeof fg.camera === 'function' ? fg.camera() : null
      if (!camera || !controls.target) return
      nodePointsRef.current?.setCameraDistance(camera.position.distanceTo(controls.target))
      setZoomPixelRatioCeiling(zoomedPixelRatioCeiling())
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)
    controls.addEventListener('change', onChange)
    return () => {
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      controls.removeEventListener('change', onChange)
    }
  }, [graphData.nodes, setScaleLevel, setZoomPixelRatioCeiling, zoomedPixelRatioCeiling])

  // ── Data identity: re-frame once per dataset, not once per node count ───
  // `needsRelayout` is a boolean that stays `true` across a dataset swap, and
  // `graphData.nodes.length` does not change when two projects happen to have
  // the same number of nodes — so a framing effect keyed on those two kept the
  // camera from the previous view ("trop près / trop loin / nuage coupé"). This
  // signature flips every time the node set changes, so the effect below
  // re-frames exactly once per dataset.
  const nodeSetKey = useMemo(() => nodeSetSignature(graphData.nodes), [graphData.nodes])

  // ── Frame the graph after every layout ───────────────────────────────────
  // `zoomToFit` lived only in `onEngineStop`. The simulation is FROZEN here
  // (cooldownTicks/TIME/warmup all 0), so that event may never fire: the camera
  // stayed at the library's default distance and the graph read as tiny and far
  // away — the user's « c'est très très éloigné ». A layout that actually moved
  // nodes re-frames, with a tight padding so the cloud fills the viewport.
  // Whether this mount of the library has been framed once. A node set that
  // arrives with `needsRelayout = false` (a small WebSocket update) does not
  // re-frame — but the FIRST framing of a freshly mounted canvas must happen
  // whatever the last update was: opening the 3D view on loaded data mounts the
  // library after the data, and nothing was framed yet.
  const framedOnceRef = useRef(false)
  useEffect(() => {
    if (graphData.nodes.length === 0) return
    if (!needsRelayout && framedOnceRef.current) return
    const fg = graphRef.current
    if (!fg || typeof fg.cameraPosition !== 'function') return
    const id = setTimeout(() => {
      // A manual orbit/zoom started while we waited: the user's gesture wins.
      if (userInteractingRef.current) return
      try {
        const camera = fg.camera() as THREE.PerspectiveCamera
        const nodes = graphData.nodes
        // Bounding sphere of what is actually drawn, not the library's own
        // estimate: `zoomToFit(padding)` adds SPACE AROUND, so a large padding
        // shrinks the scene — which is exactly what "la scène est trop petite"
        // was. The distance is computed from the sphere and the camera's own
        // FOV, so the cloud fills the viewport whatever its size or the window.
        let cx = 0
        let cy = 0
        let cz = 0
        for (const n of nodes) {
          cx += n.x
          cy += n.y
          cz += n.z
        }
        cx /= nodes.length
        cy /= nodes.length
        cz /= nodes.length
        let radius = 40
        for (const n of nodes) {
          radius = Math.max(radius, Math.hypot(n.x - cx, n.y - cy, n.z - cz))
        }
        const fov = ((camera?.fov ?? 45) * Math.PI) / 180
        const distance = (radius / Math.sin(fov / 2)) * 1.06
        // This is the FRAMING distance: what is nearer than it stays sharp, so
        // the density distance factor uses it as its near bound (see nodePoints).
        framingDistanceRef.current = distance
        nodePointsRef.current?.setFramingDistance(distance)
        // A fixed far plane clips the cloud as soon as you back away far enough
        // to see it whole — the user's « je ne peux pas reculer assez pour voir
        // tous les points ». The frustum and the controls' own limit follow the
        // graph's size instead of a library default.
        if (camera) {
          const far = Math.max(camera.far, distance * 4)
          if (far !== camera.far) {
            camera.far = far
            camera.updateProjectionMatrix()
          }
        }
        const orbit = typeof fg.controls === 'function' ? fg.controls() : null
        if (orbit) {
          const max = distance * 3
          if (typeof orbit.maxDistance === 'number' && orbit.maxDistance < max) {
            orbit.maxDistance = max
            orbit.update?.()
          }
        }
        // Keep the current viewing direction so a re-frame never spins the view.
        const offset = new THREE.Vector3(
          camera.position.x - cx,
          camera.position.y - cy,
          camera.position.z - cz,
        )
        if (offset.lengthSq() < 1) offset.set(0, 0.25, 1)
        offset.normalize().multiplyScalar(distance)
        fg.cameraPosition(
          { x: cx + offset.x, y: cy + offset.y, z: cz + offset.z },
          { x: cx, y: cy, z: cz },
          600,
        )
        framedOnceRef.current = true
        wake(1200)
      } catch {
        // the library is not fully mounted yet — the next layout will frame it
      }
    }, 120)
    return () => clearTimeout(id)
    // FULLSCREEN STABILITY: this effect re-frames on a DATA change (nodeSetKey)
    // and when the library MOUNTS (hasDimensions flips once), never on a size
    // change (dimensions). The aspect ratio is handled by the "Force renderer
    // resize on fullscreen transitions" effect above, which updates
    // camera.aspect without repositioning. A fullscreen toggle must NOT reset
    // the projection — the user explicitly asked to keep the same view
    // ("je veux rester sur la même projection").
    // eslint-disable-next-line react-hooks/exhaustive-deps -- needsRelayout and graphData.nodes are read at the time of the key change on purpose
  }, [nodeSetKey, hasDimensions, wake])

  // ── Save positions when simulation stops ────────────────────────────────
  const onEngineStop = useCallback(() => {
    // wake: the layout just settled — the hull rebuild below still needs frames.
    // No camera move here: the framing effect above is the ONE framing path.
    // A `zoomToFit(800, 80)` used to fire 100 ms after it (cooldownTicks = 0
    // stops the engine on the first frame), tween over it and end on the
    // padding-80 framing that made the scene too small.
    setEngineRunning(false)
    wake(1600)

    if (graphData.nodes.length > 0) {
      savePositions(graphData.nodes)
      // Rebuild community hulls now that positions are final
      if (hullNeedsRebuildRef.current) {
        hullNeedsRebuildRef.current = false
        rebuildCommunityHulls()
      }

    }
  }, [graphData.nodes, savePositions, rebuildCommunityHulls, wake, setEngineRunning])

  // Cleanup hulls on unmount
  useEffect(() => {
    return () => {
      disposeCommunityHulls(communityHullsRef.current)
      communityHullsRef.current = null
      disposeCommunityRings(communityRingsRef.current)
      communityRingsRef.current = null
    }
  }, [])

  // ── Highlight: hover AND selection coexist simultaneously ──────────────
  const hasAnyHighlight = !!hoveredNodeId || !!selectedNodeId

  // wake: hover / selection changed → linkColor, linkWidth, linkParticleColor
  // and nodeOpacity are all re-evaluated by ForceGraph3D on the next frame.
  // (Hover usually already keeps the loop awake via pointermove, but selection
  // can also change from the Esc key or from outside the canvas.)
  useEffect(() => {
    wake(WAKE_MUTATION_MS)
  }, [hoveredNodeId, selectedNodeId, wake])

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
    return createNodeObject(node, t)
  }, [t])

  // ── Highlight colors ─────────────────────────────────────────────────────
  const HIGHLIGHT_COLOR_HOVER = '#F59E0B'   // amber-500
  const HIGHLIGHT_COLOR_SELECT = '#22D3EE'  // cyan-400
  const ACTIVATION_COLOR_EDGE = '#34D399'    // emerald-400 (active synapse edges)
  // No colour override for the bridges. A near-white here repainted EVERY link
  // that crosses two communities — and with hulls on by default that is most of
  // them, so the whole graph read as one white web ("les liens sont toujours
  // blancs"). The connection scale in computeLinkStyle (inter > neighbor >
  // intra) already makes them stand out; the relation hue stays, so the types
  // remain readable.

  // ── Link colour, WITHOUT transient hover ──────────────────────────────
  // Covers spreading activation, selection (cyan + dim), group highlight and
  // inter-community edges. The Points-tier LineSegments bulk recolor uses this:
  // it must NOT depend on hoveredNodeId, or every hover change would rewrite
  // the whole crate (O(E) per frame). Hover is a separate amber overlay.
  const baseLinkColor = useCallback((link: Graph3DLink) => {
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

    // Selection (persistent focus) — cyan for connected, dim the rest.
    if (selectedNodeId) {
      const isSelectConnected = sourceId === selectedNodeId || targetId === selectedNodeId
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

    // Inter-community edges keep their relation colour: their SCALE (neighbor /
    // inter) raises the alpha in computeLinkStyle, never their hue.

    return link.color
  }, [selectedNodeId, activation, showCommunityHulls, highlightedGroup])

  // ── Link colour for the sprite path (library cylinders) ───────────────
  // Hover (amber) takes visual priority over selection on shared edges and
  // fades the rest. The small-graph path can afford the O(E) the library pays
  // to re-evaluate accessors on every hover change.
  const linkColor = useCallback((link: Graph3DLink) => {
    if (hoveredNodeId) {
      const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
      const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target
      const connected = sourceId === hoveredNodeId || targetId === hoveredNodeId
      if (connected) return HIGHLIGHT_COLOR_HOVER
      if (!selectedNodeId) return 'rgba(107, 114, 128, 0.08)'
    }
    return baseLinkColor(link)
  }, [hoveredNodeId, selectedNodeId, baseLinkColor])

  // ── Per-link style for the optimized LineSegments path ────────────────
  // Turns a link colour string into the LineSegments per-vertex RGB + alpha,
  // baking the same `linkOpacity * colorAlpha(color)` the cylinders use, plus
  // the weight/family/bridge modulation. Shared by the bulk recolor and the
  // hover amber overlay so both stay in lockstep.
  const linkStyleFromColor = useCallback((link: Graph3DLink, color: string): LinkStyle => {
    const p = parseColor(color)
    // Edge weight drives opacity (weak links fade, strong links stand out) and
    // the relation FAMILY drives the base (structure > knowledge > tissue) —
    // see linkFamily.ts. A focused link (hover / selection / activation) keeps
    // its full strength: the calm only applies to the resting web, otherwise
    // the link under the cursor would vanish.
    const emphasised = color === HIGHLIGHT_COLOR_HOVER || color === HIGHLIGHT_COLOR_SELECT || color === ACTIVATION_COLOR_EDGE
    const a = computeLinkAlpha({
      familyAlpha: linkFamilyAlpha(link.relationType),
      weight: link.weight ?? 0.5,
      colorAlpha: p.a,
      linkCount: graphData.links.length,
      isInterCommunity: link.isInterCommunity,
      emphasised,
    })
    return { r: p.r, g: p.g, b: p.b, a }
  }, [graphData.links.length])

  // Node lookup for the resting link style: which layer/community each endpoint
  // sits in. Built from the same graph the style is evaluated against.
  const nodesById = useMemo(() => {
    const m = new Map<string, Graph3DNode>()
    for (const n of graphData.nodes) m.set(n.id, n)
    return m
  }, [graphData.nodes])

  // ── Hover focus: the group under the cursor ─────────────────────────────
  // Hovering a node focuses its GROUP, not the node itself. Two consequences:
  //   • every link of that group gains, every other link recedes (linkFocus);
  //   • moving from one node to another INSIDE the same group does not change
  //     `focusGroupKey`, so it does not trigger a second O(E) recolour — the
  //     node-level amber spotlight stays the only per-node cost.
  const focusGroupKey = useMemo(() => {
    if (!hoveredNodeId) return null
    return nodesById.get(hoveredNodeId)?.groupKey ?? null
  }, [hoveredNodeId, nodesById])

  // Group of each link's two ends, in link order — computed once per graph
  // change, never per hover move.
  const linkGroups = useMemo(() => {
    const endId = (end: unknown): string =>
      typeof end === 'object' && end !== null ? (end as Graph3DNode).id : String(end)
    return graphData.links.map((l) => ({
      sourceGroup: nodesById.get(endId(l.source))?.groupKey ?? null,
      targetGroup: nodesById.get(endId(l.target))?.groupKey ?? null,
    }))
  }, [graphData.links, nodesById])

  // How many links sit inside / across / outside the focused group. This is the
  // density denominator: each class is faded against ITSELF, not against the
  // whole graph (see linkFocus.ts for why the difference is visible).
  const focusCounts = useMemo(() => countLinksByFocus(linkGroups, focusGroupKey), [linkGroups, focusGroupKey])

  // Resting style: a gradient from the source's layer colour to the target's,
  // with the connection scale (intra/neighbor/inter) deciding the opacity. The
  // relation family no longer sets the resting alpha — the scale does — but the
  // family still picks the direction (arrow heads) and the highlight path keeps
  // its family-based alpha (linkStyleFromColor above).
  const computeLinkStyle = useCallback((link: Graph3DLink): LinkStyle => {
    const sourceId = typeof link.source === 'object' ? (link.source as Graph3DNode).id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as Graph3DNode).id : link.target
    const sNode = nodesById.get(sourceId)
    const tNode = nodesById.get(targetId)
    const scale = classifyLinkScale(
      { layer: sNode?.layer ?? link.layer, communityId: sNode?.communityId ?? link.sourceCommunityId },
      { layer: tNode?.layer ?? link.layer, communityId: tNode?.communityId ?? link.targetCommunityId },
    )
    const start = layerRgb(sNode?.layer)
    const end = layerRgb(tNode?.layer)
    // Where this link sits relative to the group under the cursor, and the
    // density of THAT class — the two halves of the client's request.
    const focus = classifyLinkFocus(sNode?.groupKey, tNode?.groupKey, focusGroupKey)
    const a = computeLinkAlpha({
      familyAlpha: linkScaleAlpha(scale),
      weight: link.weight ?? 0.5,
      colorAlpha: 1,
      linkCount: graphData.links.length,
      isInterCommunity: false,
      emphasised: false,
      gain: focus ? LINK_FOCUS_GAIN[focus] : 1,
      densityCount: focus && focusCounts ? focusCounts[focus] : graphData.links.length,
    })
    return { r: start.r, g: start.g, b: start.b, r2: end.r, g2: end.g, b2: end.b, a }
  }, [nodesById, graphData.links.length, focusGroupKey, focusCounts])

  // ── Base node size (before any highlight / dim / hover) ───────────────
  // Super-nodes scale with the bundle count (area ∝ count); individual nodes
  // use the per-type size times a degree weight so a hub reads bigger than a
  // leaf. Extracted from computeNodeStyle so the hover spotlight can re-derive
  // its "size × 1.6" boost from the BASE size — never from an already-boosted
  // selection size, which would compound to ×2.56.
  const baseNodeSize = useCallback((node: Graph3DNode): number => {
    const count = node.data.count as number | undefined
    const isSuper = typeof count === 'number' && count > 1
    if (isSuper) return 3 + 2.6 * Math.sqrt(count)
    const deg = (node.degree ?? 0) as number
    const weightGain = 1 + 0.55 * Math.log1p(deg) / Math.log1p(24)
    return sizeForType(node.entityType) * weightGain
  }, [])

  // ── Per-node style for the overview (Points) tier ─────────────────────
  // This is the Points analogue of the five sprite-mutation effects below
  // (heatmap / legend / project / group / dim): one pure function returning
  // each node's final color, alpha, size, shape and activation. Priority is
  // the same — activation > selection > legend > project > group > dim.
  // (Hover is NOT part of this function: it is a transient spotlight applied
  // on top via targeted writes — see the hover effect below — so a hover move
  // never re-evaluates the whole crate.)
  const computeNodeStyle = useCallback((node: Graph3DNode): NodeStyle => {
    const entityType = node.entityType
    // Colour channel: LAYER when aggregated (scale ≥ 1), entity TYPE in detail.
    const base = resolveNodeBaseRgb(aggregated, node.layer, ENTITY_RGB[entityType] ?? DEFAULT_NODE_RGB)
    // Super-nodes (aggregated) are sized by how many nodes they bundle (area ∝
    // count), coloured/shaped by their dominant type. Individual nodes use the
    // per-type size.
    const count = node.data.count as number | undefined
    const isSuper = typeof count === 'number' && count > 1
    const shape = isSuper ? 0 : shapeForType(entityType)
    const size = baseNodeSize(node)
    const energy = Math.min(1, Math.max(0, (node.data.energy as number) ?? 0))
    const isActive = activation.phase !== 'idle' && activation.phase !== 'searching'

    // ── Heatmap (energy for notes / churn for files) ──
    if (energyHeatmap || touchesHeatmap) {
      if (energyHeatmap && entityType === 'note') {
        const c = energyToColor3(energy)
        return { r: c.r, g: c.g, b: c.b, alpha: 0.6 + energy * 0.4, size, shape, act: 0 }
      }
      if (touchesHeatmap && entityType === 'file') {
        const attrs = node.data.attributes as Record<string, unknown> | undefined
        const churn = Math.min(1, Math.max(0, (attrs?.churnScore as number) ?? (node.data.churnScore as number) ?? 0))
        if (churn > 0) {
          const c = churnToColor3(churn)
          return { r: c.r, g: c.g, b: c.b, alpha: 0.6 + churn * 0.4, size, shape, act: 0 }
        }
      }
      return { r: base.r, g: base.g, b: base.b, alpha: 0.15, size, shape, act: 0 }
    }

    // ── Spreading activation ──
    if (isActive) {
      if (activationMatches(node.id, activation.directIds)) {
        return { r: base.r, g: base.g, b: base.b, alpha: 1, size: size * 1.4, shape, act: 0.9 }
      }
      if (activationMatches(node.id, activation.propagatedIds)) {
        return { r: base.r, g: base.g, b: base.b, alpha: 0.85, size: size * 1.15, shape, act: 0.45 }
      }
      return { r: base.r, g: base.g, b: base.b, alpha: 0.12, size: size * 0.7, shape, act: 0 }
    }

    // ── Selection (persistent focus: dim the rest, boost the selected) ──
    // Hover is deliberately NOT here — it is a transient spotlight applied on
    // top via targeted writes, so a hover move is O(1) instead of O(N).
    if (selectedNodeId) {
      if (node.id === selectedNodeId) {
        return { r: base.r, g: base.g, b: base.b, alpha: 1, size: size * 1.6, shape, act: 0.6 }
      }
      return { r: base.r, g: base.g, b: base.b, alpha: 0.3, size, shape, act: 0 }
    }

    // ── Legend hover ──
    if (legendHoveredType) {
      const match = entityType === legendHoveredType
      return { r: base.r, g: base.g, b: base.b, alpha: match ? 1 : 0.06, size: match ? size * 1.5 : size * 0.6, shape, act: 0 }
    }

    // ── Project hover ──
    if (hoveredProjectSlug) {
      const ps = (node.data.projectSlug ?? node.data.project_slug) as string | undefined
      return { r: base.r, g: base.g, b: base.b, alpha: ps === hoveredProjectSlug ? 1 : 0.15, size, shape, act: 0 }
    }

    // ── Group highlight ──
    if (highlightedGroup) {
      const inGroup = highlightedGroup.has(entityType)
      return { r: base.r, g: base.g, b: base.b, alpha: inGroup ? 1 : 0.08, size: inGroup ? size * 1.3 : size * 0.6, shape, act: 0 }
    }

    // ── Connection-dimmed types ──
    if (dimmedEntityTypes && dimmedEntityTypes.has(entityType)) {
      return { r: base.r, g: base.g, b: base.b, alpha: 0.25, size: size * 0.6, shape, act: 0 }
    }

    return { r: base.r, g: base.g, b: base.b, alpha: 1, size, shape, act: 0 }
  }, [energyHeatmap, touchesHeatmap, activation, selectedNodeId, legendHoveredType, hoveredProjectSlug, highlightedGroup, dimmedEntityTypes, baseNodeSize, aggregated])

  /** Always-current node style fn, so the structure effect can color without re-running on every hover. */
  const computeNodeStyleRef = useRef(computeNodeStyle)
  useEffect(() => {
    computeNodeStyleRef.current = computeNodeStyle
  }, [computeNodeStyle])

  /** Always-current style fn, so the structure effect can color without re-running on hover. */
  const computeLinkStyleRef = useRef(computeLinkStyle)
  useEffect(() => {
    computeLinkStyleRef.current = computeLinkStyle
  }, [computeLinkStyle])

  /** Stable (deps-free) color→style transformer, used by the hover amber overlay. */
  const linkStyleFromColorRef = useRef(linkStyleFromColor)
  useEffect(() => {
    linkStyleFromColorRef.current = linkStyleFromColor
  }, [linkStyleFromColor])

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

  /**
   * Ensure a sprite owns its material (not shared via a cache).
   * Clones the material on first call — subsequent calls return the owned clone.
   * This prevents cross-node contamination when modifying opacity on cached materials
   * (dot sprites, hitbox sprites, and glow sprites share SpriteMaterial instances).
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
    obj.traverse((child) => {
      if (child instanceof THREE.Sprite && child.material) {
        const mat = ensureOwnedMaterial(child)
        mat.opacity = opacity
        mat.needsUpdate = true
      }
    })
  }

  // ── Spreading Activation — live 3D visual updates (extracted hook) ───
  const activationPhase = activation.phase
  useActivationSync(graphRef, graphData.nodes, wake)

  // ── Heatmap overlays — energy (notes) & churn (files) ────────────────────
  const heatmapDirtyRef = useRef<Map<AnySpriteChild, SpriteOriginal>>(new Map())

  useEffect(() => {
    // wake: this effect mutates sprite colors/opacities in place (apply AND
    // restore paths, both of which return early below).
    wake(WAKE_MUTATION_MS)

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
            const mat = ensureOwnedMaterial(child)
            mat.color = heatColor
            mat.opacity = 0.6 + energy * 0.4
            mat.needsUpdate = true
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
            const mat = ensureOwnedMaterial(child)
            mat.color = heatColor
            mat.opacity = 0.6 + churn * 0.4
            mat.needsUpdate = true
          }
        })
      } else if (isAnyHeatmap && !isNote && !isFile) {
        obj.traverse((child) => {
          if (child instanceof THREE.Sprite && child.material) {
            if (!hDirty.has(child)) { hDirty.set(child, saveSprite(child)) }
            const mat = ensureOwnedMaterial(child)
            mat.opacity = 0.15
            mat.needsUpdate = true
          }
        })
      }
    }
  }, [energyHeatmap, touchesHeatmap, graphData.nodes, activationPhase, wake])

  // ── Unified highlight effect — single source of truth for legend/project/group hover ──
  // Merged into ONE effect to eliminate race conditions between 3 independent save/restore refs.
  // Priority: activation > legendHoveredType > hoveredProjectSlug > highlightedGroup > reset
  const highlightActiveRef = useRef(false)

  useEffect(() => {
    // wake: legend / project / group hover mutates sprite opacity and node scale.
    wake(WAKE_MUTATION_MS)

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

      obj.traverse((child) => {
        if (child instanceof THREE.Sprite && child.material) {
          const mat = ensureOwnedMaterial(child)
          mat.opacity = targetOpacity
          mat.needsUpdate = true
        }
      })

      if (targetScale !== 1.0 || mode === 'none') {
        obj.scale.setScalar(targetScale)
      }
    }
  }, [legendHoveredType, hoveredProjectSlug, highlightedGroup, graphData.nodes, activationPhase, wake])

  // ── Connection-dimmed entity types (3-state group toggle) ──────────────
  // Reduces opacity + scale for nodes whose entity type is in 'connections' mode.
  // Lower priority than highlightedGroup — only active when no highlight is set.
  const dimDirtyRef = useRef<Map<AnySpriteChild, SpriteOriginal>>(new Map())
  const dimScaledRef = useRef<Map<THREE.Object3D, THREE.Vector3>>(new Map())

  useEffect(() => {
    // wake: dimming mutates sprite opacity and node scale (apply AND restore).
    wake(WAKE_MUTATION_MS)

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

      obj.traverse((child) => {
        if (child instanceof THREE.Sprite && child.material) {
          if (!dDirty.has(child)) { dDirty.set(child, saveSprite(child)) }
          const mat = ensureOwnedMaterial(child)
          mat.opacity = 0.25
          mat.needsUpdate = true
        }
      })

      if (!dScaled.has(obj)) { dScaled.set(obj, obj.scale.clone()) }
      obj.scale.setScalar(0.5)
    }
  }, [dimmedEntityTypes, highlightedGroup, legendHoveredType, hoveredProjectSlug, graphData.nodes, activationPhase, wake])

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
    // wake: camera tween — driven by tweenGroup.update() inside the render
    // loop, so it needs every frame of its 1200 ms duration (+ margin).
    wake(1700)
  }, [activationPhase, activation.directIds, activation.propagatedIds, graphData.nodes, wake])

  // ── Selected node highlight — persistent emissive ring on click ─────────
  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    // wake: selection restores/raises sprite opacity on the previous and new node.
    wake(WAKE_MUTATION_MS)

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
  }, [selectedNodeId, graphData.nodes, activation.phase, wake])

  // ── Interactions ────────────────────────────────────────────────────────
  // Double-click detection: track last click time + node id
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Focus a community: click a node, the camera frames its cluster ───────
  // On thousands of nodes "control" is not orbiting the whole cloud, it is
  // going to one group. Distance scales with the cluster radius, so a big
  // community is framed from further away and a small one from up close.
  const focusCommunity = useCallback(
    (communityId: number | undefined) => {
      const fg = graphRef.current
      if (!fg || typeof fg.cameraPosition !== 'function') return
      const focus = communityFocus(graphData.nodes, communityId)
      if (!focus) return
      // Framing, not "reset": keep the CURRENT viewing direction (a hard-coded
      // +Z was the "camera gets off-axis" complaint) and never pull back
      // further than where the user already is (a radius-proportional distance
      // was the "it zooms out instead of in" complaint).
      const camera = typeof fg.camera === 'function' ? fg.camera() : null
      const controls = typeof fg.controls === 'function' ? fg.controls() : null
      const target = controls?.target ?? { x: focus.x, y: focus.y, z: focus.z }
      const wanted = Math.max(80, focus.radius * 2.2)
      let offset = { x: 0, y: 0.25, z: 1 }
      let current = wanted
      if (camera) {
        const ox = camera.position.x - target.x
        const oy = camera.position.y - target.y
        const oz = camera.position.z - target.z
        const len = Math.hypot(ox, oy, oz)
        if (len > 1e-3) offset = { x: ox / len, y: oy / len, z: oz / len }
        current = len
      }
      const distance = Math.min(Math.max(current, 40), wanted)
      try {
        fg.cameraPosition(
          {
            x: focus.x + offset.x * distance,
            y: focus.y + offset.y * distance,
            z: focus.z + offset.z * distance,
          },
          { x: focus.x, y: focus.y, z: focus.z },
          700,
        )
        wake(1500)
      } catch {
        // the library is not mounted yet — the next click will frame it
      }
    },
    [graphData.nodes, wake],
  )

  const focusCommunityOf = useCallback(
    (nodeId: string) => {
      const node = graphData.nodes.find((n) => n.id === nodeId)
      focusCommunity(node?.communityId)
    },
    [graphData.nodes, focusCommunity],
  )

  // The Points pick lives in an effect with a narrow dependency list; it reads
  // the latest callbacks through refs so a click never frames a stale graph.
  const focusCommunityOfRef = useRef(focusCommunityOf)
  useEffect(() => {
    focusCommunityOfRef.current = focusCommunityOf
  }, [focusCommunityOf])
  const focusCommunityOfRef2 = useRef(focusCommunityOf)
  useEffect(() => {
    focusCommunityOfRef2.current = focusCommunityOf
  }, [focusCommunityOf])
  const focusCommunityRef = useRef(focusCommunity)
  useEffect(() => {
    focusCommunityRef.current = focusCommunity
  }, [focusCommunity])

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
      // Double-click frames the node's community (the explicit "go there").
      focusCommunityOfRef2.current(node.id)
      onNodeDoubleClick?.(node.id)
      return
    }

    // Record click and defer single-click action
    lastClickRef.current = { nodeId: node.id, time: now }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      // A single click SELECTS and does not move the camera: framing on every
      // click yanked the user inside a cluster and hid the rest of the graph
      // ("le zoom m'empêche de tout voir"). Framing is an explicit gesture:
      // double-click on a node, or a click on a community face.
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
      if (e.key !== 'Escape') return
      // Never clear the selection while the user is typing in a search/chat
      // field: there Esc closes the field, not the selection.
      if (isEditableTarget(e.target)) return
      setSelectedNodeId(null)
      setHoveredNodeId(null)
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
    scene.background = new THREE.Color(PO_CANVAS_BG)

    // Also set clear color on renderer as belt-and-suspenders
    try {
      if (typeof fg.renderer === 'function') {
        const renderer = fg.renderer()
        if (renderer) {
          renderer.setClearColor(new THREE.Color(PO_CANVAS_BG), 1)
          // The pixel ratio is NOT set here: useRenderLoop's frame budget owns
          // it and has already applied it (it writes the renderer and the Points
          // shader together). A second writer here would undo a measured drop
          // the moment the renderer became available.
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
    // wake: background, lights, clear color and pixel ratio all change the image.
    wake(WAKE_MUTATION_MS)
    if (configureScene()) return

    const interval = setInterval(() => {
      if (configureScene()) {
        clearInterval(interval)
        wake(WAKE_MUTATION_MS)
      }
    }, 50)

    const timeout = setTimeout(() => clearInterval(interval), 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [configureScene, wake])

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

    // wake: tone-mapping exposure changes the whole rendered image.
    wake(WAKE_MUTATION_MS)
  }, [brightness, wake])

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
  // The graph that is actually rendered: aggregated super-nodes/edges when a
  // scale is active, the raw graph otherwise.
  // Never show an empty scene when the raw graph HAS nodes: if the aggregated
  // step comes back empty (a community key that resolved to nothing, a
  // resolution of 0, a future bug in the grouping), the view falls back to the
  // detail instead of a black canvas. That is the failure the user reports as
  // "« Complet » ne s'affiche toujours pas" — and a blank screen tells nobody
  // which step went wrong.
  const aggregatedEmpty = aggregated && scaleLevel > 0 && displayData.nodes.length === 0
  const activeGraphData =
    displayData.nodes.length > 0
      ? displayData
      : graphData.nodes.length > 0 && (aggregatedEmpty || !aggregated)
        ? graphData
        : emptyGraphData

  // A visible trace when the aggregated step yields nothing: one line in the
  // console says whether the graph is empty, the grouping is empty, or the
  // resolution collapsed — instead of a black canvas that explains nothing.
  useEffect(() => {
    if (!aggregatedEmpty) return
    console.warn(
      '[graph] aggregated step returned no node — falling back to detail',
      { nodes: graphData.nodes.length, links: graphData.links.length, scaleLevel, scaleRes },
    )
  }, [aggregatedEmpty, graphData.nodes.length, graphData.links.length, scaleLevel, scaleRes])

  // The aggregated tier draws its super-edges as TUBES (see superLinkTubes.ts)
  // while there are few enough of them; beyond TUBE_MAX_EDGES it falls back to
  // the single LineSegments (cheap for thousands of 1-px lines). The two are
  // mutually exclusive: never draw the same bundle twice.
  const useTubes = aggregated && activeGraphData.links.length > 0 && activeGraphData.links.length <= TUBE_MAX_EDGES

  // ── Quality-adaptive render settings ──────────────────────────────────
  const quality = getNodeQuality()
  const nodeResolution = quality === 'minimal' ? 6 : quality === 'low' ? 8 : 12
  // Disable particles for large graphs (saves draw calls). `useOptimizedLinks`
  // reads the same module state, so the two stay in lockstep.
  const enableParticles = !useOptimizedLinks

  // ── Keep-alive: animated link particles ────────────────────────────────
  // Directional particles move on EVERY frame (updatePhotons() inside
  // tickFrame). They are part of what the user sees, so we must not freeze
  // them: while any are on screen the loop stays continuous. Note that the
  // heavy case — the one that heats the phone — is a large graph, where the
  // existing LOD already turns particles off, so it can go fully idle.
  const particlesAnimating = useMemo(() => {
    if (!enableParticles) return false
    if (activationPhase !== 'idle' && activationPhase !== 'searching') return true
    return activeGraphData.links.some(
      (l) => (l.particles ?? 0) > 0 || (showCommunityHulls && l.isInterCommunity),
    )
  }, [enableParticles, activationPhase, activeGraphData, showCommunityHulls])

  useEffect(() => {
    setParticlesAnimating(particlesAnimating)
  }, [particlesAnimating, setParticlesAnimating])

  // ── Optimized link rendering — one LineSegments for all links ─────────
  // In the minimal-quality path (≥500 nodes) the library's per-link cylinders
  // (and their MeshLambertMaterial lights dependency) are suppressed via
  // `linkVisibility`, and a single LineSegments draws every edge. Built here
  // because the scene is guaranteed mounted by the time real graph data has
  // loaded (the fetch resolves well after ForceGraph3D mounts).
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return
    const scene = fg.scene()
    if (!scene) return

    // Drop any previous instance (mode flipped back, or graph changed).
    if (linkSegmentsRef.current) {
      scene.remove(linkSegmentsRef.current.object)
      linkSegmentsRef.current.dispose()
      linkSegmentsRef.current = null
    }

    if (!useOptimizedLinks || useTubes || activeGraphData.links.length === 0) return

    const seg = createLinkRenderer(activeGraphData.nodes, activeGraphData.links)
    seg.updateColors(computeLinkStyleRef.current)
    scene.add(seg.object)
    linkSegmentsRef.current = seg
    // wake: edges were added to the scene.
    wake(WAKE_MUTATION_MS)

    return () => {
      if (linkSegmentsRef.current === seg) {
        scene.remove(seg.object)
        seg.dispose()
        linkSegmentsRef.current = null
      }
    }
  }, [useOptimizedLinks, useTubes, activeGraphData, wake])

  // ── Aggregated tier — super-edges as tubes ────────────────────────────
  // At scaleLevel ≥ 1 the super-edges are few enough (≤ TUBE_MAX_EDGES) to
  // afford one cylinder each; the LineSegments effect above is skipped while
  // useTubes is true so a bundle is never drawn twice. Falls back to segments
  // automatically when the bundle count exceeds the bound (useTubes → false).
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return
    const scene = fg.scene()
    if (!scene) return

    if (superLinkTubesRef.current) {
      scene.remove(superLinkTubesRef.current.group)
      superLinkTubesRef.current.dispose()
      superLinkTubesRef.current = null
    }

    if (!useTubes) return

    const tubes = createSuperLinkTubes(activeGraphData.nodes, activeGraphData.links)
    if (!tubes) return
    scene.add(tubes.group)
    superLinkTubesRef.current = tubes
    wake(WAKE_MUTATION_MS)

    return () => {
      if (superLinkTubesRef.current === tubes) {
        scene.remove(tubes.group)
        tubes.dispose()
        superLinkTubesRef.current = null
      }
    }
  }, [useTubes, activeGraphData, wake])

  // ── Recolor links when highlight state changes ────────────────────────
  // linkColor (and thus computeLinkStyle) depends on hover / selection /
  // activation / hulls / group. The library re-evaluates its own accessors on
  // the next frame; the LineSegments must be recolored explicitly. (Cleanup of
  // the LineSegments object itself is handled by the creation effect above.)
  useEffect(() => {
    if (useOptimizedLinks) {
      linkSegmentsRef.current?.updateColors(computeLinkStyle)
    }
  }, [useOptimizedLinks, computeLinkStyle, activeGraphData])

  // ── Overview tier — one THREE.Points for all nodes ────────────────────
  // Above NODE_POINTS_THRESHOLD the library's per-node sprite objects are
  // suppressed (`nodeVisibility`) and a single Points draws every node as a
  // coloured shape. Built/removed on mode or graph change.
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return
    const scene = fg.scene()
    if (!scene) return

    if (nodePointsRef.current) {
      scene.remove(nodePointsRef.current.object)
      nodePointsRef.current.dispose()
      nodePointsRef.current = null
    }

    if (!useOptimizedNodes || activeGraphData.nodes.length === 0) return

    const np = createNodePoints(activeGraphData.nodes)
    np.updateStyles(computeNodeStyleRef.current)
    // The loop only reports CHANGES, so a Points built after a drop must adopt
    // the ratio already in force or its points would change size on the next
    // frame (gl_PointSize is in device pixels).
    np.setPixelRatio(pixelRatioRef.current)
    {
      // uDensK follows the camera distance AND the framing distance: seed both,
      // then refresh on controls 'change' (state change, not per frame).
      np.setFramingDistance(framingDistanceRef.current)
      const ctl = typeof fg.controls === 'function' ? fg.controls() : null
      const cam = typeof fg.camera === 'function' ? fg.camera() : null
      if (ctl?.target && cam) np.setCameraDistance(cam.position.distanceTo(ctl.target))
    }
    scene.add(np.object)
    nodePointsRef.current = np
    wake(WAKE_MUTATION_MS)

    return () => {
      if (nodePointsRef.current === np) {
        scene.remove(np.object)
        np.dispose()
        nodePointsRef.current = null
      }
    }
    // hasDimensions: the library mounts only once the container is measured. If the
    // graph data arrives first, this effect runs with no ForceGraph3D yet and must run
    // again when it mounts — otherwise the Points are never created above the threshold.
  }, [useOptimizedNodes, activeGraphData, wake, hasDimensions])

  // ── Aggregated tier — named super-nodes (billboard SpriteText) ────────
  // The Points above draws every super-node as a bare shape; the N largest get
  // a billboard name label so the archipel reads as named clusters. The rest
  // stay points (their name shows on hover).
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return
    const scene = fg.scene()
    if (!scene) return

    if (superNodeLabelsRef.current) {
      scene.remove(superNodeLabelsRef.current.group)
      superNodeLabelsRef.current.dispose()
      superNodeLabelsRef.current = null
    }

    if (!aggregated || activeGraphData.nodes.length === 0) return
    // One canvas texture per label: skipped on a device whose tier says the graph is too big for them.
    if (graphData.nodes.length > DEVICE_BUDGET.maxNodesForLabels) return

    const labels = createSuperNodeLabels(activeGraphData.nodes, DEVICE_BUDGET.labelLimit)
    if (labels.count === 0) return
    scene.add(labels.group)
    superNodeLabelsRef.current = labels
    wake(WAKE_MUTATION_MS)

    return () => {
      if (superNodeLabelsRef.current === labels) {
        scene.remove(labels.group)
        labels.dispose()
        superNodeLabelsRef.current = null
      }
    }
  }, [aggregated, activeGraphData, wake, hasDimensions, graphData.nodes.length])

  // Recolor points when any highlight/activation/heatmap state changes.
  useEffect(() => {
    if (useOptimizedNodes) {
      nodePointsRef.current?.updateStyles(computeNodeStyle)
    }
  }, [useOptimizedNodes, computeNodeStyle, activeGraphData])

  // ── Hover spotlight (transient, O(1) per move) ────────────────────────
  // Hover no longer dims the crate (the old `computeNodeStyle` dropped every
  // non-hovered node to alpha 0.3, which re-evaluated and rewrote all N nodes
  // on every hover change — the jitter on a 5k-node graph). It only boosts the
  // hovered node (size ×1.6, act 0.6, alpha 1) and ambers its links, applied
  // as targeted writes on top of the bulk style above. A hover move touches
  // exactly two nodes; the `prev === cur` branch re-applies the boost after a
  // bulk restyle (selection / legend / group / dim / heatmap / activation).
  const hoverSuppressed = energyHeatmap || touchesHeatmap
    || (activation.phase !== 'idle' && activation.phase !== 'searching')
  const hoverSpotlightRef = useRef<string | null>(null)

  const hoverSpotlightStyle = useCallback((node: Graph3DNode, base: NodeStyle): NodeStyle => {
    // The boost is derived from the BASE size, never from `base.size`, which
    // may already be a selection/legend boost — that would compound to ×2.56.
    return { r: base.r, g: base.g, b: base.b, alpha: 1, size: baseNodeSize(node) * 1.6, shape: base.shape, act: 0.6 }
  }, [baseNodeSize])

  useEffect(() => {
    if (!useOptimizedNodes) return
    const np = nodePointsRef.current
    if (!np) return
    const cur = hoveredNodeId
    const prev = hoverSpotlightRef.current
    hoverSpotlightRef.current = cur

    if (prev === cur) {
      // Bulk restyle overwrote everything — re-apply the boost if any.
      if (cur != null && !hoverSuppressed) {
        const idx = np.indexOf(cur)
        const node = activeGraphData.nodes.find((n) => n.id === cur)
        if (idx >= 0 && node) np.updateStyleAt(idx, hoverSpotlightStyle(node, computeNodeStyleRef.current(node)))
      }
      return
    }
    // Restore the previously boosted node to its bulk style.
    if (prev != null) {
      const idx = np.indexOf(prev)
      const node = activeGraphData.nodes.find((n) => n.id === prev)
      if (idx >= 0 && node) np.updateStyleAt(idx, computeNodeStyleRef.current(node))
    }
    // Boost the newly hovered node.
    if (cur != null && !hoverSuppressed) {
      const idx = np.indexOf(cur)
      const node = activeGraphData.nodes.find((n) => n.id === cur)
      if (idx >= 0 && node) np.updateStyleAt(idx, hoverSpotlightStyle(node, computeNodeStyleRef.current(node)))
    }
  }, [useOptimizedNodes, hoveredNodeId, computeNodeStyle, activeGraphData, hoverSuppressed, hoverSpotlightStyle])

  // ── Hover amber for links (transient, O(degree) per move) ─────────────
  const activationActive = activation.phase !== 'idle' && activation.phase !== 'searching'
  const hoverLinkSpotlightRef = useRef<string | null>(null)
  useEffect(() => {
    if (!useOptimizedLinks) return
    const seg = linkSegmentsRef.current
    if (!seg) return
    const cur = hoveredNodeId
    const prev = hoverLinkSpotlightRef.current

    if (prev === cur) {
      // Bulk recolor (selection/group/hulls/activation) overwrote everything.
      if (cur != null && !activationActive) {
        seg.updateColorsForNodes([cur], (l) => linkStyleFromColorRef.current(l, HIGHLIGHT_COLOR_HOVER))
      }
      return
    }
    hoverLinkSpotlightRef.current = cur
    const ids: string[] = []
    if (prev != null) ids.push(prev)
    if (cur != null) ids.push(cur)
    if (ids.length === 0) return
    seg.updateColorsForNodes(ids, (l) => {
      if (activationActive) return computeLinkStyleRef.current(l)
      const sid = typeof l.source === 'object' ? (l.source as Graph3DNode).id : l.source
      const tid = typeof l.target === 'object' ? (l.target as Graph3DNode).id : l.target
      const connected = cur != null && (sid === cur || tid === cur)
      return connected
        ? linkStyleFromColorRef.current(l, HIGHLIGHT_COLOR_HOVER)
        : computeLinkStyleRef.current(l)
    })
  }, [useOptimizedLinks, hoveredNodeId, computeLinkStyle, activeGraphData, activationActive])

  // ── Live: entity pulses + agents at work ──────────────────────────────
  // One rAF loop for every transient animation, alive only while one runs
  // (frameAnimator.ts): no permanent frame. `wake` is stable (useRenderLoop),
  // so the animator is created once per mount.
  const [animator] = useState(() => new FrameAnimator(wake))
  useEffect(() => () => animator.dispose(), [animator])

  // The base a pulse returns to is the bulk style PLUS the hover spotlight, so
  // a pulse ending on the hovered node restores the amber, not the bulk.
  // Refs: the frame job reads them at write time, never a stale closure.
  const hoveredNodeIdRef = useRef(hoveredNodeId)
  const hoverSuppressedRef = useRef(hoverSuppressed)
  const activationActiveRef = useRef(activationActive)
  useEffect(() => {
    hoveredNodeIdRef.current = hoveredNodeId
    hoverSuppressedRef.current = hoverSuppressed
    activationActiveRef.current = activationActive
  }, [hoveredNodeId, hoverSuppressed, activationActive])
  const liveBaseNodeStyle = useCallback((node: Graph3DNode): NodeStyle => {
    const base = computeNodeStyleRef.current(node)
    if (hoveredNodeIdRef.current === node.id && !hoverSuppressedRef.current) return hoverSpotlightStyle(node, base)
    return base
  }, [hoverSpotlightStyle])
  const liveBaseLinkStyle = useCallback((l: Graph3DLink): LinkStyle => {
    const cur = hoveredNodeIdRef.current
    if (cur != null && !activationActiveRef.current) {
      const sid = typeof l.source === 'object' ? (l.source as Graph3DNode).id : l.source
      const tid = typeof l.target === 'object' ? (l.target as Graph3DNode).id : l.target
      if (sid === cur || tid === cur) return linkStyleFromColorRef.current(l, HIGHLIGHT_COLOR_HOVER)
    }
    return computeLinkStyleRef.current(l)
  }, [HIGHLIGHT_COLOR_HOVER])

  // Entity pulses: ids published by useGraphWebSocket (graph + CRUD channels).
  useLivePulse({
    nodePointsRef,
    linkSegmentsRef,
    nodes: activeGraphData.nodes,
    baseNodeStyle: liveBaseNodeStyle,
    baseLinkStyle: liveBaseLinkStyle,
    animator,
    enabled: hasDimensions,
  })

  // Community glow: an event on an entity raises its community envelope
  // (fill + wireframe) for a named decay. Same bus, same animator.
  useCommunityActivity({
    hullsRef: communityHullsRef,
    communityIndexRef,
    animator,
    enabled: hasDimensions,
  })

  // Agents at work (GET /api/agents/live), on their chat_session / task / plan
  // node. Off at the aggregated tiers: super-node ids are group keys, no agent
  // resolves to one, and a marker on an invented spot would be a lie.
  useAgentMarkers({
    graphRef,
    nodePointsRef,
    markersRef: agentMarkersRef,
    nodes: activeGraphData.nodes,
    baseNodeStyle: liveBaseNodeStyle,
    animator,
    enabled: hasDimensions && !aggregated,
  })

  // ── Overview tier — custom pick for hover / click ─────────────────────
  // With nodeVisibility=false the library has no node objects to raycast, so
  // hover/click/double-click are driven from our own NDC projection (pick).
  const pointsClickRef = useRef<{ nodeId: string; time: number } | null>(null)
  useEffect(() => {
    if (!useOptimizedNodes) return
    const el = containerRef.current
    const fg = graphRef.current
    if (!el || !fg || typeof fg.camera !== 'function') return

    // Prepared ONCE — reusing the raycaster/vector avoids per-move allocation.
    const raycaster = new THREE.Raycaster()
    const ndcVec = new THREE.Vector2()

    /** Fill the raycaster from a pointer event and a distance-scaled threshold. */
    const aim = (ev: { clientX: number; clientY: number }): boolean => {
      const camera = fg.camera?.()
      if (!camera) return false
      const rect = el.getBoundingClientRect()
      ndcVec.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndcVec, camera)
      // Same rule as po-graph: the pick radius grows with camera distance so a
      // node stays clickable when zoomed out. `controls().target` is the orbit
      // focus; fall back to the origin if the controls are not ready.
      let dist = 400
      try {
        const c = fg.controls?.()
        if (c?.target) dist = camera.position.distanceTo(c.target)
      } catch { /* controls not mounted yet */ }
      raycaster.params.Points.threshold = Math.max(4, dist / 160)
      return true
    }

    // po-graph throttles hover picking to ~16 Hz. Unthrottled, an O(N) raycast
    // on every pointermove is what makes panning/rotating feel heavy.
    let lastPick = 0
    let rafId = 0
    let pendingEv: PointerEvent | null = null
    let lastHoverId: string | null = null
    // ── Community hulls are the "faces" ──────────────────────────────────
    // A hull is a surface, so it deserves the same treatment as a node: hover
    // raises it so the group reads as a volume, click frames the whole
    // community. Only when NO node is under the pointer, so a node always wins.
    const hullMeshes: THREE.Object3D[] = []
    const raycastHull = (): CommunityHull | null => {
      const hulls = communityHullsRef.current?.hulls ?? []
      if (hulls.length === 0) return null
      hullMeshes.length = 0
      for (const h of hulls) hullMeshes.push(h.fillMesh)
      const first = raycaster.intersectObjects(hullMeshes, false)[0]
      if (!first) return null
      const id = (first.object.userData as { communityId?: number }).communityId
      return hulls.find((h) => h.communityId === id) ?? null
    }

    let hoveredHull: CommunityHull | null = null
    const setHullHover = (next: CommunityHull | null) => {
      if (next === hoveredHull) return
      const restore = (h: CommunityHull) => {
        const m = h.fillMesh.material as THREE.MeshBasicMaterial
        const base = h.fillMesh.userData.baseOpacity
        if (typeof base === 'number') m.opacity = base
      }
      if (hoveredHull) restore(hoveredHull)
      if (next) {
        const m = next.fillMesh.material as THREE.MeshBasicMaterial
        if (typeof next.fillMesh.userData.baseOpacity !== 'number') {
          next.fillMesh.userData.baseOpacity = m.opacity
        }
        m.opacity = Math.min(0.4, (m.opacity || 0.08) * 3.5)
      }
      hoveredHull = next
      wake(WAKE_MUTATION_MS)
    }

    const runPick = () => {
      rafId = 0
      if (!pendingEv) return
      const ev = pendingEv
      pendingEv = null
      lastPick = performance.now()
      const np = nodePointsRef.current
      if (!np || !aim(ev)) return
      const hit = np.pick(raycaster)
      const hull = hit ? null : raycastHull()
      setHullHover(hull)
      const id = hit?.id ?? null
      if (id !== lastHoverId) { lastHoverId = id; setHoveredNodeId(id) }
      el.style.cursor = hit || hull ? 'pointer' : 'default'
    }

    // ── Gesture guard — touch orbit / pinch must never pick a node ──────────
    // One finger orbits, two pinch-zoom: neither is a deliberate pick. Track the
    // active pointers (on `window`, capture, so a `pointercancel` that the
    // library swallows still releases the guard) and whether the gesture moved.
    const pointersDown = new Set<number>()
    let gestureMultiTouch = false
    let gestureDragged = false
    let downPos: { x: number; y: number } | null = null
    // A tap that travels less than this is still a tap; beyond it, it is a pan.
    const MOVE_TOLERANCE_PX = 8

    const onPointerDown = (ev: PointerEvent) => {
      pointersDown.add(ev.pointerId)
      if (pointersDown.size === 1) {
        gestureMultiTouch = false
        gestureDragged = false
        downPos = { x: ev.clientX, y: ev.clientY }
      } else {
        gestureMultiTouch = true
      }
    }
    const onPointerEnd = (ev: PointerEvent) => {
      pointersDown.delete(ev.pointerId)
      if (pointersDown.size === 0) downPos = null
    }
    const trackDrag = (ev: PointerEvent) => {
      if (downPos && (Math.abs(ev.clientX - downPos.x) > MOVE_TOLERANCE_PX || Math.abs(ev.clientY - downPos.y) > MOVE_TOLERANCE_PX)) {
        gestureDragged = true
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (!nodePointsRef.current) return
      trackDrag(ev)
      // While a button is held the user is orbiting/panning the camera, not
      // pointing at a node: skip picking entirely (no O(N) style churn during
      // the drag — this is what makes panning feel heavy on the Points tier).
      // A second finger (pinch) is the same: nothing under a finger is a pick.
      if (ev.buttons !== 0 || pointersDown.size > 1) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
        if (lastHoverId) { lastHoverId = null; setHoveredNodeId(null) }
        return
      }
      // Coalesce to one pick per animation frame, and no faster than 60 Hz.
      pendingEv = ev
      if (rafId) return
      const since = performance.now() - lastPick
      if (since >= 60) runPick()
      else rafId = requestAnimationFrame(runPick)
    }

    const onClick = (ev: MouseEvent) => {
      // A pinch or a pan still emits `click` on some browsers: only a single,
      // still tap may select. These flags describe the gesture that just ended;
      // the next pointerdown resets them.
      if (gestureMultiTouch || gestureDragged) {
        gestureMultiTouch = false
        gestureDragged = false
        return
      }
      const np = nodePointsRef.current
      if (!np || !aim(ev)) return
      const hit = np.pick(raycaster)
      // A super-node IS a community: clicking it opens it (drill-down) instead
      // of selecting a blob the user cannot inspect.
      const sup = hit?.data as { count?: number } | undefined
      if (hit && typeof sup?.count === 'number' && sup.count > 1 && hit.communityId != null) {
        setDrilledCommunity(hit.communityId)
        return
      }
      if (!hit) {
        // No node: a hull face is still a target — frame the whole community.
        const hull = raycastHull()
        if (hull) { focusCommunityRef.current(hull.communityId); return }
        setSelectedNodeId(null)
        return
      }

      const now = Date.now()
      const last = pointsClickRef.current
      if (last && last.nodeId === hit.id && now - last.time < 350) {
        pointsClickRef.current = null
        onNodeDoubleClick?.(hit.id)
        return
      }
      pointsClickRef.current = { nodeId: hit.id, time: now }
      const deselect = hit.id === selectedNodeId
      setSelectedNodeId(deselect ? null : hit.id)
      if (!deselect) focusCommunityOfRef.current(hit.id)
    }

    el.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerEnd, true)
    window.addEventListener('pointercancel', onPointerEnd, true)
    el.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerEnd, true)
      el.removeEventListener('click', onClick)
      if (rafId) cancelAnimationFrame(rafId)
      el.style.cursor = 'default'
    }
    // hasDimensions: the library mounts after the data when the graph is opened
    // from the code map. Without it this effect returns early (no ForceGraph3D
    // yet) and never attaches the pick, so a click on a node selects nothing.
  }, [useOptimizedNodes, selectedNodeId, setHoveredNodeId, setSelectedNodeId, onNodeDoubleClick, hasDimensions])

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-[var(--color-surface-base)]">
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
        // Overview tier: suppress the per-node sprite objects; nodes are drawn
        // by the single Points (see effects above) and picked by our own NDC
        // projection, so the library's own node/tooltip rendering is off.
        nodeVisibility={useOptimizedNodes ? false : true}
        // Link styling — subtle lines, energy-proportional
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={LINK_OPACITY}
        // In the optimized path the library's per-link cylinders are suppressed;
        // the single LineSegments (see effects above) draws every edge instead.
        linkVisibility={useOptimizedLinks ? false : true}
        linkDirectionalParticles={enableParticles ? linkParticles : 0}
        linkDirectionalParticleSpeed={linkParticleSpeed}
        linkDirectionalParticleColor={linkParticleColor}
        linkDirectionalParticleWidth={1.0}
        // Interactions — in the overview tier our own pick drives hover/click.
        onNodeClick={useOptimizedNodes ? undefined : onNodeClick}
        onNodeHover={useOptimizedNodes ? undefined : onNodeHover}
        onNodeDrag={() => {
          // Dragged node moves without a force tick — keep edges attached.
          linkSegmentsRef.current?.updatePositions()
          superLinkTubesRef.current?.updatePositions()
          superNodeLabelsRef.current?.updatePositions()
          agentMarkersRef.current?.updatePositions()
          wake(WAKE_MUTATION_MS)
        }}
        onNodeDragEnd={(node: Graph3DNode) => {
          // Pin position after drag
          node.fx = node.x
          node.fy = node.y
          node.fz = node.z
          savePositions([node])
          // wake: the library calls resetCountdown() on drag end, so the
          // engine restarts and nodes keep moving after the pointer is up.
          setEngineRunning(true)
          wake(WAKE_DATA_MS)
        }}
        onBackgroundClick={useOptimizedNodes ? undefined : onBackgroundClick}
        // Force engine — frozen: the deterministic layout is already final.
        cooldownTicks={0}
        cooldownTime={0}
        warmupTicks={0}
        onEngineTick={onEngineTick}
        onEngineStop={onEngineStop}
        // Controls
        controlType="orbit"
        enableNavigationControls
        showNavInfo={false}
        // Renderer (init-only prop) — MSAA off on touch/narrow devices
        rendererConfig={RENDERER_CONFIG}
        // Background
        backgroundColor={PO_CANVAS_BG}
      />}

      {/* ── Scale stepper (multi-scale aggregation) — collapsible ───────── */}
      {graphData.nodes.length > 0 && (
        <GraphPanel
          id="scale"
          title={t('intelPage.graph.panels.scale')}
          icon={<ZoomIn size={12} className="text-[var(--text-tertiary)]" aria-hidden="true" />}
          className="absolute right-3 top-[4.5rem]"
        >
          <div className="flex items-center gap-1 p-0.5">
            <button
              type="button"
              aria-label={t('intelGraph.vector.zoomIn')}
              title={t('intelGraph.vector.zoomIn')}
              onClick={() => setScaleLevel((v) => Math.max(0, v - 1))}
              disabled={scaleLevel === 0}
              className="px-2 py-1.5 rounded-md text-[var(--text-secondary)] text-xs hover:text-[var(--text-primary)] hover:bg-surface-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              −
            </button>
            <span className="px-1 text-xs text-[var(--text-secondary)] tabular-nums" aria-live="polite">
              {scaleLevel === 0
                ? t('intelGraph.scale.nodes', { count: graphData.nodes.length })
                : t('intelGraph.scale.groups', { count: activeGraphData.nodes.length })}
            </span>
            <button
              type="button"
              aria-label={t('intelGraph.vector.zoomOut')}
              title={t('intelGraph.vector.zoomOut')}
              onClick={() => setScaleLevel((v) => Math.min(MAX_SCALE, v + 1))}
              disabled={scaleLevel >= MAX_SCALE}
              className="px-2 py-1.5 rounded-md text-[var(--text-secondary)] text-xs hover:text-[var(--text-primary)] hover:bg-surface-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </GraphPanel>
      )}
    </div>
  )
}
