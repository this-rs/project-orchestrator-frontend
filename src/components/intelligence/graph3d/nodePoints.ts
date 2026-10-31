// ============================================================================
// nodePoints — every graph node drawn as ONE THREE.Points (1 draw call)
// ============================================================================
//
// The sprite path (nodeObjects.ts) builds a Group with several billboard
// Sprites per node — an emoji texture, a ring/label texture, an invisible
// hitbox — so a 1k-node graph issues ~3k draw calls and a 50k-node graph
// would issue ~150k, which WebGL cannot sustain. This module is the po-graph
// answer: one THREE.Points whose per-node color, size, shape, alpha and
// activation are vertex attributes, rewritten in place from the live d3-force
// positions. One draw call for any number of nodes.
//
// WHAT IS LOST vs the sprite path: emoji + circular text labels + native
// library hover. Nodes become procedural shapes (disc / ring / diamond /
// square, by entity type) with color carrying the identity. This tier is for
// large graphs where a per-node texture budget is impossible anyway.
// ============================================================================

import * as THREE from 'three'
import type { Graph3DNode } from './useGraph3DLayout'

/** Final per-node appearance the shader consumes. */
export interface NodeStyle {
  /** Normalized RGB. */
  r: number
  g: number
  b: number
  /** Opacity 0..1. */
  alpha: number
  /** Base point size (world-ish units, scaled by perspective in the shader). */
  size: number
  /** 0 disc · 1 ring · 2 diamond · 3 square. */
  shape: number
  /** Activation glow 0..1 (brightens + enlarges). */
  act: number
}

export type NodeStyleFn = (node: Graph3DNode) => NodeStyle

/** Default shape by entity type (disc / ring / diamond / square). */
export function shapeForType(entityType: string): number {
  switch (entityType) {
    case 'function':
    case 'step':
    case 'commit':
    case 'protocol_state':
      return 1 // ring
    case 'decision':
      return 2 // diamond
    case 'plan':
    case 'task':
    case 'milestone':
    case 'release':
    case 'skill':
    case 'protocol':
    case 'chat_session':
      return 3 // square
    default:
      return 0 // disc (file, struct, trait, enum, note, constraint, feature_graph)
  }
}

/** Default base size by entity type (mirrors the sprite path's nodeVal). */
export function sizeForType(entityType: string): number {
  switch (entityType) {
    case 'plan':
    case 'skill':
    case 'protocol':
    case 'feature_graph':
      return 6
    case 'task':
    case 'decision':
    case 'file':
      return 4
    case 'milestone':
      return 3.5
    case 'release':
    case 'note':
    case 'struct':
    case 'protocol_state':
      return 3
    case 'trait':
      return 2.5
    case 'commit':
      return 1.5
    default:
      return 2
  }
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  attribute float aShape;
  attribute float aAct;
  uniform float uPx;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  varying float vAct;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vShape = aShape;
    vAct = aAct;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float persp = clamp(900.0 / max(1.0, -mv.z), 0.0, 24.0);
    gl_PointSize = clamp(aSize * persp * uPx * (1.0 + aAct * 1.2), 1.5, 120.0);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  varying float vAct;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float mask = 0.0;
    if (vShape < 0.5) {
      // disc
      mask = smoothstep(0.5, 0.40, length(uv));
    } else if (vShape < 1.5) {
      // ring (hollow disc)
      float d = length(uv);
      mask = smoothstep(0.5, 0.40, d) * smoothstep(0.16, 0.24, d);
    } else if (vShape < 2.5) {
      // diamond
      float m = abs(uv.x) + abs(uv.y);
      mask = smoothstep(0.5, 0.40, m);
    } else {
      // square
      float m = max(abs(uv.x), abs(uv.y));
      mask = smoothstep(0.5, 0.44, m);
    }
    if (mask < 0.02) discard;
    // Activation brightens the core toward white for a glow feel.
    vec3 c = mix(vColor, vec3(1.0), vAct * 0.55);
    gl_FragColor = vec4(c, vAlpha * mask);
  }
`

export interface NodePoints {
  readonly object: THREE.Points
  setData: (nodes: Graph3DNode[]) => void
  updatePositions: () => void
  updateStyles: (fn: NodeStyleFn) => void
  /**
   * Return the node nearest to a pointer in NDC (-1..1). O(N) projection; fine
   * for the large-graph overview tier, a spatial index would be a later win.
   */
  pick: (ndcX: number, ndcY: number, camera: THREE.Camera) => Graph3DNode | null
  dispose: () => void
}

export function createNodePoints(nodes: Graph3DNode[]): NodePoints {
  let nodeList = nodes
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(nodes.length * 3)
  const colors = new Float32Array(nodes.length * 3)
  const alphas = new Float32Array(nodes.length)
  const sizes = new Float32Array(nodes.length)
  const shapes = new Float32Array(nodes.length)
  const acts = new Float32Array(nodes.length)

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aShape', new THREE.BufferAttribute(shapes, 1))
  geometry.setAttribute('aAct', new THREE.BufferAttribute(acts, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPx: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
    },
  })

  const object = new THREE.Points(geometry, material)
  object.frustumCulled = false
  object.renderOrder = 1

  const setData = (next: Graph3DNode[]) => {
    nodeList = next
    if (next.length !== (geometry.getAttribute('position') as THREE.BufferAttribute).count) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(next.length * 3), 3))
      geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(next.length * 3), 3))
      geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(next.length), 1))
      geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(next.length), 1))
      geometry.setAttribute('aShape', new THREE.BufferAttribute(new Float32Array(next.length), 1))
      geometry.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(next.length), 1))
    }
    updatePositions()
  }

  const updatePositions = () => {
    const pos = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < nodeList.length; i++) {
      pos[i * 3] = nodeList[i].x ?? 0
      pos[i * 3 + 1] = nodeList[i].y ?? 0
      pos[i * 3 + 2] = nodeList[i].z ?? 0
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  const updateStyles = (fn: NodeStyleFn) => {
    const col = (geometry.getAttribute('aColor') as THREE.BufferAttribute).array as Float32Array
    const alp = (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).array as Float32Array
    const siz = (geometry.getAttribute('aSize') as THREE.BufferAttribute).array as Float32Array
    const shp = (geometry.getAttribute('aShape') as THREE.BufferAttribute).array as Float32Array
    const act = (geometry.getAttribute('aAct') as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < nodeList.length; i++) {
      const s = fn(nodeList[i])
      col[i * 3] = s.r; col[i * 3 + 1] = s.g; col[i * 3 + 2] = s.b
      alp[i] = s.alpha
      siz[i] = s.size
      shp[i] = s.shape
      act[i] = s.act
    }
    for (const name of ['aColor', 'aAlpha', 'aSize', 'aShape', 'aAct']) {
      ;(geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true
    }
  }

  const _v = new THREE.Vector3()
  const pick = (ndcX: number, ndcY: number, camera: THREE.Camera): Graph3DNode | null => {
    let best: Graph3DNode | null = null
    let bestD = 0.035 * 0.035 // ~3.5% of NDC half-width
    for (const node of nodeList) {
      _v.set(node.x ?? 0, node.y ?? 0, node.z ?? 0).project(camera)
      if (_v.z > 1) continue // behind the camera
      const dx = _v.x - ndcX
      const dy = _v.y - ndcY
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = node }
    }
    return best
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  setData(nodes)

  return { object, setData, updatePositions, updateStyles, pick, dispose }
}
