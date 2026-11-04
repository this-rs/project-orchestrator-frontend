// ============================================================================
// linkSegments — all graph links drawn as ONE THREE.LineSegments (1 draw call)
// ============================================================================
//
// The default react-force-graph-3d link renderer creates one CylinderGeometry
// mesh (MeshLambertMaterial, ~48 triangles, lit) PER link. On a 10k-node graph
// that is thousands of draw calls and hundreds of thousands of triangles, all
// for lines the user reads as "thin glowing edges". po-graph draws every edge
// in a single LineSegments with per-vertex color + alpha, updated from a typed
// array — zero per-link objects, zero lights, one draw call.
//
// This module is the port of that technique. It owns a preallocated
// BufferGeometry whose `position` / `aColor` / `aAlpha` arrays are rewritten in
// place (no reallocation, no per-link Object3D) from the live d3-force node
// positions. It is unlit: nothing in the link path depends on scene lights.
// ============================================================================

import * as THREE from 'three'
import { markFullUpload, markRangeUpload } from './bufferUpload'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import { LINK_RENDER_ORDER } from './nodePoints'
import { ARROW_ANCHOR, ARROW_VERTICES, arrowsEnabled, computeArrowHeadAt } from './linkArrows'
import { isDirectionalRelation } from './linkFamily'
import {
  CURVE_SUBDIVISIONS, curveEnabled, linkVolume, pathPointAndTangent,
  sampleLinkPath as samplePath, type Vec3,
} from './linkCurve'
import { classifyLinkScale, interpolateRgb, linkScaleCurvature } from './linkScale'
import type { LinkStyle, LinkStyleFn } from './linkRibbon'
import { createLinkRibbons, type LinkRenderer } from './linkRibbons'
import { createVascularLinks, type VascularSceneFrame } from './linkVascularRenderer'

/**
 * Line segments drawn per link's stroke: CURVE_SUBDIVISIONS − 1 bowed
 * segments when the graph is under the curvature budget, 1 plain straight
 * segment otherwise. LineSegments needs 2 (disjoint) vertices per segment.
 */
function segmentsPerLink(linkCount: number): number {
  return curveEnabled(linkCount) ? CURVE_SUBDIVISIONS - 1 : 1
}

/**
 * Final per-link style (gradient source→target + alpha) — defined in
 * linkRibbon.ts (pure module) and re-exported here so existing importers
 * (livePulse, useLivePulse, IntelligenceGraph3D) keep working unchanged.
 */
export type { LinkStyle, LinkStyleFn } from './linkRibbon'
export type { LinkRenderer } from './linkRibbons'

/** Parse a `#hex` or `rgba(r,g,b,a)` color into normalized components. */
export function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  const c = color.trim()
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    const full = hex.length === 3
      ? hex.split('').map((h) => h + h).join('')
      : hex
    const n = parseInt(full, 16)
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }
  }
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(c)
  if (m) {
    return {
      r: Number(m[1]) / 255,
      g: Number(m[2]) / 255,
      b: Number(m[3]) / 255,
      a: m[4] === undefined ? 1 : Number(m[4]),
    }
  }
  // Unknown — fall back to a neutral gray.
  return { r: 0.42, g: 0.45, b: 0.5, a: 0.35 }
}

/** Resolve a link endpoint (string id or node object after d3-force resolves it). */
function endpointId(ref: unknown): string {
  if (typeof ref === 'string') return ref
  if (ref && typeof ref === 'object' && typeof (ref as Graph3DNode).id === 'string') {
    return (ref as Graph3DNode).id
  }
  return ''
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uFade;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha * uFade);
  }
