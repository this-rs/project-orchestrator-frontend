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
import { createLinkRenderer, parseColor, setLinkFade, type LinkRenderer, type LinkStyle } from './linkSegments'
import { computeLinkAlpha, linkFamilyAlpha, LINK_OPACITY } from './linkFamily'
import { classifyLinkScale, linkScaleAlpha } from './linkScale'
import { LINK_FOCUS_GAIN, classifyLinkFocus, countLinksByFocus } from './linkFocus'
import { TERRITORY_SIZE_PER_RADIUS, createNodePoints, shapeForType, sizeForType, type NodePoints, type NodeStyle } from './nodePoints'
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
  graphDrawnAtom,
  drilledCommunityAtom,
} from '@/atoms/intelligence'
import { buildGroupedGraph, resolutionForLevel, groupHullNodes } from './graphAggregation'
import { buildClusterTree, cutForView, cutTransition, type ClusterCut, type ClusterTree } from './clusterTree'
import { CLUSTER_NODE_PREFIX, closedGroupHullNodes, carriedPrevious, graphFromCut, openIdsOf } from './cutGraph'
import type { VascularLinkRenderer } from './linkVascularRenderer'
import { formatExactCount } from './linkMagnitude'
import { nearestNeighbourScale } from './linkRadius'
import { vascularGroupFrames } from './linkVascularRenderer'
import type { MessageKey } from '@/i18n'
import { zoomAdaptivePixelRatioCeiling } from './pixelRatioZoom'
import { createSuperNodeLabels, type SuperNodeLabels } from './superNodeLabels'
import { currentDeviceBudget } from './deviceTier'
import { FrameAnimator } from './frameAnimator'
import { useLivePulse } from './useLivePulse'
import { useCommunityActivity } from './useCommunityActivity'
import { buildCommunityIndex } from './communityActivity'
import { useAgentMarkers } from './useAgentMarkers'
import type { AgentMarkers } from './agentMarkers'
import type { NodeStyleOverlay } from './useAgentMarkers'
import { communityFocus, nodeSetSignature } from './useGraph3DLayout'
import { labelStructureKey, linkStructureKey, nodeStructureKey } from './graphStructureKey'
import { activationStateAtom } from '../SpreadingActivation'
import { graphFloat } from '../graphSurface'
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
 * Dynamic scale (HLOD, decision b7e6a1ad): above this many nodes the scene is no
 * longer ONE global level — the cluster tree is cut per element by its size on
 * screen, so what is close is in detail and what is far stays grouped, in the
 * same frame. Below it everything fits: the raw graph is drawn as is.
 */
// On a phone the children of a group must be a FINGER apart, not a pointer
// apart: a group opens later (18 px between children instead of 12).
// The cut is foveated (it knows where the camera looks): the budget goes to
// what is in view, so a desktop can afford a wider detail zone around it.
/**
 * ONE scale system: above this many nodes the scale is dynamic; below it the
 * whole graph is drawn as is. It used to switch on the budget (5 000 nodes or
 * 9 000 links) while the OLD global staircase still auto-aggregated from 4 000
 * — two systems, two looks, swapping on a flush around the thresholds (audit).
 * Nodes only: a small graph with many relations stays whole.
 */
const DYNAMIC_MIN_NODES = isMobileLikeDevice() ? 1000 : 2000

const HLOD_BUDGET = isMobileLikeDevice()
  ? { maxNodes: 1500, maxLinks: 3000, childSpacingPx: 24 }
  : { maxNodes: 5000, maxLinks: 9000, childSpacingPx: 18 }

/** Smallest closed group wrapped by an envelope at the dynamic scale (a solid hull needs 4 points). */
const CUT_HULL_MIN_MEMBERS = 4
/** Intensity of a closed group's territory sprite (MAX blending: no sum to white; a group reads softer than a real node). */
const TERRITORY_ALPHA = 0.7

/** Screen tolerance around a link's axis for hover, px: a one-relation conduit is barely wider. */
const LINK_PICK_TOLERANCE_PX = 6

/**
 * Cross-fade of the link layer when the dynamic scale changes what is drawn,
 * ms: the old layer fades out while the new one fades in, so a trunk is seen
 * dissolving into its branches (and back) instead of links popping.
 */
const LINK_CROSSFADE_MS = 380

/** The fade a link layer is at right now (1 when it has none). */
function currentLinkFade(object: THREE.Object3D): number {
  let f = 1
  object.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined
    const u = m?.uniforms?.uFade
    if (u) f = u.value as number
  })
  return f
}

/** The user asked the system for less motion: no cross-fade, a plain swap. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !!window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
}

/** Quiet time after the last camera move before the cut follows it, ms. */
const RECUT_SETTLE_MS = 200

/** Same frontier, same graph: a cut that did not move must not rebuild the scene. */
function sameFrontier(a: ClusterCut | null, b: ClusterCut | null): boolean {
  if (!a || !b) return a === b
  if (a.frontier.length !== b.frontier.length) return false
  for (let i = 0; i < a.frontier.length; i++) if (a.frontier[i] !== b.frontier[i]) return false
  return true
}

