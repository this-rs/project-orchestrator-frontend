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

// ============================================================================
// Shader — a lit point, not a flat polygon (ported from po-graph's nodeMat)
// ============================================================================
//
// WHAT WAS WRONG. The first version drew a hard-edged mask (`smoothstep` of a
// distance, normal alpha blending, nothing else): a disc of flat colour with a
// ~1 px ramp. Above ~8 px it reads as a sticker, and a dense graph turns into a
// milky sheet because every sprite composites its full opacity onto the frame.
//
// WHAT REPLACES IT, in po-graph's terms (po-graph.js:461-481):
//   * ADDITIVE blending — the sprite EMITS light instead of covering pixels, so
//     overlapping nodes brighten each other (the nebula look) instead of
//     compositing toward grey;
//   * a HALO `(1-d²)²` that dies smoothly at the sprite edge, plus a narrow
//     bright CORE — every node reads as a small light source;
//   * a GLOBAL GAIN `uGlobal ≈ √(NREF/N)` (po-graph's `uGlobal`, see
//     po-graph.js:4185: `S.light / sqrt(pt*uN)`): two thousand overlapping
//     halos at full gain IS the "blanc laiteux" the user reported, so per-node
//     light falls off as the crate fills up;
//   * SPRITE_HEADROOM — the visible shape is drawn at ~0.4 of the sprite and the
//     sprite is twice as large as before, so the halo has a band of its own
//     outside the core while the node keeps its apparent radius.
//
// aAlpha and aAct remain the contract with the caller: aAlpha scales the emitted
// light (hover / dimming / legend highlighting keep working), aAct enlarges the
// node (vertex stage) and pushes its core to white (fragment stage).

/**
 * How much larger the sprite is than the shape drawn inside it.
 *
 * The footprints in the fragment shader are expressed in
 * `p = (gl_PointCoord - 0.5) * 2` space, where 1.0 is the sprite edge, and the
 * shapes are drawn at about 0.42 of that. Multiplying `gl_PointSize` by 2 gives
 * the halo the outer 58 % of the sprite to fade through, and keeps the APPARENT
 * radius of a node where the hard-edged version had it:
 *
 *     new: 0.42 (p-space) × (2·S/2) px  =  0.42·S px
 *     old: 0.80 (uv-space) × (S)   px    =  0.40·S px
 *
 * i.e. the same footprint, but soft: the glow reaches exactly where the old hard
 * edge was, and the visible shape is its middle.
 */
const SPRITE_SCALE = 2.0

/**
 * Smallest ON-SCREEN size of a node's visible shape, in CSS pixels.
 *
 * Measured on a 20 000-node graph framed by the camera (fov 50, uPx 1.5): a
 * `function` node (size 2) came out as a 3.6-px sprite whose shape is 0.43·S =
 * 1.5 px, and a `commit` (size 1.5) as 1.2 px — below one pixel the additive
 * light is spread over a pixel that never reaches the threshold, so the node is
 * simply not there. Below this size a node stops shrinking: the overview needs
 * to see every point, even when the camera is far.
 */
export const NODE_MIN_SHAPE_PX = 3

/**
 * Diameter of the visible shape as a fraction of the sprite, at the small end.
 * At big sizes it is 0.43 (disc edge, see the fragment shader). When the sprite
 * is small the shapes are enlarged by up to SHAPE_GROW_SMALL so the core
 * keeps its pixels instead of being eaten by the halo: radius 0.36 (mid-ramp of
 * the disc) × 1.6 = 0.576 of the half-sprite, i.e. 0.576·S px across.
 */
/** Mid-ramp radius of the disc, as a fraction of the half-sprite. */
export const NODE_SHAPE_MID_RADIUS = 0.36
const SHAPE_GROW_SMALL = 1.6
export const NODE_SHAPE_FRACTION_SMALL = NODE_SHAPE_MID_RADIUS * SHAPE_GROW_SMALL
/** Sprite size (CSS px) under which shapes grow, fully grown at the lower bound. */
const SHAPE_GROW_FROM_PX = 20
const SHAPE_GROW_FULL_PX = 8

/**
 * Sprite floor in CSS px: the sprite for which a fully-grown shape measures
 * NODE_MIN_SHAPE_PX. 3 / 0.576 = 5.21 px. (It was 2.5 DEVICE px = 1.7 CSS px.)
 */
