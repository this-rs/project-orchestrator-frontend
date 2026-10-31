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
  dispose: () => void
}

export function createLinkSegments(nodes: Graph3DNode[], links: Graph3DLink[]): LinkSegments {
  let segmentCount = links.length
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(segmentCount * 2 * 3)
  const colors = new Float32Array(segmentCount * 2 * 3)
  const alphas = new Float32Array(segmentCount * 2)

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
  object.renderOrder = 10 // draw edges last, like the library's link objects

  // id → node (live, mutable positions) and the current link list. Both are
  // replaced wholesale on setData; the arrays themselves are never reassigned
  // outside the constructor (update* read them via geometry.getAttribute).
  let nodeById = new Map<string, Graph3DNode>()
  let linkList = links

  const rebuildIndex = (nodeList: Graph3DNode[]) => {
    const m = new Map<string, Graph3DNode>()
    for (const n of nodeList) m.set(n.id, n)
    nodeById = m
  }

  const setData = (nextNodes: Graph3DNode[], nextLinks: Graph3DLink[]) => {
    linkList = nextLinks
    // Reallocate only when the count changes (graph shape changed).
    const newSegments = nextLinks.length
    if (newSegments !== segmentCount) {
      segmentCount = newSegments
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newSegments * 2 * 3), 3))
      geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(newSegments * 2 * 3), 3))
      geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(newSegments * 2), 1))
    }
    rebuildIndex(nextNodes)
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
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
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
    }
    ;(geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true
    ;(geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  // Initial fill.
  setData(nodes, links)

  return { object, setData, updatePositions, updateColors, dispose }
}