/** Where the camera will be before the library has one: the framing the view opens on. */
function estimatedFramingView(tree: ClusterTree, heightPx: number) {
  const root = tree.nodes[tree.root]
  const distance = (Math.max(40, root.radius) / Math.sin((45 * Math.PI) / 360)) * 1.06
  return {
    position: [root.x, root.y, root.z + distance] as [number, number, number],
    fovDeg: 45,
    viewportHeightPx: Math.max(1, heightPx),
    forward: [0, 0, -1] as [number, number, number],
  }
}

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

  // ── The link renderer (vascular, ribbons or LineSegments: createLinkRenderer) ─
  const linkSegmentsRef = useRef<LinkRenderer | null>(null)

  // ── Aggregated tier: tube links + named super-nodes ───────────────────
  // At scaleLevel ≥ 1 the super-edges become tubes and the largest super-nodes
  // get a billboard name. Both are imperative groups added to / removed from the
  // scene, mirroring the Points / LineSegments lifecycle below.
  const superNodeLabelsRef = useRef<SuperNodeLabels | null>(null)
  /** Hide the names that would overlap a bigger group's (camera settled, labels rebuilt). */
  const declutterLabelsRef = useRef<() => void>(() => {})
  // A new viewport (resize, full screen, rotation of a phone) changes every label's
  // screen size and place: re-calibrate and re-declutter.
  useEffect(() => {
    declutterLabelsRef.current()
  }, [dimensions.width, dimensions.height])
  declutterLabelsRef.current = () => {
    const fg = graphRef.current
    const labels = superNodeLabelsRef.current
    const el = containerRef.current
    if (!fg || !labels || !el || typeof fg.camera !== 'function') return
    labels.declutter(fg.camera(), el.clientWidth, el.clientHeight)
    wake(WAKE_MUTATION_MS)
  }
  // Live agents' labels (useAgentMarkers fills it; declared here so the
  // engine-tick callback below can re-anchor them like the other overlays).
  const agentMarkersRef = useRef<AgentMarkers | null>(null)
  // The live agents' lit nodes, applied on top of every BULK node restyle
  // (useAgentMarkers fills it): a steady waiting_input state is drawn once, so
  // without this a selection / legend / heatmap restyle erased it.
  const agentOverlayRef = useRef<NodeStyleOverlay>((_node, style) => style)

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
    //
    // The query names ONE ratio: once the window has left it, a further move
    // (1× → 1.5×, or back) would never fire again. Re-arm on the new ratio at
    // every change.
    let mq: MediaQueryList | null = null
    const onChange = () => {
      arm()
      setMaxPixelRatio(zoomedPixelRatioCeiling())
      wake(WAKE_MUTATION_MS)
    }
    const arm = () => {
      mq?.removeEventListener('change', onChange)
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      mq.addEventListener('change', onChange)
    }
    setMaxPixelRatio(zoomedPixelRatioCeiling())
    arm()
    return () => mq?.removeEventListener('change', onChange)
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
  const { data: graphData, needsRelayout, layoutRevision } = useMemo(
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
  // ── Dynamic scale: the cluster tree and its current cut ──────────────────
  // Keyed on the STRUCTURE (ids, positions, relations), not on the arrays'
  // identity: every WebSocket flush hands over new arrays, and rebuilding the
  // tree each time cost 80–257 ms at 20 000 nodes for an unchanged graph.
  const treeNodesRef = useRef(graphData)
  treeNodesRef.current = graphData
  const treeKey = useMemo(
    () => (graphData.nodes.length > DYNAMIC_MIN_NODES ? nodeStructureKey(graphData.nodes) + '#' + linkStructureKey(graphData.links) : ''),
    [graphData],
  )
  const clusterTree = useMemo(
    () => (treeKey ? buildClusterTree(treeNodesRef.current.nodes, treeNodesRef.current.links) : null),
    [treeKey],
  )
  const dynamicScale = clusterTree != null
  // The viewport height the cut is measured against. Before the container is
  // measured there is no height: a cut at 1 px opens nothing (the scene showed
  // ONE root node until the first gesture). A typical height stands in.
  const cutHeight = dimensions.height > 0 ? dimensions.height : 800
  /** The camera as the cut sees it; null before the library has one. */
  const currentView = useCallback(() => {
    const fg = graphRef.current
    const camera = fg && typeof fg.camera === 'function' ? (fg.camera() as THREE.PerspectiveCamera | null) : null
    if (!camera) return null
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    // the screen's up (trackball controls roll the camera: not the world's +Y)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    return {
      position: [camera.position.x, camera.position.y, camera.position.z] as [number, number, number],
      fovDeg: camera.fov || 45,
      viewportHeightPx: cutHeight,
      forward: [dir.x, dir.y, dir.z] as [number, number, number],
      aspect: camera.aspect || 1,
      up: [up.x, up.y, up.z] as [number, number, number],
    }
  }, [cutHeight])
  // The cut of a NEW tree (a WebSocket flush, a new dataset) is computed right
  // away from the last view, never via an empty step: going through "no cut"
  // drew the raw graph for one render and rebuilt the scene twice per flush.
  // The groups open in the cut on screen, by stable id: a new tree of the same
  // graph keeps them open (hysteresis carried across the rebuild).
  const openIdsRef = useRef<Set<string>>(new Set())
  // The selected node is drawn as itself: its ancestors open first (keepVisible),
  // or a selection near a group's edge melted into the group after a focus.
  const selectedRef = useRef(selectedNodeId)
  selectedRef.current = selectedNodeId
  const budgetFor = useCallback((tree: ClusterTree) => {
    const id = selectedRef.current
    if (!id) return HLOD_BUDGET
    const nodes = treeNodesRef.current.nodes
    const i = nodes.findIndex((n) => n.id === id)
    const leaf = i >= 0 ? tree.leafOf[i] : -1
    return leaf >= 0 ? { ...HLOD_BUDGET, keepVisible: [leaf] } : HLOD_BUDGET
  }, [])
  // Where the last cut change came from: only a GESTURE cross-fades the links;
  // a new dataset replaces them at once.
  const cutSourceRef = useRef<'gesture' | 'data'>('data')
  const treeCut = useMemo(() => {
    if (!clusterTree) return null
    cutSourceRef.current = 'data'
    const view = currentView() ?? estimatedFramingView(clusterTree, cutHeight)
    return cutForView(clusterTree, view, budgetFor(clusterTree), carriedPrevious(clusterTree, openIdsRef.current))
  }, [clusterTree, currentView, cutHeight, budgetFor])
  // A gesture's cut, tagged with the tree it belongs to (indices are per tree).
  const [gestureCut, setGestureCut] = useState<{ tree: ClusterTree; cut: ClusterCut } | null>(null)
  const clusterCut = gestureCut && gestureCut.tree === clusterTree ? gestureCut.cut : treeCut
  const clusterCutRef = useRef<ClusterCut | null>(null)
  clusterCutRef.current = clusterCut
  useEffect(() => {
    if (clusterTree && clusterCut) openIdsRef.current = openIdsOf(clusterTree, clusterCut)
  }, [clusterTree, clusterCut])
  /** Re-cut the tree for the current camera, at the end of a gesture. */
  const recut = useCallback(() => {
    if (!clusterTree) return
    const view = currentView() ?? estimatedFramingView(clusterTree, cutHeight)
    const prev = clusterCutRef.current
    const next = cutForView(clusterTree, view, budgetFor(clusterTree), prev ?? undefined)
    if (sameFrontier(next, prev)) return
    cutSourceRef.current = 'gesture'
    setGestureCut({ tree: clusterTree, cut: next })
  }, [clusterTree, currentView, cutHeight, budgetFor])
  // A new selection must be drawn as itself, and a new viewport height (full
  // screen) changes every projected size: re-cut, the gesture cut is stale.
  useEffect(() => {
    recut()
  }, [selectedNodeId, cutHeight, recut])

  // ── What is drawn, for the page's situation line ─────────────────────────
  const setDrawn = useSetAtom(graphDrawnAtom)
  useEffect(() => {
    if (!clusterTree || !clusterCut) {
      setDrawn(null)
      return
    }
    let groups = 0
    for (const i of clusterCut.frontier) if (clusterTree.nodes[i].kind !== 'leaf') groups++
    setDrawn({ groups, nodes: clusterCut.frontier.length - groups })
  }, [clusterTree, clusterCut, setDrawn])
  useEffect(() => () => setDrawn(null), [setDrawn])

  // Entity id → the closed group drawn for it (the real-time layer — agents,
  // pulses — follows an entity into the group that holds it).
  const drawnAliases = useMemo(() => {
    const m = new Map<string, string>()
    if (!clusterTree || !clusterCut) return m
    for (const i of clusterCut.frontier) {
      const t = clusterTree.nodes[i]
      if (t.kind === 'leaf') continue
      const groupId = CLUSTER_NODE_PREFIX + t.id
      for (let k = t.memberStart; k < t.memberEnd; k++) m.set(graphData.nodes[clusterTree.order[k]].id, groupId)
    }
    return m
  }, [clusterTree, clusterCut, graphData.nodes])

  // Dynamic scale: the community envelopes wrap the CLOSED groups of the cut
  // (the ground each single point stands for). Without this the toggle drew
  // nothing at all once the global scale went: `scaleLevel` stays 0.
  const cutHullNodes = useMemo(
    () => (clusterTree && clusterCut ? closedGroupHullNodes(clusterTree, clusterCut, graphData.nodes) : null),
    [clusterTree, clusterCut, graphData.nodes],
  )
  const cutHullKey = useMemo(() => {
    if (!clusterTree || !clusterCut) return ''
    let key = ''
    for (const i of clusterCut.frontier) if (clusterTree.nodes[i].kind !== 'leaf') key += clusterTree.nodes[i].id + ','
    return key
  }, [clusterTree, clusterCut])

  const aggregated = dynamicScale
    ? clusterCut != null && clusterCut.frontier.some((i) => clusterTree!.nodes[i].kind !== 'leaf')
    : scaleLevel > 0
  const scaleRes = !dynamicScale && aggregated ? resolutionForLevel(graphData.nodes.length, scaleLevel) : 0
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
    if (dynamicScale) {
      if (!clusterTree || !clusterCut) return graphData
      return graphFromCut(clusterTree, clusterCut, graphData.nodes, graphData.links, HLOD_BUDGET.maxLinks)
    }
    if (!aggregated || scaleRes <= 0 || graphData.nodes.length === 0) return graphData
    return buildGroupedGraph(graphData, scaleRes)
  }, [aggregated, scaleRes, graphData, drilledCommunity, dynamicScale, clusterTree, clusterCut])

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
  // `layoutPendingRef` marks that the NEXT onEngineStop closes a real layout
  // (see onEngineStop: the library also calls it after every prop update).
  const layoutPendingRef = useRef(true)
  useEffect(() => {
    layoutPendingRef.current = true
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

  // A cheap, stable signature of "which communities exist and how big they are".
  // Positions are deterministic per node set, so this is all the hulls depend on.
  const hullSignature = useMemo(() => {
    // Dynamic scale: one envelope per closed group of the cut.
    if (dynamicScale) return cutHullKey ? `cut|${cutHullKey}` : ''
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
  }, [graphData.nodes, aggregated, scaleRes, dynamicScale, cutHullKey])

  // Mark for rebuild when the toggle flips or the hulls' inputs change — the
  // group sizes (hullSignature) or the positions (nodeLayoutKey), not the
  // identity of a node array every flush recreates.
  const nodeLayoutKey = useMemo(
    () => (aggregated ? nodeStructureKey(graphData.nodes) : ''),
    [aggregated, graphData.nodes],
  )
  useEffect(() => {
    hullNeedsRebuildRef.current = true
  }, [showCommunityHulls, hullSignature, nodeLayoutKey])

  // The callback reads the CURRENT nodes without depending on their identity.
  const nodesRef = useRef(graphData.nodes)
  const scaleResRef = useRef(scaleRes)
  useEffect(() => {
    scaleResRef.current = scaleRes
  }, [scaleRes])
  const cutHullNodesRef = useRef(cutHullNodes)
  useEffect(() => {
    cutHullNodesRef.current = cutHullNodes
  }, [cutHullNodes])
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
      // Dynamic scale: the closed groups of the cut (`closedGroupHullNodes`).
      // Global scale: each capped group's REAL members (the super-nodes alone
      // are 24 points); `groupHullNodes` renumbers the groups biggest-first so
      // the envelope selection is stable and size-ordered.
      const cutNodes = cutHullNodesRef.current
      const hullNodes = cutNodes ?? (aggregated && scaleRes > 0 ? groupHullNodes(current, scaleRes) : null)
      if (!hullNodes || hullNodes.length === 0) return

      // A closed group of the cut is ONE point however few members it holds: its
      // ground is worth showing from 4 members (the smallest solid hull). The
      // global tier keeps the default, sized for whole communities.
      const hullOptions = cutNodes ? { minMembers: CUT_HULL_MIN_MEMBERS } : {}
      const hullGroup = buildCommunityHulls(hullNodes, hullOptions)
      if (hullGroup.hulls.length > 0) {
        scene.add(hullGroup.group)
        communityHullsRef.current = hullGroup
        communityIndexRef.current = buildCommunityIndex(hullNodes)
      }

      // Two thin rings per community (p50 core, p90 halo), built once here with
      // the same member set and bounds as the envelopes — never in the loop.
      const ringGroup = buildCommunityRings(hullNodes, hullOptions)
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
    superNodeLabelsRef.current?.updatePositions()
    agentMarkersRef.current?.updatePositions()
  }, [setEngineRunning])

  // ── A full graph must stay readable: open aggregated past a threshold ─────
  // Above this many nodes the raw cloud is a texture, not a structure. The view
  // opens one step aggregated (≈5:1 per cell) ONCE per graph size, so the user
  // still sees everything — grouped — and can come back to detail with the
  // stepper. The ref keeps it from fighting a manual choice.
  // (Removed: the old global auto-aggregation. Above DYNAMIC_MIN_NODES the
  // dynamic scale groups what is far and opens what is near.)

  // ── Manual-interaction guard: an automatic re-frame never fights a gesture ─
  // OrbitControls fires `start` when the user begins orbiting/panning/zooming
  // and `end` when the gesture settles. While a gesture is in flight the
  // framing effect below is skipped, so a re-frame cannot yank the camera
  // out from under the user's hand.
  const userInteractingRef = useRef(false)
  /** Set by any gesture, cleared by a framing: a late re-placement must not take the user's view away. */
  const userMovedSinceFramingRef = useRef(false)

  // ── Camera listeners: the dynamic scale follows the camera ─────────────
  // At the end of a move (and at every wheel notch) the cut is re-computed once
  // the camera settles (scheduleRecut, RECUT_SETTLE_MS); the density factor and
  // the sharpness ceiling follow the distance on every change.

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.controls !== 'function') return
    const controls = fg.controls()
    if (!controls || typeof controls.addEventListener !== 'function') return
    const onEnd = () => {
      userInteractingRef.current = false
      if (dynamicScale) {
        // OrbitControls sends start+end for EVERY wheel notch: a direct re-cut
        // here rebuilt the links (~220 ms) at each notch. Wait for the camera
        // to settle, like any other move.
        scheduleRecut()
        return
      }
      // Below DYNAMIC_MIN_NODES the whole graph is drawn as is: no scale to
      // change. (The old global ladder stepped here — zooming out far on a
      // small graph switched the OLD aggregation back on: a second scale
      // system. Removed.)
    }
    const onStart = () => {
      userInteractingRef.current = true
      userMovedSinceFramingRef.current = true
    }
    // uDensK and the pixel ratio ceiling follow the camera distance.
    // - uDensK: setCameraDistance only touches the uniform when the factor moves.
    // - Ceiling: closer = sharper. The ceiling is stepped (ZOOM_RATIO_QUANTUM),
    //   so a smooth zoom crosses a few values, and `setZoomPixelRatioCeiling`
    //   is a no-op when it did not move — no canvas resize per frame. It keeps
    //   the budget's drop history: a zoom is the same screen, not a new one.
    // The cut follows the camera once it SETTLES (RECUT_SETTLE_MS without a
    // move): the framing tween and a click's flight move the camera with no
    // gesture 'end', and a cut left at the pre-move view changed at the next
    // flush and rebuilt the scene. Not DURING the move: measured at 20 000
    // nodes, a close-up cut rebuilds the vascular links in ~180 ms — a re-cut
    // every 200 ms of motion would stutter the whole flight.
    let recutTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRecut = () => {
      if (recutTimer) clearTimeout(recutTimer)
      recutTimer = setTimeout(() => {
        recutTimer = null
        if (dynamicScale) recut()
        declutterLabelsRef.current()
      }, RECUT_SETTLE_MS)
    }
    const onChange = () => {
      scheduleRecut()
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
      if (recutTimer) clearTimeout(recutTimer)
    }
    // hasDimensions: the library mounts only once the container is measured.
    // When the data is already there (3D opened from the code map) this effect
    // first runs with no ForceGraph3D, and nothing else re-runs it: no scale
    // decision, no density factor, no sharper close-up — for the whole session.
  }, [graphData.nodes, setScaleLevel, setZoomPixelRatioCeiling, zoomedPixelRatioCeiling, hasDimensions, dynamicScale, recut])

  // ── Data identity: re-frame once per dataset, not once per node count ───
  // `needsRelayout` is a boolean that stays `true` across a dataset swap, and
  // `graphData.nodes.length` does not change when two projects happen to have
  // the same number of nodes — so a framing effect keyed on those two kept the
  // camera from the previous view ("trop près / trop loin / nuage coupé"). This
  // signature flips every time the node set changes, so the effect below
  // re-frames exactly once per dataset.
  const nodeSetKey = useMemo(() => nodeSetSignature(graphData.nodes), [graphData.nodes])

  // ── The frame the link law is measured in: the WHOLE graph ──────────────
  // Unit (d0) and centre come from every node, once per layout — never from
  // the drawn set, which changes at every cut of the dynamic scale (see
  // VascularSceneFrame): the tubes then only grow and shrink with the zoom.
  const graphNodesRef = useRef(graphData.nodes)
  graphNodesRef.current = graphData.nodes
  const linkFrame = useMemo(() => {
    const nodes = graphNodesRef.current
    if (nodes.length === 0) return undefined
    let x = 0, y = 0, z = 0
    for (const n of nodes) { x += n.x; y += n.y; z += n.z }
    const c = nodes.length
    // groups: a STABLE radius and centre per community, from the whole graph —
    // the trunk cap (rMax) no longer moves when a neighbour group opens
    return { unit: nearestNeighbourScale(nodes), center: [x / c, y / c, z / c] as [number, number, number], groups: vascularGroupFrames(nodes) }
    // keyed on what changes positions, not on the array identity a flush renews
  }, [nodeSetKey, layoutRevision])
  const linkFrameRef = useRef(linkFrame)
  linkFrameRef.current = linkFrame

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
  // A RE-placement of the same nodes (detected communities answering late)
  // makes the scene compact: it re-frames — unless the user has moved the
  // camera since the last framing, whose view must not be taken away.
  const framedKeyRef = useRef('')
  const framedRevisionRef = useRef(-1)
  useEffect(() => {
    if (graphData.nodes.length === 0) return
    const replacedOnly = framedOnceRef.current && nodeSetKey === framedKeyRef.current && layoutRevision !== framedRevisionRef.current
    if (replacedOnly && userMovedSinceFramingRef.current) return
    if (!needsRelayout && framedOnceRef.current && !replacedOnly) return
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
        // The narrower of the two angles frames the sphere: in PORTRAIT (a phone)
        // the horizontal one is much smaller than the vertical fov, and a framing
        // on the vertical alone let the graph run off both sides of the screen.
        const vfov = ((camera?.fov ?? 45) * Math.PI) / 180
        const aspect = camera?.aspect && camera.aspect > 0 ? camera.aspect : 1
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
        const fov = Math.min(vfov, hfov)
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
        framedKeyRef.current = nodeSetKey
        framedRevisionRef.current = layoutRevision
        userMovedSinceFramingRef.current = false
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
  }, [nodeSetKey, layoutRevision, hasDimensions, wake])

  // ── Save positions when simulation stops ────────────────────────────────
  const onEngineStop = useCallback(() => {
    // three-forcegraph sets `engineRunning = true` in EVERY update, whatever
    // prop changed, and with cooldownTicks = 0 the next frame calls this back.
    // A hover changes `linkColor`, so each hover move landed here: an O(N)
    // savePositions and a 1.6 s wake for a layout that had not moved. Only a
    // real layout (new data, a drag) does the work; the rest just reports.
    if (!layoutPendingRef.current && !hullNeedsRebuildRef.current) {
      setEngineRunning(false)
      return
    }
    layoutPendingRef.current = false
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
    if (isSuper) {
      // A closed group of the dynamic scale is drawn at its real extent: its
      // sprite covers its territory, so a 300-file module reads bigger than a
      // 10-file one at any distance (see TERRITORY_SIZE_PER_RADIUS).
      const r = node.data.clusterRadius as number | undefined
      const bySize = 3 + 2.6 * Math.sqrt(count)
      return typeof r === 'number' && r > 0 ? Math.max(sizeForType(node.entityType) * 1.5, r * TERRITORY_SIZE_PER_RADIUS) : bySize
    }
    // What a link joins is bigger the more it is connected (asked in the
    // browser review: « ce qu'elle lie devrait être plus gros en fonction de son
    // nombre de connexions »): ×1 alone, ×2 at 8 links, ×3 from 64.
    const deg = (node.degree ?? 0) as number
    const weightGain = 1 + 2 * Math.min(1, Math.log1p(deg) / Math.log1p(64))
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
    // Super-nodes (aggregated) are sized by how many nodes they bundle (area ∝
    // count), coloured/shaped by their dominant type. Individual nodes use the
    // per-type size. With the dynamic scale a frame mixes both: the channel is
    // chosen PER NODE (a group by layer, a real node by type).
    const count = node.data.count as number | undefined
    const isSuper = typeof count === 'number' && count > 1
    const base = resolveNodeBaseRgb(dynamicScale ? isSuper : aggregated, node.layer, ENTITY_RGB[entityType] ?? DEFAULT_NODE_RGB)
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

    // A territory (closed group of the dynamic scale) is a big ADDITIVE sprite:
    // at full intensity, overlapping modules summed to a white blob in the
    // middle of the real graph (seen in the browser). It glows at
    // TERRITORY_ALPHA; its real nodes, once opened, are at full intensity.
    const isTerritory = dynamicScale && isSuper && typeof node.data.clusterRadius === 'number'
    // The nodes blend by MAX (nodePoints): overlapping glows no longer sum to
    // white, so neither a big hub nor a territory needs dimming any more — the
    // earlier 1/√gain and 0.35 (made for ADDITIVE blending) only made the
    // opening view dull (seen in the browser).
    const restAlpha = isTerritory ? TERRITORY_ALPHA : 1
    return { r: base.r, g: base.g, b: base.b, alpha: restAlpha, size, shape, act: 0 }
  }, [energyHeatmap, touchesHeatmap, activation, selectedNodeId, legendHoveredType, hoveredProjectSlug, highlightedGroup, dimmedEntityTypes, baseNodeSize, aggregated, dynamicScale])

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
    // `nodes`: the set `communityId` numbers. An envelope of the dynamic scale
    // numbers its closed groups by rank (`closedGroupHullNodes`), not by the
    // Louvain id the layout nodes carry.
    (communityId: number | undefined, nodes: readonly Graph3DNode[] = graphData.nodes) => {
      const fg = graphRef.current
      if (!fg || typeof fg.cameraPosition !== 'function') return
      const focus = communityFocus(nodes as Graph3DNode[], communityId)
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
      focusCommunityOfRef.current(node.id)
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

  // ── What the scene objects are BUILT from (graphStructureKey.ts) ──────
  // Every WebSocket flush hands over a new `activeGraphData` — new arrays, new
  // node objects — even when nothing structural moved. The creation effects
  // below key on these strings, not on that identity, so a flush no longer
  // rebuilds the links, the Points, the tubes and the labels (a canvas texture
  // each); what changed is applied in place (Points.setData + restyle).
  const activeNodeKey = useMemo(() => nodeStructureKey(activeGraphData.nodes), [activeGraphData.nodes])
  const activeLinkKey = useMemo(() => linkStructureKey(activeGraphData.links), [activeGraphData.links])
  const activeLabelKey = useMemo(
    () => (aggregated ? labelStructureKey(activeGraphData.nodes) : ''),
    [aggregated, activeGraphData.nodes],
  )
  /** The data the creation effects build from, read when their KEY changes. */
  const activeGraphDataRef = useRef(activeGraphData)
  useEffect(() => {
    activeGraphDataRef.current = activeGraphData
  }, [activeGraphData])

  // A renderer kept across a flush reads positions from the node objects it was
  // BUILT with, while the library moves the objects of the LATEST graphData (a
  // drag). Each kept renderer registers its node array here; a drag copies the
  // moved node's position into every registered array (same key ⇒ same order,
  // so the slot is the node's index in the current data).
  const boundNodeArraysRef = useRef(new Map<string, Graph3DNode[]>())
  const activeIndexById = useMemo(() => {
    const m = new Map<string, number>()
    activeGraphData.nodes.forEach((n, i) => m.set(n.id, i))
    return m
  }, [activeGraphData.nodes])
  const syncBoundPosition = useCallback((node: Graph3DNode) => {
    const i = activeIndexById.get(node.id)
    if (i === undefined) return
    for (const arr of boundNodeArraysRef.current.values()) {
      const held = arr[i]
      if (!held || held === node || held.id !== node.id) continue
      held.x = node.x
      held.y = node.y
      held.z = node.z
      held.fx = node.fx
      held.fy = node.fy
      held.fz = node.fz
    }
  }, [activeIndexById])

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

  // The cut the Points were last built from, and the tree it belongs to.
  const morphFromRef = useRef<{ tree: ClusterTree; cut: ClusterCut } | null>(null)
  const clusterTreeRef = useRef<ClusterTree | null>(null)
  clusterTreeRef.current = clusterTree
  /** Children fly from their parent's centre to their place over the cross-fade. */
  const morphNodes = useCallback((np: NodePoints, starts: ReadonlyMap<string, readonly [number, number, number]>) => {
    np.setMorph(starts, 0)
    const t0 = performance.now()
    const step = () => {
      if (nodePointsRef.current !== np) return
      const t = Math.min(1, (performance.now() - t0) / LINK_CROSSFADE_MS)
      np.setMorph(starts, t * t * (3 - 2 * t))
      wake(WAKE_MUTATION_MS)
      if (t < 1) requestAnimationFrame(step)
      else np.updatePositions()
    }
    requestAnimationFrame(step)
    // a hidden tab freezes rAF: the nodes still end at their place
    setTimeout(() => { if (nodePointsRef.current === np) np.updatePositions() }, LINK_CROSSFADE_MS + 200)
  }, [wake])

  // A change of the DYNAMIC cut cross-fades the link layer; anything else (a
  // new dataset, a mode switch, unmount) replaces it at once.
  const crossfadeLinksRef = useRef(false)
  crossfadeLinksRef.current = dynamicScale && cutSourceRef.current === 'gesture' && !prefersReducedMotion()
  // One animation per layer: a new fade on a layer CANCELS the one running on
  // it (two quick cuts fade a layer in, then out — without this the two fought
  // and a layer could be left on screen at 0 opacity, never released).
  const fadeTokensRef = useRef(new WeakMap<THREE.Object3D, number>())
  const fadeLinkLayer = useCallback((object: THREE.Object3D, from: number, to: number, done?: () => void) => {
    const token = (fadeTokensRef.current.get(object) ?? 0) + 1
    fadeTokensRef.current.set(object, token)
    const current = () => fadeTokensRef.current.get(object) === token
    setLinkFade(object, from)
    const t0 = performance.now()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      // superseded: the newer animation owns the layer — but a release is never skipped
      if (!current()) { done?.(); return }
      setLinkFade(object, to)
      done?.()
      wake(WAKE_MUTATION_MS)
    }
    const step = () => {
      if (finished) return
      if (!current()) { finish(); return }
      const t = Math.min(1, (performance.now() - t0) / LINK_CROSSFADE_MS)
      const eased = t * t * (3 - 2 * t)
      setLinkFade(object, from + (to - from) * eased)
      wake(WAKE_MUTATION_MS)
      if (t < 1) requestAnimationFrame(step)
      else finish()
    }
    requestAnimationFrame(step)
    // A hidden tab freezes rAF: the old layer is still released.
    setTimeout(finish, LINK_CROSSFADE_MS + 200)
  }, [wake])

  // ── Link layer — one renderer for all links (see createLinkRenderer) ──
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

    const data = activeGraphDataRef.current
    if (!useOptimizedLinks || data.links.length === 0) return

    // The camera distance reaches the link system: its LOD was frozen at the
    // default distance (the budget always passed {}).
    const camera = typeof fg.camera === 'function' ? fg.camera() : null
    const frame = linkFrameRef.current
    const cameraDistance = camera && frame ? camera.position.distanceTo(new THREE.Vector3(...frame.center)) : undefined
    const seg = createLinkRenderer(data.nodes, data.links, frame, cameraDistance !== undefined ? { cameraDistance } : {})
    seg.updateColors(computeLinkStyleRef.current)
    scene.add(seg.object)
    linkSegmentsRef.current = seg
    // The dynamic scale replaced a layer that is still fading out: come in.
    const crossfade = crossfadeLinksRef.current
    if (crossfade) fadeLinkLayer(seg.object, 0, 1)
    const bound = boundNodeArraysRef.current
    bound.set('links', data.nodes)
    // wake: edges were added to the scene.
    wake(WAKE_MUTATION_MS)

    return () => {
      if (bound.get('links') === data.nodes) bound.delete('links')
      if (linkSegmentsRef.current === seg) {
        linkSegmentsRef.current = null
        if (crossfadeLinksRef.current) {
          // Leave it on screen and fade it out under the new layer.
          fadeLinkLayer(seg.object, currentLinkFade(seg.object), 0, () => {
            scene.remove(seg.object)
            seg.dispose()
          })
        } else {
          scene.remove(seg.object)
          seg.dispose()
        }
      }
    }
    // Keyed on the STRUCTURE, not on activeGraphData's identity (see above).
    // hasDimensions: the library mounts after the data when the 3D view opens
    // on a loaded graph; without it the links waited for the next flush.
  }, [useOptimizedLinks, activeNodeKey, activeLinkKey, wake, hasDimensions, fadeLinkLayer])


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
  /** The node array the Points currently indexes (in-place refresh below). */
  const pointsNodesRef = useRef<Graph3DNode[] | null>(null)
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

    const nodesNow = activeGraphDataRef.current.nodes
    if (!useOptimizedNodes || nodesNow.length === 0) return

    const np = createNodePoints(nodesNow)
    pointsNodesRef.current = nodesNow
    np.updateStyles((n) => agentOverlayRef.current(n, computeNodeStyleRef.current(n)))
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
    // A group opened by a gesture: its children FLY OUT of its centre, in step
    // with the links' cross-fade, instead of popping into place.
    const tree = clusterTreeRef.current
    const cutNow = clusterCutRef.current
    const before = morphFromRef.current
    if (crossfadeLinksRef.current && tree && cutNow && before && before.tree === tree) {
      const starts = new Map<string, [number, number, number]>()
      for (const sp of cutTransition(tree, before.cut, cutNow).splits) {
        const p = tree.nodes[sp.parent]
        for (const c of sp.children) {
          const t = tree.nodes[c]
          // a leaf's tree id is `n:<node id>`; a group is drawn as `cl:<tree id>`
          const id = t.kind === 'leaf' ? t.id.slice(2) : CLUSTER_NODE_PREFIX + t.id
          if (id) starts.set(id, [p.x, p.y, p.z])
        }
      }
      if (starts.size > 0) morphNodes(np, starts)
    }
    morphFromRef.current = tree && cutNow ? { tree, cut: cutNow } : null

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
  }, [useOptimizedNodes, activeNodeKey, wake, hasDimensions])

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

    const labelNodes = activeGraphDataRef.current.nodes
    if (!aggregated || labelNodes.length === 0) return
    // One canvas texture per label: skipped on a device whose tier says the graph is too big for them.
    if (graphData.nodes.length > DEVICE_BUDGET.maxNodesForLabels) return

    const labels = createSuperNodeLabels(labelNodes, DEVICE_BUDGET.labelLimit)
    if (labels.count === 0) return
    scene.add(labels.group)
    superNodeLabelsRef.current = labels
    labels.declutter(fg.camera(), containerRef.current?.clientWidth ?? 0, containerRef.current?.clientHeight ?? 0)
    const bound = boundNodeArraysRef.current
    bound.set('labels', labelNodes)
    wake(WAKE_MUTATION_MS)

    return () => {
      if (bound.get('labels') === labelNodes) bound.delete('labels')
      if (superNodeLabelsRef.current === labels) {
        scene.remove(labels.group)
        labels.dispose()
        superNodeLabelsRef.current = null
      }
    }
  }, [aggregated, activeLabelKey, wake, hasDimensions, graphData.nodes.length])

  // Recolor points when any highlight/activation/heatmap state changes.
  // Same structure, new objects (a flush): point the Points at the new array
  // first — O(N), no GPU reallocation — so styles read the fresh node data.
  useEffect(() => {
    if (!useOptimizedNodes) return
    const np = nodePointsRef.current
    if (!np) return
    if (pointsNodesRef.current !== activeGraphData.nodes) {
      np.setData(activeGraphData.nodes)
      pointsNodesRef.current = activeGraphData.nodes
    }
    np.updateStyles((n) => agentOverlayRef.current(n, computeNodeStyle(n)))
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
    // Restore the previously boosted node to its bulk style (agents included).
    if (prev != null) {
      const idx = np.indexOf(prev)
      const node = activeGraphData.nodes.find((n) => n.id === prev)
      if (idx >= 0 && node) np.updateStyleAt(idx, agentOverlayRef.current(node, computeNodeStyleRef.current(node)))
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

  // A pulse returns to the live base PLUS the agents' overlay, so a pulse ending
  // on a node an agent lights gives the agent's colour back, not the bulk.
  const pulseBaseNodeStyle = useCallback(
    (node: Graph3DNode): NodeStyle => agentOverlayRef.current(node, liveBaseNodeStyle(node)),
    [liveBaseNodeStyle],
  )

  // Entity pulses: ids published by useGraphWebSocket (graph + CRUD channels).
  useLivePulse({
    nodePointsRef,
    linkSegmentsRef,
    nodes: activeGraphData.nodes,
    baseNodeStyle: pulseBaseNodeStyle,
    baseLinkStyle: liveBaseLinkStyle,
    animator,
    enabled: hasDimensions,
    aliases: drawnAliases,
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
  // node. Off at the OLD global aggregated tiers (a grid cell is an invented
  // spot). With the dynamic scale every group is a real container: an agent
  // whose node is inside a closed group shows on that group (drawnAliases).
  // It was off whenever any group was drawn — that is, almost always: the
  // real-time layer had disappeared.
  useAgentMarkers({
    graphRef,
    nodePointsRef,
    markersRef: agentMarkersRef,
    nodes: activeGraphData.nodes,
    baseNodeStyle: liveBaseNodeStyle,
    animator,
    enabled: hasDimensions && (!aggregated || dynamicScale),
    overlayRef: agentOverlayRef,
    aliases: drawnAliases,
  })

  // ── Overview tier — custom pick for hover / click ─────────────────────
  // With nodeVisibility=false the library has no node objects to raycast, so
  // hover/click/double-click are driven from our own NDC projection (pick).
  const pointsClickRef = useRef<{ nodeId: string; time: number } | null>(null)
  // The link under the pointer: its exact relation count, near the pointer.
  const [hoveredLink, setHoveredLink] = useState<{ text: string; x: number; y: number } | null>(null)
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
      // Nothing solid under the pointer: a link may be. Thin conduits (one
      // relation) are a few pixels wide, so the pick is a SCREEN distance to
      // their axis with a tolerance, not a ray on triangles. Hovering lights the
      // conduit's path up to its trunk and says how many relations it carries.
      const link = hit || hull ? null : pickLink(ev)
      el.style.cursor = hit || hull || link ? 'pointer' : 'default'
    }

    let litConduit: number | null = null
    const lightConduit = (next: number | null) => {
      if (next === litConduit) return
      litConduit = next
      ;(linkSegmentsRef.current as VascularLinkRenderer | null)?.highlightConduit?.(next)
      wake(WAKE_MUTATION_MS)
    }
    const pickLink = (ev: PointerEvent) => {
      const seg = linkSegmentsRef.current as VascularLinkRenderer | null
      const camera = fg.camera?.()
      if (!seg?.pickAt || !camera) {
        lightConduit(null)
        setHoveredLink(null)
        return null
      }
      const rect = el.getBoundingClientRect()
      // the width too: x was measured with H/2 (2.8 px of tolerance in portrait)
      const pick = seg.pickAt(ndcVec.x, ndcVec.y, camera, rect.height, LINK_PICK_TOLERANCE_PX, rect.width)
      lightConduit(pick?.id ?? null)
      if (!pick) {
        setHoveredLink(null)
        return null
      }
      const n = pick.n
      setHoveredLink({
        text: t(`featureGraphs.counts.relation.${n === 1n ? 'one' : 'other'}` as MessageKey, { n: formatExactCount(n) }),
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
      })
      return pick
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
      const sup = hit?.data as { count?: number; clusterRadius?: number } | undefined
      // Dynamic scale: a group is OPENED by going to it — the cut then shows its
      // real nodes in place, in context, instead of a filtered view.
      if (hit && dynamicScale && hit.id.startsWith('cl:')) {
        const r = Math.max(40, sup?.clusterRadius ?? 40)
        const camera = fg.camera?.()
        const from = camera ? camera.position : new THREE.Vector3(hit.x, hit.y, hit.z + 1)
        const dir = new THREE.Vector3(from.x - hit.x, from.y - hit.y, from.z - hit.z)
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
        dir.normalize().multiplyScalar(r * 2.2)
        fg.cameraPosition?.({ x: hit.x + dir.x, y: hit.y + dir.y, z: hit.z + dir.z }, { x: hit.x, y: hit.y, z: hit.z }, 900)
        wake(1400)
        return
      }
      if (hit && typeof sup?.count === 'number' && sup.count > 1 && hit.communityId != null) {
        setDrilledCommunity(hit.communityId)
        return
      }
      if (!hit) {
        // No node: a hull face is still a target — frame the whole community.
        const hull = raycastHull()
        if (hull) { focusCommunityRef.current(hull.communityId, cutHullNodesRef.current ?? undefined); return }
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
      lightConduit(null)
      setHoveredLink(null)
      // The hover state lives in this closure: a re-subscription (a selection
      // change re-runs this effect) starts from `null` and would never lower
      // a hull raised by the previous one. Give it back before leaving.
      setHullHover(null)
    }
    // hasDimensions: the library mounts after the data when the graph is opened
    // from the code map. Without it this effect returns early (no ForceGraph3D
    // yet) and never attaches the pick, so a click on a node selects nothing.
  }, [useOptimizedNodes, selectedNodeId, setHoveredNodeId, setSelectedNodeId, onNodeDoubleClick, hasDimensions, dynamicScale, t, wake])

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
        onNodeDrag={(node: Graph3DNode) => {
          // Dragged node moves without a force tick — keep edges attached.
          syncBoundPosition(node)
          linkSegmentsRef.current?.updatePositions()
          superNodeLabelsRef.current?.updatePositions()
          agentMarkersRef.current?.updatePositions()
          wake(WAKE_MUTATION_MS)
        }}
        onNodeDragEnd={(node: Graph3DNode) => {
          // Pin position after drag
          node.fx = node.x
          node.fy = node.y
          node.fz = node.z
          syncBoundPosition(node)
          savePositions([node])
          // wake: the library calls resetCountdown() on drag end, so the
          // engine restarts and nodes keep moving after the pointer is up.
          layoutPendingRef.current = true
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

      {hoveredLink && (
        <div
          data-testid="link-hover-count"
          className="pointer-events-none absolute z-10 rounded-md bg-surface-popover px-2 py-1 text-[11px] tabular-nums text-[var(--text-primary)] shadow"
          style={{ left: hoveredLink.x + 12, top: hoveredLink.y + 12 }}
        >
          {hoveredLink.text}
        </div>
      )}

      {/* ── Scale: what is drawn, read on the same line as « Couches » ─────
          Not a button any more: the camera chooses the scale (dynamic scale),
          so there is nothing to press — only what the view shows right now.
          Same height and surface as the layer panel header, just to its right. */}
      {graphData.nodes.length > 0 && (() => {
        const groups = activeGraphData.nodes.filter((n) => n.id.startsWith('cl:')).length
        const real = activeGraphData.nodes.length - groups
        return (
          <div
            data-testid="graph-scale-indicator"
            role="status"
            aria-live="polite"
            className={`${graphFloat} shadow-[var(--shadow-md)] pointer-events-none absolute top-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] tabular-nums whitespace-nowrap overflow-hidden text-ellipsis`}
            style={{
              left: 'calc(0.75rem + min(15.5rem, 100% - 1.5rem) + 0.5rem)',
              maxWidth: 'calc(100% - min(15.5rem, 100% - 1.5rem) - 2rem)',
            }}
          >
            <ZoomIn size={12} className="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span className="truncate">
              {/* the groups first: on a phone the line is cut, and « 0 nodes »
                  was all that showed at the opening */}
              {[groups > 0 ? t('intelGraph.scale.groups', { count: groups }) : null, real > 0 || groups === 0 ? t('intelGraph.scale.nodes', { count: real }) : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )
      })()}
    </div>
  )
}
