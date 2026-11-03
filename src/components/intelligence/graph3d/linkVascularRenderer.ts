// ============================================================================
// linkVascularRenderer — the vascular link layer of the Organic Link Engine V2
// ============================================================================
//
// This is the renderer T7 promised: ONE geometry for the whole link layer,
// built from the magnitude pipeline instead of from a global regime.
//
//   links ─▶ corridors (T6) ─▶ magnitudes (T1) ─▶ morphology (T2/T3)
//          ─▶ LOD (T4) ─▶ strands, frames (T5) ─▶ tubes ─▶ ONE BufferGeometry
//
// WHAT CHANGES ON SCREEN
// A bundle is no longer a flat triangle strip of fixed width. It is a set of
// STRANDS wound around a common path — one strand for a filament, several for a
// conduit, a braided set for an artery — and the number of strands keeps growing
// after the projected width has hit its ceiling. That is how 10⁶ and 10⁹ say
// different things without being wider.
//
// COST. The geometry is a function of the number of CORRIDORS and their LOD
// depth, never of the number of relations a corridor summarises: a corridor of
// 10¹² relations costs exactly what a corridor of 10³ costs. `linkSystem.ts`
// owns that budget; this file only obeys it.
//
// FALLBACK. Any failure — bad data, allocation, a NaN position — returns null so
// the caller keeps the existing ribbon renderer. The graph must never vanish
// because the new path could not build.
// ============================================================================

import * as THREE from 'three'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import type { LinkRenderer } from './linkRibbons'
import type { LinkStyle, LinkStyleFn } from './linkRibbon'
import { buildCorridors, type Corridor } from './linkRouting'
import { buildLinkSystem, fromCorridors, type DrawableBundle, type SystemBudget } from './linkSystem'
import { braidedOffsets, parallelTransportFrames, type Vec3 } from './linkVascular'
import { communityToken } from './linkRibbon'
import { LINK_RENDER_ORDER } from './nodePoints'
import { buildRanges, bundleAtTriangle } from './linkVascularPicking'

/** `LinkRenderer` + capacité de picking (champs optionnels, additifs). */
export interface VascularLinkRenderer extends LinkRenderer {
  /** Clé du bundle qui possède ce triangle (`faceIndex` du raycast), ou null. */
  bundleAt?: (faceIndex: number) => string | null
  /** Rappel de clic transmis aux options ; à invoquer par le câblage externe. */
  onBundleClick?: (key: string) => void
}

/** Radial segments of a strand's tube. Six reads round at these widths and stays cheap. */
const TUBE_SEGMENTS = 6
/** Share of the link length used as the spline's bow — organic, never a straight wire. */
const BOW = 0.18
/** Hard ceiling on strands drawn for one bundle, whatever the morphology asks. */
const MAX_STRANDS = 5

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

const endpointId = (e: string | { id: string }): string => (typeof e === 'string' ? e : e.id)

/** Deterministic 0..2π seed from a corridor key, so a trunk's bow never flickers. */
function hashKey(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967296) * Math.PI * 2
}

/** One strand of one bundle, with the endpoints it must follow when positions move. */
interface Strand {
  bundleIndex: number
  /** The bundle's two anchor NODE ids — the most connected node on each side, so a
   *  position update has a real node to follow. The tube itself runs between the
   *  two ensemble centroids (see `fillStrand`), not between these two nodes. */
  fromId: string
  toId: string
  /** Lateral offset of this strand around the path, in [0,1) — its place in the braid. */
  lane: number
  phase: number
}

interface Bundle {
  corridor: Corridor
  drawable: DrawableBundle
  /** Bow seed of the WHOLE bundle — every strand of a trunk shares its path. */
  bowSeed: number
  color: LinkStyle
  strands: Strand[]
  /** First vertex of this bundle in the shared buffers, and how many it owns. */
  vertexStart: number
  vertexCount: number
}

