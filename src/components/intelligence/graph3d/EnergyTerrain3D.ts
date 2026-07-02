// ============================================================================
// EnergyTerrain3D — translucent cognitive-density membrane above the tissue
// ============================================================================
//
// A continuous surface floating above the fabric arcs whose local altitude and
// glow = aggregated note/skill energy (IDW-style Gaussian max-blend). Hot
// zones form luminous aurora domes (cyan→violet); dead zones (stale notes,
// low energy) stay near-black — invisible under additive blending.
//
// Plane lies in XY (the graph's horizontal spread); elevation is +Z — the same
// "up" axis as layer stacking and the tissue arcs.
//
// Rebuilds are guarded by a signature (energy sources + quantized positions +
// altitude bucket) so engine stops that changed nothing skip the O(GRID²×S)
// field evaluation.
// ============================================================================

import * as THREE from 'three'
import type { Graph3DNode } from './useGraph3DLayout'

// ── Tunables ─────────────────────────────────────────────────────────────────

const GRID = 48            // vertices per side (48×48 = 2304 verts, trivial GPU load)
const BASE_Z = 45          // resting altitude of the membrane (between code:0 and knowledge:80)
const BUMP_Z = 32          // extra elevation at full energy
const SIGMA = 55           // Gaussian falloff radius (world units) of a source's influence
const PADDING = 50         // XY padding around the node bounding box

/** Entity types that radiate cognitive energy into the membrane */
const ENERGY_TYPES = new Set(['note', 'skill', 'decision'])

// Aurora palette
const COLOR_LOW = new THREE.Color(0.01, 0.02, 0.05)   // near-black (invisible additive)
const COLOR_MID = new THREE.Color('#22D3EE')          // cyan
const COLOR_HIGH = new THREE.Color('#A78BFA')         // violet

// ── Energy sources ───────────────────────────────────────────────────────────

interface EnergySource {
  x: number
  y: number
  energy: number
}

function collectSources(nodes: Graph3DNode[]): { sources: EnergySource[]; sigParts: string[] } {
  const sources: EnergySource[] = []
  const sigParts: string[] = []
  for (const n of nodes) {
    if (!ENERGY_TYPES.has(n.entityType)) continue
    const energy = (n.data.energy as number) ?? 0
    if (energy <= 0.05) continue
    if (!isFinite(n.x) || !isFinite(n.y)) continue
    sources.push({ x: n.x, y: n.y, energy: Math.min(1, energy) })
    sigParts.push(`${n.id}:${Math.round(energy * 10)}:${Math.round(n.x / 4)}:${Math.round(n.y / 4)}`)
  }
  return { sources, sigParts }
}

/** Signature for skip-rebuild guard (order-independent-ish: sorted parts) */
export function computeTerrainSignature(nodes: Graph3DNode[], altitude: number): string {
  const { sigParts } = collectSources(nodes)
  let hash = 5381
  for (const part of sigParts.sort()) {
    for (let i = 0; i < part.length; i++) {
      hash = ((hash << 5) + hash + part.charCodeAt(i)) | 0
    }
  }
  return `${sigParts.length}:${hash}:${Math.round(altitude * 20)}`
}

// ── Build ────────────────────────────────────────────────────────────────────

export function buildEnergyTerrain(nodes: Graph3DNode[], altitude: number): THREE.Mesh | null {
  if (altitude <= 0) return null
  const { sources } = collectSources(nodes)
  if (sources.length < 3) return null

  // XY bounds over ALL nodes (the membrane covers the whole graph footprint)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (!isFinite(n.x) || !isFinite(n.y)) continue
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }
  if (!isFinite(minX) || maxX - minX < 1 || maxY - minY < 1) return null

  minX -= PADDING; maxX += PADDING; minY -= PADDING; maxY += PADDING
  const width = maxX - minX
  const height = maxY - minY

  const geo = new THREE.PlaneGeometry(width, height, GRID - 1, GRID - 1)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)

  const invTwoSigmaSq = 1 / (2 * SIGMA * SIGMA)
  const tmp = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry is centered at origin in XY — translate into world bounds
    const wx = pos.getX(i) + (minX + maxX) / 2
    const wy = pos.getY(i) + (minY + maxY) / 2

    // Gaussian max-blend: domes over hot sources, hollows elsewhere
    let intensity = 0
    for (const s of sources) {
      const dx = wx - s.x
      const dy = wy - s.y
      const v = s.energy * Math.exp(-(dx * dx + dy * dy) * invTwoSigmaSq)
      if (v > intensity) intensity = v
    }

    // Elevation: membrane floats at BASE_Z, domes rise with local energy
    pos.setZ(i, (BASE_Z + intensity * BUMP_Z) * altitude)

    // Aurora color ramp: near-black → cyan → violet
    if (intensity < 0.5) {
      tmp.copy(COLOR_LOW).lerp(COLOR_MID, intensity / 0.5)
    } else {
      tmp.copy(COLOR_MID).lerp(COLOR_HIGH, (intensity - 0.5) / 0.5)
    }
    // Scale color by intensity so hollows vanish under additive blending
    const s = 0.15 + intensity * 0.85
    colors[i * 3] = tmp.r * s
    colors[i * 3 + 1] = tmp.g * s
    colors[i * 3 + 2] = tmp.b * s
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.10 + altitude * 0.08,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'energyTerrain'
  mesh.renderOrder = 2 // above edges/arcs, below sprites (sprites ignore renderOrder mostly)
  return mesh
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export function disposeEnergyTerrain(mesh: THREE.Mesh | null): void {
  if (!mesh) return
  mesh.geometry.dispose()
  if (mesh.material instanceof THREE.Material) mesh.material.dispose()
}
