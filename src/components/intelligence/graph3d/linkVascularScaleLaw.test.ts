import { describe, it, expect } from 'vitest'
import { createVascularLinks, type ConduitInfo, type VascularLinkRenderer } from './linkVascularRenderer'
import { synthGraph } from './linkVascularFixture'
import { LINK_R1_SHARE } from './linkRadius'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

const SEG = 6
const posOf = (r: VascularLinkRenderer) =>
  (r.object as unknown as { children: { geometry: { attributes: { position: { array: Float32Array } } } }[] })
    .children[0].geometry.attributes.position.array

/** Rayon VISIBLE (couche externe) d'un conduit à l'échantillon i, mesuré sur les tampons. */
function ringRadius(r: VascularLinkRenderer, c: ConduitInfo, i: number): number {
  const pos = posOf(r)
  const base = c.vertexStart + i * SEG
  let cx = 0, cy = 0, cz = 0
  for (let k = 0; k < SEG; k++) { cx += pos[(base + k) * 3]; cy += pos[(base + k) * 3 + 1]; cz += pos[(base + k) * 3 + 2] }
  cx /= SEG; cy /= SEG; cz /= SEG
  return Math.hypot(pos[base * 3] - cx, pos[base * 3 + 1] - cy, pos[base * 3 + 2] - cz)
}

/** d0 brut (O(n²)) : distance médiane au plus proche voisin. */
function bruteD0(nodes: { x: number; y: number; z: number }[]): number {
  const ds: number[] = []
  for (let i = 0; i < nodes.length; i++) {
    let best = Infinity
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y, nodes[i].z - nodes[j].z)
      if (d > 0 && d < best) best = d
    }
    ds.push(best)
  }
  ds.sort((a, b) => a - b)
  return ds[ds.length >> 1]
}

/** Rayon moyen d'un groupe : écart moyen de ses nœuds à leur centre. */
function groupRadius(nodes: { x: number; y: number; z: number; communityId: number }[], community: number): number {
  const m = nodes.filter((n) => n.communityId === community)
  const c = [0, 0, 0]
  for (const n of m) { c[0] += n.x / m.length; c[1] += n.y / m.length; c[2] += n.z / m.length }
  return m.reduce((s, n) => s + Math.hypot(n.x - c[0], n.y - c[1], n.z - c[2]), 0) / m.length
}

const cube = (x: number) => x * x * x

/**
 * LOI D'ÉCHELLE (retour client du 03/11 : « tout est trop gros ; la connexion
 * de 1 doit être très fine, plusieurs doivent remonter »).
 *
 * r(n) = 0,03 · d0 · n^(1/3), d0 = distance médiane au plus proche voisin ;
 * Murray exact aux jonctions ; plafond de cohérence par faisceau.
 */