export const NODE_MIN_SPRITE_PX = NODE_MIN_SHAPE_PX / NODE_SHAPE_FRACTION_SMALL
/** Sprite ceiling in CSS px. */
export const NODE_MAX_SPRITE_PX = 160

/**
 * CPU mirror of the vertex shader's `gl_PointSize` (device px), so the bounds
 * are testable without a GPU. `viewDepth` is the distance along the view axis
 * (`-mv.z`).
 */
export function nodeSpritePx(size: number, viewDepth: number, uPx: number, act = 0): number {
  const persp = Math.min(24, Math.max(0, 900 / Math.max(1, viewDepth)))
  const raw = size * persp * uPx * SPRITE_SCALE * (1 + act * 1.2)
  return Math.min(NODE_MAX_SPRITE_PX * uPx, Math.max(NODE_MIN_SPRITE_PX * uPx, raw))
}

/** CPU mirror of the fragment shader's shape growth factor (1 → SHAPE_GROW_SMALL). */
export function shapeGrow(spriteCssPx: number): number {
  const t = Math.min(1, Math.max(0, (SHAPE_GROW_FROM_PX - spriteCssPx) / (SHAPE_GROW_FROM_PX - SHAPE_GROW_FULL_PX)))
  return 1 + (SHAPE_GROW_SMALL - 1) * (t * t * (3 - 2 * t))
}

/** Draw order: edges first, then nodes on top (additive light cannot be hidden by a line). */
export const LINK_RENDER_ORDER = 1
export const NODE_POINTS_RENDER_ORDER = 10

/**
 * Node count at which the per-node gain is still 1. A 200-node graph must not
 * pay for a 4000-node one, so nothing is dimmed below this count.
 */
export const NODE_GAIN_REFERENCE = 400

/**
 * Floor on the per-node light gain.
 *
 * Above ~10k nodes `√(NREF/count)` keeps falling — at 40k nodes it is 0.1 —
 * and a fully-lit node then emits a tenth of its colour, which reads as black
 * on the dark canvas; a dimmed (alpha 0.3) node emits 3 % and is invisible.
 * This is the "the elements should also be visible" failure. The floor keeps a
 * lit node at least this bright while `1/√N` still damps the aggregate above
 * the reference.
 *
 * VALUE. 0.2 → 0.3. At 20 000 nodes `√(400/20000)` = 0.141, floored to 0.2. A
 * disc centre emits (colour·1.658 + 0.22)·gain; against #0f1117 the worst
 * palette colour (plan #0ea5e9) gives a contrast of 2.27:1 at 0.2 and 3.65:1 at
 * 0.3 (WCAG ≥ 3:1 needs ≥ ~0.26). TRADE-OFF: the floor now bites from
 * `400/0.3²` = 4 444 nodes (was 10 000), so between 4.4k and 20k the aggregate
 * is 1.5× brighter than pure 1/√N — slightly more "milky" where halos overlap.
 * Accepted: the milk was mostly the LINKS (now faded by density), whereas an
 * unreadable node is a total loss.
 */
export const NODE_GAIN_FLOOR = 0.3

/**
 * Per-node light gain for a graph of `count` nodes:
 * `min(1, max(FLOOR, √(NREF/count)))`.
 *
 * WHY √ AND NOT 1/N. Halo brightness adds linearly in the number of sprites,
 * but two nodes only overlap when they are close, and d3 spreads them out as
 * the count grows. 1/N would make a large graph not merely calm but dark; 1/√N
 * is the compromise po-graph settled on, and it is what stops a 5k-node graph
 * from saturating to white. It is the same shape of formula as po-graph's
 * `uGlobal`, normalised so that a small graph is left untouched.
 */
export function nodeGain(count: number): number {
  const n = Number.isFinite(count) && count > 0 ? count : 1
  return Math.min(1, Math.max(NODE_GAIN_FLOOR, Math.sqrt(NODE_GAIN_REFERENCE / n)))
}

/** Under this many nodes the density attenuation is exactly 1 (an isolated point keeps its opacity). */
export const DENS_FREE_COUNT = 1000
/** Floor of the density factor: a point is never dimmed below 35 % of its alpha. */
export const DENS_K_MIN = 0.35
/** Camera distance (to the orbit target) up to which no distance penalty applies, and where it saturates. */
export const DENS_DIST_NEAR = 300
export const DENS_DIST_FAR = 1200
/** Smallest distance factor: far away, alpha is multiplied by at most this much less. */
export const DENS_DIST_MIN = 0.7