function toVec3(n: Graph3DNode): Vec3 {
  return [n.x, n.y, n.z]
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function norm3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** A quadratic bow between two anchors: the control point is pushed off-axis so links curve. */
function bowAnchors(a: Vec3, b: Vec3, seed: number): [Vec3, Vec3] {
  const d = sub3(b, a)
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const axis = norm3([d[1] * 0.7 + Math.cos(seed) * 0.3, d[2] * 0.7 + Math.sin(seed) * 0.3, d[0] * 0.7])
  const perp = norm3(cross3(norm3(d), axis))
  const bow = len * BOW
  const c1 = lerp3(a, b, 1 / 3)
  const c2 = lerp3(a, b, 2 / 3)
  return [
    [c1[0] + perp[0] * bow, c1[1] + perp[1] * bow, c1[2] + perp[2] * bow],
    [c2[0] + perp[0] * bow, c2[1] + perp[1] * bow, c2[2] + perp[2] * bow],
  ]
}

/**
 * Build the vascular link layer, or null when the data cannot carry it.
 *
 * `budget` is the same object `linkSystem` uses; the camera distance decides the
 * LOD, so a closer camera decomposes more bundles — locally, never globally.
 */
export function createVascularLinks(
  nodes: Graph3DNode[],
  links: Graph3DLink[],
  budget: Partial<SystemBudget> = {},
  /** Rappel optionnel : le câblage DOM appelle `bundleAt` puis ce rappel ailleurs. */
  onBundleClick?: (key: string) => void,
): VascularLinkRenderer | null {
  try {
    if (!Array.isArray(nodes) || !Array.isArray(links) || links.length === 0) return null
    for (const n of nodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z)) return null
    }

    const nodeById = new Map<string, Graph3DNode>()
    for (const n of nodes) nodeById.set(n.id, n)

    const corridors = buildCorridors(links)
    if (corridors.length === 0) return null

    const system = buildLinkSystem(fromCorridors(corridors), budget)
    if (system.bundles.length === 0) return null

    // ── Anchors: where each corridor starts and ends, in world space ──────
    // A corridor's two ends are community tokens; the positions come from the
    // REAL endpoints of its links, averaged per side. No invented anchor.
    const corridorByKey = new Map(corridors.map((c) => [c.key, c]))
    const anchors = new Map<string, { a: Vec3; b: Vec3 }>()
    for (const bundle of system.bundles) {
      const corridor = corridorByKey.get(bundle.corridor.key)
      if (!corridor) continue
      let ax = 0, ay = 0, az = 0, an = 0
      let bx = 0, by = 0, bz = 0, bn = 0
      for (const link of corridor.links) {
        const s = nodeById.get(endpointId(link.source))
        const t = nodeById.get(endpointId(link.target))
        if (!s || !t) continue
        const sSide = communityToken(link.sourceCommunityId)
        if (sSide === corridor.from) {
          ax += s.x; ay += s.y; az += s.z; an++
          bx += t.x; by += t.y; bz += t.z; bn++
        } else {
          ax += t.x; ay += t.y; az += t.z; an++
          bx += s.x; by += s.y; bz += s.z; bn++
        }
      }
      if (an === 0 || bn === 0) continue
      anchors.set(bundle.corridor.key, {
        a: [ax / an, ay / an, az / an],
        b: [bx / bn, by / bn, bz / bn],
      })
    }

    // Bounding radius of the graph, so every thickness is expressed as a share
    // of what is actually on screen.
    let sceneRadius = 1
    for (const n of nodes) {
      const d = Math.hypot(n.x, n.y, n.z)
      if (Number.isFinite(d) && d > sceneRadius) sceneRadius = d
    }

    // ── Buffers ──────────────────────────────────────────────────────────
    const bundles: Bundle[] = []
    const position: number[] = []
    const color: number[] = []
    const alpha: number[] = []
    const index: number[] = []

    for (const drawable of system.bundles) {
      const corridor = corridorByKey.get(drawable.corridor.key)
      const anchor = anchors.get(drawable.corridor.key)
      if (!corridor || !anchor) continue
      const strandCount = Math.min(MAX_STRANDS, Math.max(1, drawable.strands))
      const samples = drawable.samples
      const ringVerts = samples * TUBE_SEGMENTS
      const vertexStart = position.length / 3
      const strands: Strand[] = []
      for (let s = 0; s < strandCount; s++) {
        strands.push({
          bundleIndex: bundles.length,
          fromId: endpointId(corridor.links[0].source),
          toId: endpointId(corridor.links[0].target),
          lane: strandCount === 1 ? 0.5 : s / (strandCount - 1),
          phase: s * 0.7,
        })
      }
      bundles.push({
        corridor,
        drawable,
        // One bow per TRUNK, derived from its key: all strands of the same
        // bundle follow the same path and only braid around it. Giving each
        // strand its own seed turned every trunk into a fan of diverging curves
        // — measured on the 5 107-node bench, where corridors spanned the whole
        // graph as spaghetti instead of reading as one vessel.
        bowSeed: hashKey(corridor.key),
        color: { r: 0.4, g: 0.8, b: 0.7, r2: 0.6, g2: 0.9, b2: 0.8, a: 0.3 },
        strands,
        vertexStart,
        vertexCount: ringVerts * strandCount,
      })
      // Placeholder positions/colors: fillStrand overwrites them from the anchors.
      for (let i = 0; i < ringVerts * strandCount; i++) {
        position.push(anchor.a[0], anchor.a[1], anchor.a[2])
        color.push(0.4, 0.8, 0.7)
        alpha.push(0)
      }
      for (let s = 0; s < strandCount; s++) {
        const base = vertexStart + s * ringVerts
        for (let i = 0; i < samples - 1; i++) {
          for (let k = 0; k < TUBE_SEGMENTS; k++) {
            const a0 = base + i * TUBE_SEGMENTS + k
            const a1 = base + i * TUBE_SEGMENTS + ((k + 1) % TUBE_SEGMENTS)
            const b0 = a0 + TUBE_SEGMENTS
            const b1 = a1 + TUBE_SEGMENTS
            index.push(a0, b0, a1, a1, b0, b1)
          }
        }
      }
    }

    if (bundles.length === 0) return null

    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(new Float32Array(position), 3)
    const colorAttr = new THREE.BufferAttribute(new Float32Array(color), 3)
    const alphaAttr = new THREE.BufferAttribute(new Float32Array(alpha), 1)
    positionAttr.setUsage(THREE.DynamicDrawUsage)
    colorAttr.setUsage(THREE.DynamicDrawUsage)
    alphaAttr.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aColor', colorAttr)
    geometry.setAttribute('aAlpha', alphaAttr)
    geometry.setIndex(index)

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = LINK_RENDER_ORDER
    mesh.frustumCulled = false
    const group = new THREE.Group()
    group.add(mesh)

    /** Centroids of a corridor's two sides, from its REAL endpoints. */
    const corridorCentroids = (corridor: Corridor): { a: Vec3; b: Vec3 } | null => {
      let ax = 0, ay = 0, az = 0, an = 0
      let bx = 0, by = 0, bz = 0, bn = 0
      for (const link of corridor.links) {
        const s = nodeById.get(endpointId(link.source))
        const t = nodeById.get(endpointId(link.target))
        if (!s || !t) continue
        if (communityToken(link.sourceCommunityId) === corridor.from) {
          ax += s.x; ay += s.y; az += s.z; an++
          bx += t.x; by += t.y; bz += t.z; bn++
        } else {
          ax += t.x; ay += t.y; az += t.z; an++
          bx += s.x; by += s.y; bz += s.z; bn++
        }
      }
      if (an === 0 || bn === 0) return null
      return { a: [ax / an, ay / an, az / an], b: [bx / bn, by / bn, bz / bn] }
    }

    /** Rewrite one strand's tube from the current node positions. */
    const fillStrand = (bundle: Bundle, strand: Strand, strandIndex: number, style: LinkStyle) => {
      const s = nodeById.get(strand.fromId)
      const t = nodeById.get(strand.toId)
      if (!s || !t) return
      // Anchor on the two ensembles the corridor joins, not on one arbitrary
      // member link: a corridor between communities A and B is a TRUNK between
      // them. The centroids are recomputed here, from the corridor's real
      // endpoints, so a position update moves the trunk with its clusters.
      const anchor = corridorCentroids(bundle.corridor)
      const a = anchor?.a ?? toVec3(s)
      const b = anchor?.b ?? toVec3(t)
      const [c1, c2] = bowAnchors(a, b, bundle.bowSeed)
      const samples = bundle.drawable.samples
      const points: Vec3[] = []
      for (let i = 0; i < samples; i++) {
        const u = samples === 1 ? 0 : i / (samples - 1)
        const v = 1 - u
        // Cubic Bézier through the two bowed controls.
        points.push([
          v * v * v * a[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b[0],
          v * v * v * a[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b[1],
          v * v * v * a[2] + 3 * v * v * u * c1[2] + 3 * v * u * u * c2[2] + u * u * u * b[2],
        ])
      }
      const frames = parallelTransportFrames(points)
      // Amplitude < 1 keeps the strands INSIDE the trunk instead of letting
      // them orbit far from the shared centreline.
      const offsets = braidedOffsets(Math.max(1, bundle.strands.length), samples, 1.5, 0.55)[strandIndex % Math.max(1, bundle.strands.length)] ?? []
      // The trunk's thickness follows what it CARRIES — the whole point of the
      // engine. Bounded so a giant bundle never becomes a wall, and the rest of
      // its magnitude stays in the strand count (see linkMorphology).
      // Thickness is a FRACTION OF THE SCENE, not an absolute number of units.
      // Measured at 5 107 nodes: an absolute radius of ~2 units on a graph whose
      // bounding radius is ~400 drew 1-pixel wires — the trunks were visible in
      // the code and invisible on screen.
      const order = bundle.corridor.magnitude.magnitudeOrder
      const radius = sceneRadius * 0.006 * (1 + 0.5 * Math.min(8, order))
      const base = bundle.vertexStart + strandIndex * samples * TUBE_SEGMENTS
      const pos = positionAttr.array as Float32Array
      const col = colorAttr.array as Float32Array
      const alp = alphaAttr.array as Float32Array
      for (let i = 0; i < samples; i++) {
        const f = frames[Math.min(i, frames.length - 1)]
        if (!f) continue
        const off = offsets[i] ?? [0, 0, 0]
        const cx = f.position[0] + f.normal[0] * off[0] * radius + f.binormal[0] * off[1] * radius
        const cy = f.position[1] + f.normal[1] * off[0] * radius + f.binormal[1] * off[1] * radius
        const cz = f.position[2] + f.normal[2] * off[0] * radius + f.binormal[2] * off[1] * radius
        for (let k = 0; k < TUBE_SEGMENTS; k++) {
          const ang = (k / TUBE_SEGMENTS) * Math.PI * 2 + strandIndex * 0.4
          const nx = Math.cos(ang)
          const ny = Math.sin(ang)
          const vi = (base + i * TUBE_SEGMENTS + k) * 3
          pos[vi] = cx + f.normal[0] * nx * radius + f.binormal[0] * ny * radius
          pos[vi + 1] = cy + f.normal[1] * nx * radius + f.binormal[1] * ny * radius
          pos[vi + 2] = cz + f.normal[2] * nx * radius + f.binormal[2] * ny * radius
          // Gradient along the path: source colour at u=0, target at u=1.
          const u = samples === 1 ? 0 : i / (samples - 1)
          // `r2/g2/b2` are the target-end colour; absent means a flat colour.
          col[vi] = style.r + ((style.r2 ?? style.r) - style.r) * u
          col[vi + 1] = style.g + ((style.g2 ?? style.g) - style.g) * u
          col[vi + 2] = style.b + ((style.b2 ?? style.b) - style.b) * u
          // A trunk that summarises hundreds of relations must be SEEN: the
          // resting per-link alpha (0.05–0.28) was tuned for single wires.
          alp[base + i * TUBE_SEGMENTS + k] = Math.min(1, style.a * 2.2)
        }
      }
    }

    /**
     * Rebuild the geometry of every strand (positions, frames, tubes).
     *
     * EXPENSIVE on purpose-isolated: it runs parallel transport per strand, so it
     * is reserved for the two moments where positions actually change — the
     * first paint and a layout update.
     */
    const fillGeometry = (styleOf: (bundle: Bundle, strand: Strand) => LinkStyle) => {
      for (const bundle of bundles) {
        bundle.strands.forEach((strand, i) => fillStrand(bundle, strand, i, styleOf(bundle, strand)))
      }
      positionAttr.needsUpdate = true
      colorAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
    }

    /**
     * Rewrite ONLY the colours, vertex by vertex.
     *
     * It used to call `fillGeometry`, i.e. re-run the parallel transport of every
     * strand on every hover and every style change — the page went unresponsive
     * at a few thousand links, the browser bench stopped answering and looked
     * like a hang. A colour change is a write into one Float32Array; it must cost
     * that, and nothing more.
     */
    const fillColors = (styleOf: (bundle: Bundle, strand: Strand) => LinkStyle) => {
      const col = colorAttr.array as Float32Array
      const alp = alphaAttr.array as Float32Array
      for (const bundle of bundles) {
        const samples = bundle.drawable.samples
        bundle.strands.forEach((strand, strandIndex) => {
          const style = styleOf(bundle, strand)
          const base = bundle.vertexStart + strandIndex * samples * TUBE_SEGMENTS
          for (let i = 0; i < samples; i++) {
            const u = samples === 1 ? 0 : i / (samples - 1)
            for (let k = 0; k < TUBE_SEGMENTS; k++) {
              const vi = (base + i * TUBE_SEGMENTS + k) * 3
              col[vi] = style.r + ((style.r2 ?? style.r) - style.r) * u
              col[vi + 1] = style.g + ((style.g2 ?? style.g) - style.g) * u
              col[vi + 2] = style.b + ((style.b2 ?? style.b) - style.b) * u
              alp[base + i * TUBE_SEGMENTS + k] = Math.min(1, style.a * 2.2)
            }
          }
        })
      }
      colorAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
    }

    // First paint: geometry + neutral colour; the caller's style function
    // replaces the colours at once, for the price of a buffer write.
    fillGeometry((b) => b.color)
    geometry.computeBoundingSphere()

    // Plages de triangles par bundle, dans l'ordre d'écriture de l'index :
    // (samples-1) anneaux × TUBE_SEGMENTS × 2 triangles × brins.
    const ranges = buildRanges(
      bundles.map((b) => b.corridor.key),
      bundles.map((b) => (b.drawable.samples - 1) * TUBE_SEGMENTS * 2 * b.strands.length),
    )

    return {
      object: group,
      bundleAt: (faceIndex: number) => bundleAtTriangle(ranges, faceIndex),
      onBundleClick,
      // Positions moved: the tubes must be rebuilt.
      updatePositions: () => fillGeometry((b) => b.color),
      // Style changed: colours only, never the geometry.
      updateColors: (styleFn: LinkStyleFn) => {
        fillColors((bundle) => styleFn(bundle.corridor.links[0]))
      },
      updateColorsForNodes: (nodeIds: readonly string[], styleFn: LinkStyleFn) => {
        const set = new Set(nodeIds)
        fillColors((bundle) => {
          const link = bundle.corridor.links[0]
          const touches = set.has(endpointId(link.source)) || set.has(endpointId(link.target))
          return touches ? styleFn(link) : bundle.color
        })
      },
      dispose: () => {
        geometry.dispose()
        material.dispose()
        group.clear()
      },
    }
  } catch {
    // Any failure keeps the previous renderer: the graph never disappears.
    return null
  }
}