describe('loi d’échelle des conduits vasculaires', () => {
  const { nodes, links } = synthGraph(1200, [0, 0, 0], 0.15)
  const r = createVascularLinks(nodes, links)!
  const info = r.inspect!()
  const d0 = bruteD0(nodes as never)

  it('l’unité est d0, la distance médiane au plus proche voisin', () => {
    expect(r.unit!()).toBeCloseTo(d0, 6)
  })

  it('un capillaire d’UNE relation mesure 0,03 · d0 (mesuré sur la géométrie)', () => {
    const ones = info.filter((c) => c.kind === 'capillary' && c.n === 1n)
    expect(ones.length).toBeGreaterThan(0)
    for (const c of ones) {
      expect(ringRadius(r, c, 2) / d0).toBeCloseTo(LINK_R1_SHARE, 3)
    }
  })

  it('aucun conduit ne dépasse 15 % du rayon du plus petit groupe touché (mesuré)', () => {
    const smallest = Math.min(...[0, 1, 2, 3, 4, 5].map((g) => groupRadius(nodes as never, g)))
    for (const c of info) {
      for (let i = 0; i < c.samples; i++) expect(ringRadius(r, c, i)).toBeLessThanOrEqual(0.15 * smallest * 1.0001)
      expect(c.radius).toBeLessThanOrEqual(c.rMax)
    }
  })

  it('Murray exact (< 1 %) au port : Σ r³ des voies = Σ r³ des artères de chaque côté', () => {
    const keys = new Set(info.map((c) => c.key))
    let checked = 0
    for (const key of keys) {
      const lanes = info.filter((c) => c.key === key && c.kind === 'trunk')
      if (lanes.length === 0) continue
      const parent = lanes.reduce((s, c) => s + cube(c.endRadius), 0)
      for (const side of ['a', 'b'] as const) {
        const arteries = info.filter((c) => c.key === key && c.kind === 'artery' && c.side === side)
        const children = arteries.reduce((s, c) => s + cube(c.radius), 0)
        expect(Math.abs(children - parent) / parent).toBeLessThan(0.01)
        // La capsule du port a le rayon du tronc entier.
        const cap = info.find((c) => c.key === key && c.kind === 'junction' && c.side === side && c.fromId === arteries[0].fromId)!
        expect(Math.abs(cube(cap.radius) - parent) / parent).toBeLessThan(0.01)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('Murray exact (< 1 %) à chaque sous-moyeu : r³ de l’artère à l’arrivée = Σ r³ de ses capillaires', () => {
    let checked = 0
    for (const a of info.filter((c) => c.kind === 'artery')) {
      const caps = info.filter((c) => c.parent === a.id && c.kind === 'capillary')
      if (caps.length === 0) continue
      const children = caps.reduce((s, c) => s + cube(c.radius), 0)
      expect(Math.abs(children - cube(a.endRadius)) / cube(a.endRadius)).toBeLessThan(0.01)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('continuité à la jonction : chaque enfant DÉMARRE au rayon calculé (géométrie, < 1 %)', () => {
    for (const c of info) {
      if (c.kind === 'junction') continue
      expect(Math.abs(ringRadius(r, c, 0) - c.radius) / c.radius).toBeLessThan(0.01)
      expect(Math.abs(ringRadius(r, c, c.samples - 1) - c.endRadius) / c.endRadius).toBeLessThan(0.01)
    }
  })

  it('invariance d’échelle : positions × 10 → tous les rayons × 10', () => {
    const scaled = synthGraph(1200, [0, 0, 0], 0.15)
    for (const n of scaled.nodes as { x: number; y: number; z: number }[]) { n.x *= 10; n.y *= 10; n.z *= 10 }
    const r10 = createVascularLinks(scaled.nodes, scaled.links)!
    const info10 = r10.inspect!()
    expect(info10.length).toBe(info.length)
    for (let i = 0; i < info.length; i++) {
      expect(info10[i].radius / info[i].radius).toBeCloseTo(10, 6)
    }
    // Et en direct, par updatePositions.
    const live = synthGraph(1200, [0, 0, 0], 0.15)
    const rl = createVascularLinks(live.nodes, live.links)!
    for (const n of live.nodes as { x: number; y: number; z: number }[]) { n.x *= 10; n.y *= 10; n.z *= 10 }
    rl.updatePositions()
    expect(rl.unit!() / d0).toBeCloseTo(10, 6)
    const infoL = rl.inspect!()
    for (let i = 0; i < info.length; i++) expect(infoL[i].radius / info[i].radius).toBeCloseTo(10, 6)
  })
})

describe('plafond de cohérence', () => {
  const node = (id: string, x: number, communityId: number) =>
    ({ id, label: '', entityType: 'file', layer: 'code', x, y: (communityId % 2) * 7, z: 0, communityId, data: {} }) as unknown as Graph3DNode
  // Une chaîne de groupes de deux nœuds ; chaque liaison porte 10^k relations.
  const SCALES = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e9]
  const nodes = SCALES.flatMap((_, i) => [node(`g${i}a`, i * 120, i), node(`g${i}b`, i * 120 + 30, i)])
  const links = SCALES.slice(0, -1).map((count, i) => ({
    source: `g${i}a`, target: `g${i + 1}b`, relationType: 'IMPORTS', layer: 'code',
    sourceCommunityId: i, targetCommunityId: i + 1, count,
    color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: true,
  })) as unknown as Graph3DLink[]
  const r = createVascularLinks(nodes, links)!
  const trunks = r.inspect!().filter((c) => c.kind === 'trunk').sort((a, b) => (a.n < b.n ? -1 : 1))

  it('le plafond est respecté, et la compression reste STRICTEMENT croissante (10⁶ > 10⁵)', () => {
    expect(trunks.length).toBe(SCALES.length - 1)
    for (const c of trunks) expect(c.radius).toBeLessThanOrEqual(c.rMax)
    for (let i = 1; i < trunks.length; i++) expect(trunks[i].radius).toBeGreaterThan(trunks[i - 1].radius)
  })
})