/** Distance factor in [DENS_DIST_MIN, 1]: 1 up close, falling linearly to DENS_DIST_MIN at DENS_DIST_FAR. Never 0, never > 1. */
export function densityDistanceFactor(distance: number): number {
  const d = Number.isFinite(distance) && distance > 0 ? distance : 0
  const t = Math.min(1, Math.max(0, (d - DENS_DIST_NEAR) / (DENS_DIST_FAR - DENS_DIST_NEAR)))
  return 1 - (1 - DENS_DIST_MIN) * t
}

/**
 * Density attenuation `uDensK` applied to the points' alpha (po-graph's uDensK,
 * which also scales with camera distance):
 *
 *     count <= 1000 : 1.0                     (nothing is touched)
 *     otherwise     : clamp( √(1000/count) × densityDistanceFactor(dist), 0.35, 1 )
 *
 * More nodes and a farther camera ⇒ lower alpha, bounded below by 0.35 so the
 * overview never vanishes. Monotone non-increasing in `count` and `distance`.
 */
export function densityAlphaK(count: number, distance: number): number {
  if (!Number.isFinite(count) || count <= DENS_FREE_COUNT) return 1
  return Math.min(1, Math.max(DENS_K_MIN, Math.sqrt(DENS_FREE_COUNT / count) * densityDistanceFactor(distance)))
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
  varying float vSprite;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vShape = aShape;
    vAct = aAct;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float persp = clamp(900.0 / max(1.0, -mv.z), 0.0, 24.0);
    // The sprite is SPRITE_SCALE times the size a hard-edged disc of the same
    // apparent radius needed: the halo lives in the extra room, the shape keeps
    // its footprint (see SPRITE_SCALE). gl_PointSize is in DEVICE pixels,
    // therefore uPx must stay in lockstep with the renderer's pixel ratio (see
    // createNodePoints().setPixelRatio) — otherwise the ratio drop makes every
    // point grow by the factor the renderer lost.
    const float headroom = ${SPRITE_SCALE.toFixed(1)};
    // Floor = NODE_MIN_SPRITE_PX CSS px (≈ 3 px of visible shape, see
    // NODE_MIN_SHAPE_PX): a smaller sprite would fade the node away entirely.
    float sprite = clamp(aSize * persp * uPx * headroom * (1.0 + aAct * 1.2), ${NODE_MIN_SPRITE_PX.toFixed(3)} * uPx, ${NODE_MAX_SPRITE_PX.toFixed(1)} * uPx);
    gl_PointSize = sprite;
    vSprite = sprite / uPx;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uGlobal;
  uniform float uDensK;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  varying float vAct;
  varying float vSprite;

  /** Soft annulus of radius r and half-width w, in sprite space (d in 0..1). */
  float ring(float d, float r, float w) {
    return smoothstep(w, w * 0.25, abs(d - r));
  }

  void main() {
    // Sprite space: 0 at the centre, 1 on the edge, so the footprints below read
    // as "radius, as a fraction of the sprite".
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    float d = length(p);
    // The corners of the square sprite sit at d = √2; max() keeps the halo from
    // going negative there (a squared negative would bloom INTO the corners).
    float q = max(0.0, 1.0 - d * d);

    // SMALL SPRITES. The halo takes the outer 58 % of the sprite; at 5-8 px that
    // leaves the shape 1-2 px. Keep the halo's APPARENT radius (it stays in d)
    // but enlarge shape and core: ps is p seen through a magnifier that grows
    // from 1 (sprite >= ${SHAPE_GROW_FROM_PX.toFixed(0)} px) to ${SHAPE_GROW_SMALL.toFixed(1)} (sprite <= ${SHAPE_GROW_FULL_PX.toFixed(0)} px).
    float grow = 1.0 + ${(SHAPE_GROW_SMALL - 1).toFixed(2)} * smoothstep(${SHAPE_GROW_FROM_PX.toFixed(1)}, ${SHAPE_GROW_FULL_PX.toFixed(1)}, vSprite);
    vec2 ps = p / grow;
    float ds = length(ps);

    // Halo: quadratic falloff — no shoulder, no visible edge, zero at the rim.
    float halo = q * q * 0.62;
    // Core: the hot centre of a light source. Narrower than any shape, so it
    // reads as brightness rather than as an outline.
    float core = smoothstep(0.26, 0.0, ds);

    // The four shapes are kept, with a ramp about 1.4× wider than the old
    // hard-edged masks: what used to be a 1-pixel step is now a graded edge that
    // the halo continues outward.
    float m = 0.0;
    if (vShape < 0.5) {
      // disc
      m = smoothstep(0.43, 0.29, ds) * 1.10;
    } else if (vShape < 1.5) {
      // ring (hollow disc) — the outline IS the identity, so the halo steps back
      m = ring(ds, 0.34, 0.12) * 0.95 + core * 0.30;
      halo *= 0.40;
    } else if (vShape < 2.5) {
      // diamond — |x|+|y| = 0.46 stays well inside the sprite
      float dd = abs(ps.x) + abs(ps.y);
      m = smoothstep(0.53, 0.37, dd) * 0.85 + ring(dd, 0.46, 0.11) * 0.35 + core * 0.55;
    } else {
      // square — max(|x|,|y|) = 0.48, so its corners sit at d = 0.68
      float sq = max(abs(ps.x), abs(ps.y));
      m = smoothstep(0.53, 0.40, sq) * 0.85 + ring(sq, 0.48, 0.10) * 0.35 + core * 0.55;
    }

    float lum = m + halo * 0.9;
    // Discard instead of blending a zero: on a 5k-node graph the empty part of
    // each sprite is most of its fill rate. vAlpha is folded in here because a
    // dimmed node (legend hover, group dimming: alpha 0.06) contributes nothing
    // the eye can see, so its whole sprite may be skipped.
    if (lum * vAlpha < 0.004) discard;

    // Colour × shape, plus a white centre that aAct drives (po-graph does the
    // same with m*(.08+vAct*.8)), so activation both enlarges and brightens.
    vec3 c = vColor * lum + vec3(1.0) * (core * 0.22 + m * vAct * 0.75);
    // uGlobal caps the total emitted light as the node count grows; vAlpha is
    // the caller's per-node opacity (hover, dimming, legend, activation).
    c *= vAlpha * uGlobal * uDensK;
    // Additive blending: alpha is 1 and the intensity lives in the colour, so
    // overlapping nodes brighten each other instead of occluding each other.
    gl_FragColor = vec4(min(c, vec3(4.0)), 1.0);
  }
`

export interface NodePoints {
  readonly object: THREE.Points
  setData: (nodes: Graph3DNode[]) => void
  updatePositions: () => void
  updateStyles: (fn: NodeStyleFn) => void
  /** Index of a node id in the current buffer, or -1 when absent. */
  indexOf: (id: string) => number
  /**
   * Targeted in-place write of ONE node's style attributes. Uses per-attribute
   * `addUpdateRange` so only this vertex is re-uploaded to the GPU — the
   * counterpart to `updateStyles`'s full-buffer rewrite, for the transient
   * hover spotlight (O(1) instead of O(N) per hover change).
   */
  updateStyleAt: (index: number, style: NodeStyle) => void
  /**
   * Return the node under a prepared raycaster (three.js Points.raycast).
   * The caller sets `raycaster.params.Points.threshold` from camera distance
   * and throttles the calls (~16/s) — see po-graph's onMove.
   */
  pick: (raycaster: THREE.Raycaster) => Graph3DNode | null
  /**
   * Keep the shader's `uPx` equal to the renderer's pixel ratio.
   *
   * `gl_PointSize` is expressed in DEVICE pixels, so a renderer that drops from
   * ratio 1.5 to 1.0 while `uPx` stays at 1.5 makes every point 1.5× larger on
   * screen. The two must move together — see useRenderLoop's frame budget.
   */
  setPixelRatio: (pixelRatio: number) => void
  /** Feed the camera→target distance; recomputes `uDensK` only when it moves. */
  setCameraDistance: (distance: number) => void
  /** Current `uPx`, for tests and for wiring a newly created Points. */
  getPixelRatio: () => number
  dispose: () => void
}

export function createNodePoints(nodes: Graph3DNode[]): NodePoints {
  let nodeList = nodes
  /** id → index into the attribute arrays, rebuilt by setData. */
  let indexById = new Map<string, number>()
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
    // Additive: the sprites EMIT light, so overlapping nodes brighten each other
    // (po-graph's nodeMat, po-graph.js:461) instead of compositing into grey.
    blending: THREE.AdditiveBlending,
    uniforms: {
      // Device pixels per CSS pixel. gl_PointSize is in DEVICE pixels, so this is
      // the RENDERER's pixel ratio, never the screen's: the adaptive quality loop
      // moves both together (see `setPixelRatio` below), otherwise the points
      // change their on-screen size whenever the ratio changes.
      uPx: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5) },
      // Per-node light gain, recomputed from the node count by setData().
      uGlobal: { value: nodeGain(nodes.length) },
      // Density attenuation of the alpha (1 = untouched), see densityAlphaK().
      uDensK: { value: densityAlphaK(nodes.length, 0) },
    },
  })

  const object = new THREE.Points(geometry, material)
  object.frustumCulled = false
  object.renderOrder = NODE_POINTS_RENDER_ORDER

  const setPixelRatio = (pixelRatio: number) => {
    const px = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
    material.uniforms.uPx.value = px
  }

  let camDistance = 0
  /** Camera→target distance changed: refresh uDensK (called per state change, never per frame). */
  const setCameraDistance = (distance: number) => {
    camDistance = distance
    const k = densityAlphaK(nodeList.length, distance)
    if (Math.abs(k - (material.uniforms.uDensK.value as number)) > 0.002) material.uniforms.uDensK.value = k
  }

  const getPixelRatio = () => material.uniforms.uPx.value as number

  const setData = (next: Graph3DNode[]) => {
    nodeList = next
    const idx = new Map<string, number>()
    for (let i = 0; i < next.length; i++) idx.set(next[i].id, i)
    indexById = idx
    // The gain is a property of the crate, not of a node: recompute it here,
    // once per data change, so a filtered or aggregated graph is not lit like
    // the full one it came from.
    material.uniforms.uGlobal.value = nodeGain(next.length)
    material.uniforms.uDensK.value = densityAlphaK(next.length, camDistance)
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

  const indexOf = (id: string): number => indexById.get(id) ?? -1

  const updateStyleAt = (index: number, s: NodeStyle) => {
    if (index < 0 || index >= nodeList.length) return
    const col = geometry.getAttribute('aColor') as THREE.BufferAttribute
    const alp = geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    const siz = geometry.getAttribute('aSize') as THREE.BufferAttribute
    const shp = geometry.getAttribute('aShape') as THREE.BufferAttribute
    const act = geometry.getAttribute('aAct') as THREE.BufferAttribute
    col.setXYZ(index, s.r, s.g, s.b)
    alp.setX(index, s.alpha)
    siz.setX(index, s.size)
    shp.setX(index, s.shape)
    act.setX(index, s.act)
    // Single-vertex GPU upload. `addUpdateRange` is counted in ELEMENTS, so a
    // vec3 attribute spans `itemSize` elements per vertex; scalars span one.
    col.addUpdateRange(index * col.itemSize, col.itemSize)
    alp.addUpdateRange(index, 1)
    siz.addUpdateRange(index, 1)
    shp.addUpdateRange(index, 1)
    act.addUpdateRange(index, 1)
    col.needsUpdate = true
    alp.needsUpdate = true
    siz.needsUpdate = true
    shp.needsUpdate = true
    act.needsUpdate = true
  }

  // A large, static bounding sphere so Points.raycast never early-rejects on a
  // stale (position-dependent) sphere. frustumCulled is off, so the sphere is
  // only read by the raycaster.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7)

  /**
   * Pick the node under a prepared raycaster. Uses three.js's built-in
   * Points.raycast (per-point ray distance, cheap) instead of projecting every
   * node to NDC — the caller must set `raycaster.params.Points.threshold`
   * (scaled by camera distance) and throttle the calls (po-graph: ≤16/s).
   */
  const pick = (raycaster: THREE.Raycaster): Graph3DNode | null => {
    object.updateMatrixWorld()
    const hits = raycaster.intersectObject(object)
    for (const h of hits) {
      if (typeof h.index === 'number' && h.index >= 0 && h.index < nodeList.length) {
        return nodeList[h.index]
      }
    }
    return null
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  setData(nodes)

  return { object, setData, updatePositions, updateStyles, indexOf, updateStyleAt, pick, setPixelRatio, setCameraDistance, getPixelRatio, dispose }
}