`

export interface LinkSegments {
  /** The LineSegments object. Add it to the scene once. */
  readonly object: THREE.LineSegments
  /** Rebuild buffers from a new graph (called on data change / toggle). */
  setData: (nodes: Graph3DNode[], links: Graph3DLink[]) => void
  /** Rewrite `position` from the live node x/y/z (called every engine tick). */
  updatePositions: () => void
  /** Rewrite `aColor` / `aAlpha` from the style function (called on highlight change). */
  updateColors: (styleFn: LinkStyleFn) => void
  /**
   * Rewrite only the links touching the given node ids (hover spotlight).
   * Uses the adjacency built by setData, so a hover move touches O(degree)
   * edges instead of the whole crate.
   */
  updateColorsForNodes: (nodeIds: readonly string[], styleFn: LinkStyleFn) => void
  dispose: () => void
}

export function createLinkSegments(nodes: Graph3DNode[], links: Graph3DLink[]): LinkSegments {
  // Vertex layout: [0, strokeVerts*N) the N link strokes (segmentsPerLink(N)
  // segments × 2 vertices each, link i at offset i*strokeVerts); then,
  // appended, ARROW_VERTICES per directional link (see linkArrows).
  // arrowSlot[i] is the first vertex of link i's head, or -1 (bare stroke).
  // strokeVerts is the same for every link in a given graph (it depends only
  // on the link count, via segmentsPerLink / curveEnabled) — curved links
  // all get CURVE_SUBDIVISIONS points, straight ones all get 2.
  let strokeVerts = segmentsPerLink(links.length) * 2
  let vertexCount = links.length * strokeVerts
  let arrowSlot = new Int32Array(0)
  let amplitudes = new Float32Array(0)
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const alphas = new Float32Array(vertexCount)

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: { uFade: { value: 1 } },
    transparent: true,
    depthWrite: false,
  })

  const object = new THREE.LineSegments(geometry, material)
  object.frustumCulled = false
  // Edges BEFORE the nodes (see NODE_POINTS_RENDER_ORDER): they were at 10 vs 1
  // for the nodes, i.e. drawn last and on top of them.
  object.renderOrder = LINK_RENDER_ORDER

  // id → node (live, mutable positions) and the current link list. Both are
  // replaced wholesale on setData; the arrays themselves are never reassigned
  // outside the constructor (update* read them via geometry.getAttribute).
  let nodeById = new Map<string, Graph3DNode>()
  let linkList = links
  /** id → indices into `linkList` of every edge touching that node. */
  let linkIndexByNode = new Map<string, number[]>()

  const rebuildIndex = (nodeList: Graph3DNode[]) => {
    const m = new Map<string, Graph3DNode>()
    for (const n of nodeList) m.set(n.id, n)
    nodeById = m
  }

  const rebuildAdjacency = (linksToIndex: Graph3DLink[]) => {
    const m = new Map<string, number[]>()
    for (let i = 0; i < linksToIndex.length; i++) {
      for (const id of [endpointId(linksToIndex[i].source), endpointId(linksToIndex[i].target)]) {
        if (!id) continue
        let arr = m.get(id)
        if (!arr) { arr = []; m.set(id, arr) }
        arr.push(i)
      }
    }
    linkIndexByNode = m
  }

  const setData = (nextNodes: Graph3DNode[], nextLinks: Graph3DLink[]) => {
    linkList = nextLinks
    strokeVerts = segmentsPerLink(nextLinks.length) * 2
    // Reallocate only when the count changes (graph shape changed).
    const slots = new Int32Array(nextLinks.length).fill(-1)
    let next = nextLinks.length * strokeVerts
    if (arrowsEnabled(nextLinks.length)) {
      for (let i = 0; i < nextLinks.length; i++) {
        if (isDirectionalRelation(nextLinks[i].relationType)) { slots[i] = next; next += ARROW_VERTICES }
      }
    }
    arrowSlot = slots
    if (next !== vertexCount) {
      vertexCount = next
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(next * 3), 3))
      geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(next * 3), 3))
      geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(next), 1))
    }
    rebuildIndex(nextNodes)
    rebuildAdjacency(nextLinks)
    // Precompute each link's curvature amplitude once (per data change, not per
    // frame): the scale (intra/neighbor/inter) decides how much a link bows,
    // the volume (width) how strong it is. updatePositions then reads
    // amplitudes[i] instead of re-classifying every link every frame.
    amplitudes = new Float32Array(nextLinks.length)
    for (let i = 0; i < nextLinks.length; i++) {
      const link = nextLinks[i]
      const sNode = nodeById.get(endpointId(link.source))
      const tNode = nodeById.get(endpointId(link.target))
      const scale = classifyLinkScale(
        { layer: sNode?.layer ?? link.layer, communityId: sNode?.communityId ?? link.sourceCommunityId },
        { layer: tNode?.layer ?? link.layer, communityId: tNode?.communityId ?? link.targetCommunityId },
      )
      amplitudes[i] = linkScaleCurvature(scale, linkVolume(link))
    }
    // Fill positions from scratch (and, on a fresh object, the arrays start zeroed).
    updatePositions()
  }

  const updatePositions = () => {
    const pos = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    const curved = curveEnabled(linkList.length)
    const segs = strokeVerts / 2 // number of straight sub-segments drawn for the stroke
    for (let i = 0; i < linkList.length; i++) {
      const link = linkList[i]
      const sNode = nodeById.get(endpointId(link.source))
      const tNode = nodeById.get(endpointId(link.target))
      const s: Vec3 = [sNode?.x ?? 0, sNode?.y ?? 0, sNode?.z ?? 0]
      const t: Vec3 = [tNode?.x ?? 0, tNode?.y ?? 0, tNode?.z ?? 0]
      const volume = linkVolume(link)
      const amplitude = amplitudes[i]
      const base = i * strokeVerts // first vertex of this link's stroke
      // Sample `segs + 1` points along the path (bowed or straight — see
      // sampleLinkPath), then write each consecutive pair as one disjoint
      // LineSegments segment: [p0,p1], [p1,p2], …
      const sampled = samplePath(s, t, volume, endpointId(link.source), endpointId(link.target), segs + 1, curved, amplitude)
      for (let j = 0; j < segs; j++) {
        const p0 = sampled[j], p1 = sampled[j + 1]
        const o = (base + j * 2) * 3
        pos[o] = p0[0]; pos[o + 1] = p0[1]; pos[o + 2] = p0[2]
        pos[o + 3] = p1[0]; pos[o + 4] = p1[1]; pos[o + 5] = p1[2]
      }
      const slot = arrowSlot[i]
      if (slot >= 0) {
        const straightLen = Math.hypot(t[0] - s[0], t[1] - s[1], t[2] - s[2])
        const { point, tangent } = pathPointAndTangent(
          s, t, volume, endpointId(link.source), endpointId(link.target), ARROW_ANCHOR, curved, amplitude,
        )
        const h = computeArrowHeadAt(point, tangent, straightLen, link.relationType, linkList.length)
        // Degenerate link: collapse the head onto the source (zero-length, invisible).
        if (h) pos.set(h, slot * 3)
        else pos.fill(s[0], slot * 3, slot * 3 + ARROW_VERTICES * 3)
      }
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  /**
   * Give link i's head (if any) the stroke's colour at its anchor (75 % along
   * the link) — the same gradient the stroke carries, so a head never looks
   * detached from its line.
   */
  const paintArrow = (i: number, s: LinkStyle, col: Float32Array, alp: Float32Array) => {
    const slot = arrowSlot[i]
    if (slot < 0) return
    const c = interpolateRgb(
      { r: s.r, g: s.g, b: s.b },
      { r: s.r2 ?? s.r, g: s.g2 ?? s.g, b: s.b2 ?? s.b },
      ARROW_ANCHOR,
    )
    for (let v = 0; v < ARROW_VERTICES; v++) {
      const o = (slot + v) * 3
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b
      alp[slot + v] = s.a
    }
  }

  /**
   * Paint every vertex of link i's stroke, interpolating the colour from the
   * source endpoint (r,g,b) to the target endpoint (r2,g2,b2) along the curve
   * parameter. The buffer is per-vertex for alpha; the colour is now per-vertex
   * too, so a link reads "who talks to whom" without an arrow head.
   */
  const paintStroke = (i: number, s: LinkStyle, col: Float32Array, alp: Float32Array) => {
    const base = i * strokeVerts
    const segs = strokeVerts / 2 // number of straight sub-segments of the stroke
    const r1 = s.r, g1 = s.g, b1 = s.b
    const r2 = s.r2 ?? s.r, g2 = s.g2 ?? s.g, b2 = s.b2 ?? s.b
    for (let v = 0; v < strokeVerts; v++) {
      // Vertex v belongs to the sample point at curve parameter t (see
      // updatePositions: vertices are the disjoint pairs [p0,p1],[p1,p2],…).
      const t = Math.floor((v + 1) / 2) / segs
      const u = 1 - t
      const c = (base + v) * 3
      col[c] = r1 * u + r2 * t
      col[c + 1] = g1 * u + g2 * t
      col[c + 2] = b1 * u + b2 * t
      alp[base + v] = s.a
    }
  }

  const updateColors = (styleFn: LinkStyleFn) => {
    const col = (geometry.getAttribute('aColor') as THREE.BufferAttribute).array as Float32Array
    const alp = (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < linkList.length; i++) {
      const s = styleFn(linkList[i])
      paintStroke(i, s, col, alp)
      paintArrow(i, s, col, alp)
    }
    // A full upload: it must beat any ranged update queued in the same frame.
    markFullUpload(geometry.getAttribute('aColor') as THREE.BufferAttribute)
    markFullUpload(geometry.getAttribute('aAlpha') as THREE.BufferAttribute)
  }

  /** Rewrite only the given link indices (their whole stroke), with ranged uploads. */
  const updateColorsAt = (indices: number[], styleFn: LinkStyleFn) => {
    if (indices.length === 0) return
    const col = (geometry.getAttribute('aColor') as THREE.BufferAttribute).array as Float32Array
    const alp = (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).array as Float32Array
    const colAttr = geometry.getAttribute('aColor') as THREE.BufferAttribute
    const alpAttr = geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    for (const i of indices) {
      if (i < 0 || i >= linkList.length) continue
      const s = styleFn(linkList[i])
      paintStroke(i, s, col, alp)
      const base = i * strokeVerts
      markRangeUpload(colAttr, base * 3, strokeVerts * 3)
      markRangeUpload(alpAttr, base, strokeVerts)
      paintArrow(i, s, col, alp)
      const slot = arrowSlot[i]
      if (slot >= 0) {
        markRangeUpload(colAttr, slot * 3, ARROW_VERTICES * 3)
        markRangeUpload(alpAttr, slot, ARROW_VERTICES)
      }
    }
  }

  const updateColorsForNodes = (nodeIds: readonly string[], styleFn: LinkStyleFn) => {
    const idxSet = new Set<number>()
    for (const id of nodeIds) {
      const arr = linkIndexByNode.get(id)
      if (arr) for (const i of arr) idxSet.add(i)
    }
    if (idxSet.size === 0) return
    updateColorsAt([...idxSet], styleFn)
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  // Initial fill.
  setData(nodes, links)

  return { object, setData, updatePositions, updateColors, updateColorsForNodes, dispose }
}

/**
 * The production entry point: build RIBBONS when the data allows, and fall
 * back to the LineSegments renderer above on any failure (invalid data, a
 * non-finite position, or an allocation throw). The graph never disappears:
 * the fallback is the exact renderer that predates the ribbon work.
 */
/**
 * Below this many links, the per-link renderer shows MORE than any aggregation
 * can: every relation is visible, and the vascular layer would replace 6 000
 * wires with a couple hundred trunks whose centroids bunch wherever the
 * communities overlap in space. Measured on the browser bench at 6 926 links:
 * the aggregated picture was less informative than the detailed one.
 *
 * Above it, the trade is the right way round: the detail is unreadable and the
 * magnitude is what the eye needs.
 */
export const VASCULAR_MIN_LINKS = 3_000

/**
 * Global opacity of a link layer (0..1), whatever renderer drew it: every link
 * shader multiplies its alpha by `uFade`. Used to CROSS-FADE two link layers
 * when the dynamic scale changes what is drawn — a trunk dissolving into its
 * branches instead of links popping in and out (« je ne m'explique pas les
 * liens qui changent »).
 */
export function setLinkFade(object: THREE.Object3D, fade: number): void {
  const f = Math.max(0, Math.min(1, fade))
  object.traverse((o) => {
    const mats = (o as THREE.Mesh).material
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const u = (m as THREE.ShaderMaterial).uniforms?.uFade
      if (u) u.value = f
    }
  })
}

export function createLinkRenderer(nodes: Graph3DNode[], links: Graph3DLink[], frame?: VascularSceneFrame): LinkRenderer {
  // The organic hierarchy first (Organic Link Engine V2), and only where it
  // earns its keep: corridors, exact magnitudes, per-bundle morphology and LOD,
  // vascular strands — one batched geometry whose cost depends on the number of
  // corridors, not on how many relations they summarise.
  //
  // Bundles that already carry several relations (the dynamic scale's
  // aggregates, count > 1) ARE magnitudes: they go to the vascular layer
  // whatever their number, so the link law (r ∝ n^(1/3)) draws them. Measured
  // in a real browser on the real import graph: the overview drew ~600 bundles,
  // fell under the 3 000-link threshold, and the trunks between modules came
  // out as one-pixel threads — the scale law never applied where it matters.
  const carriesAggregates = links.some((l) => (l.count ?? 1) > 1)
  const vascular = links.length > VASCULAR_MIN_LINKS || carriesAggregates ? createVascularLinks(nodes, links, {}, undefined, frame) : null
  if (vascular) return vascular
  // Then the ribbon renderer, then the LineSegments of last resort. Each step is
  // a strict fallback: the graph never disappears because a path could not build.
  const ribbons = createLinkRibbons(nodes, links)
  if (ribbons) return ribbons
  return createLinkSegments(nodes, links)
}
