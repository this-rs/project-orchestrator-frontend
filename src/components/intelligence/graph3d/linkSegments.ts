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
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import { LINK_RENDER_ORDER } from './nodePoints'
import { ARROW_VERTICES, arrowsEnabled, computeArrowHead } from './linkArrows'
import { isDirectionalRelation } from './linkFamily'

/** Final per-link style: normalized RGB + alpha (0..1). */
export interface LinkStyle {
  r: number
  g: number
  b: number
  a: number
}

/** A style provider evaluated for every link whenever highlight state changes. */
export type LinkStyleFn = (link: Graph3DLink) => LinkStyle

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
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
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
  // Vertex layout: [0, 2N) the N link strokes (vertex 2i, 2i+1); then, appended,
  // ARROW_VERTICES per directional link (see linkArrows). arrowSlot[i] is the
  // first vertex of link i's head, or -1 (bare stroke).
  let vertexCount = links.length * 2
  let arrowSlot = new Int32Array(0)
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
    // Reallocate only when the count changes (graph shape changed).
    const slots = new Int32Array(nextLinks.length).fill(-1)
    let next = nextLinks.length * 2
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
    // Fill positions from scratch (and, on a fresh object, the arrays start zeroed).
    updatePositions()
  }

  const updatePositions = () => {
    const pos = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < linkList.length; i++) {
      const link = linkList[i]
      const s = nodeById.get(endpointId(link.source))
      const t = nodeById.get(endpointId(link.target))
      const o = i * 6
      pos[o] = s?.x ?? 0
      pos[o + 1] = s?.y ?? 0
      pos[o + 2] = s?.z ?? 0
      pos[o + 3] = t?.x ?? 0
      pos[o + 4] = t?.y ?? 0
      pos[o + 5] = t?.z ?? 0
      const slot = arrowSlot[i]
      if (slot >= 0) {
        const h = computeArrowHead(
          [pos[o], pos[o + 1], pos[o + 2]], [pos[o + 3], pos[o + 4], pos[o + 5]],
          link.relationType, linkList.length,
        )
        // Degenerate link: collapse the head onto the source (zero-length, invisible).
        if (h) pos.set(h, slot * 3)
        else pos.fill(pos[o], slot * 3, slot * 3 + ARROW_VERTICES * 3)
      }
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  /** Give link i's head (if any) the same colour and alpha as its stroke. */
  const paintArrow = (i: number, s: LinkStyle, col: Float32Array, alp: Float32Array) => {
    const slot = arrowSlot[i]
    if (slot < 0) return
    for (let v = 0; v < ARROW_VERTICES; v++) {
      const c = (slot + v) * 3
      col[c] = s.r; col[c + 1] = s.g; col[c + 2] = s.b
      alp[slot + v] = s.a
    }
  }

  const updateColors = (styleFn: LinkStyleFn) => {
    const col = (geometry.getAttribute('aColor') as THREE.BufferAttribute).array as Float32Array
    const alp = (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < linkList.length; i++) {
      const s = styleFn(linkList[i])
      const o = i * 6
      col[o] = s.r; col[o + 1] = s.g; col[o + 2] = s.b
      col[o + 3] = s.r; col[o + 4] = s.g; col[o + 5] = s.b
      const a = i * 2
      alp[a] = s.a; alp[a + 1] = s.a
      paintArrow(i, s, col, alp)
    }
    ;(geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true
    ;(geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true
  }

  /** Rewrite only the given link indices (two vertices each), with ranged uploads. */
  const updateColorsAt = (indices: number[], styleFn: LinkStyleFn) => {
    if (indices.length === 0) return
    const col = (geometry.getAttribute('aColor') as THREE.BufferAttribute).array as Float32Array
    const alp = (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).array as Float32Array
    const colAttr = geometry.getAttribute('aColor') as THREE.BufferAttribute
    const alpAttr = geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    for (const i of indices) {
      if (i < 0 || i >= linkList.length) continue
      const s = styleFn(linkList[i])
      const o = i * 6
      col[o] = s.r; col[o + 1] = s.g; col[o + 2] = s.b
      col[o + 3] = s.r; col[o + 4] = s.g; col[o + 5] = s.b
      const a = i * 2
      alp[a] = s.a; alp[a + 1] = s.a
      // Two vertices (source + target) per link, in element units.
      colAttr.addUpdateRange(i * 6, 6)
      alpAttr.addUpdateRange(i * 2, 2)
      paintArrow(i, s, col, alp)
      const slot = arrowSlot[i]
      if (slot >= 0) {
        colAttr.addUpdateRange(slot * 3, ARROW_VERTICES * 3)
        alpAttr.addUpdateRange(slot, ARROW_VERTICES)
      }
    }
    colAttr.needsUpdate = true
    alpAttr.needsUpdate = true
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
