import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createVascularLinks, type ConduitInfo, type VascularLinkRenderer } from './linkVascularRenderer'
import { synthGraph } from './linkVascularFixture'

const SEG = 6
type Attrs = Record<string, { array: Float32Array }>
const attrs = (r: VascularLinkRenderer) =>
  (r.object as unknown as { children: { geometry: { attributes: Attrs } }[] }).children[0].geometry.attributes

/** Centre de l'anneau du CŒUR (dernière couche) à l'échantillon i. */
function coreCenter(r: VascularLinkRenderer, c: ConduitInfo, i: number): [number, number, number] {
  const pos = attrs(r).position.array
  const base = c.vertexStart + (c.layers - 1) * c.samples * SEG + i * SEG
  const out: [number, number, number] = [0, 0, 0]
  for (let k = 0; k < SEG; k++) for (let d = 0; d < 3; d++) out[d] += pos[(base + k) * 3 + d] / SEG
  return out
}

describe('tresse des voies', () => {
  it('toutes les voies d’un tronc convergent EXACTEMENT sur les deux ports, et se séparent au milieu', () => {
    const { nodes, links } = synthGraph(3001)
    const r = createVascularLinks(nodes, links)!
    const info = r.inspect!()
    const keys = new Set(info.filter((c) => c.kind === 'trunk').map((c) => c.key))
    let multi = 0
    for (const key of keys) {
      const lanes = info.filter((c) => c.key === key && c.kind === 'trunk')
      for (const lane of lanes) {
        const s = coreCenter(r, lane, 0)
        const e = coreCenter(r, lane, lane.samples - 1)
        for (let d = 0; d < 3; d++) {
          expect(s[d]).toBeCloseTo(lane.from[d], 3)
          expect(e[d]).toBeCloseTo(lane.to[d], 3)
        }
      }
      if (lanes.length > 1) {
        multi++
        const m = Math.floor(lanes[0].samples / 2)
        const c0 = coreCenter(r, lanes[0], m)
        const c1 = coreCenter(r, lanes[1], m)
        // Chaque voie suit SON brin : deux voies ne se superposent pas.
        expect(Math.hypot(c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2])).toBeGreaterThan(lanes[0].radius * 0.2)
      }
    }
    expect(multi).toBeGreaterThan(0)
  })
})

describe('interaction', () => {
  const { nodes, links } = synthGraph(1200, [0, 0, 0], 0.15)
  const r = createVascularLinks(nodes, links)!
  const info = r.inspect!()
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
  camera.position.set(700, 0, 4000)
  camera.lookAt(700, 0, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()

  it('un capillaire fin se pique en distance écran, et le n exact est exposé', () => {
    const cap = info.find((c) => c.kind === 'capillary')!
    // Point au milieu de l'axe, décalé de 3 px : un rayon de 0,03·d0 ne fait
    // pas un pixel, le lancer de rayon le raterait.
    const mid = new THREE.Vector3(...([0, 1, 2].map((d) => (cap.from[d] + cap.to[d]) / 2) as [number, number, number]))
    const axis = attrs(r).aAxis.array
    // Le vrai milieu de l'axe dessiné (la courbe est cintrée).
    const i = Math.floor(cap.samples / 2)
    const v = cap.vertexStart + (cap.layers - 1) * cap.samples * SEG + i * SEG
    mid.set(axis[v * 3], axis[v * 3 + 1], axis[v * 3 + 2]).project(camera)
    const H = 900
    const pick = r.pickAt!(mid.x + 3 / (H / 2), mid.y, camera, H)
    expect(pick).not.toBeNull()
    expect(pick!.distancePx).toBeLessThan(6)
    const picked = info[pick!.id]
    expect(typeof picked.n).toBe('bigint')
    expect(r.pickAt!(mid.x + 400 / (H / 2), mid.y + 400 / (H / 2), camera, H)?.id ?? -1).not.toBe(cap.id)
  })

  it('survoler un capillaire allume son chemin jusqu’au tronc ; survoler le tronc allume tout son arbre', () => {
    const cap = info.find((c) => c.kind === 'capillary')!
    const path = new Set(r.pathOf!(cap.id))
    const artery = info[cap.parent]
    expect(artery.kind).toBe('artery')
    expect(path.has(artery.id)).toBe(true)
    for (const lane of info.filter((c) => c.key === cap.key && c.kind === 'trunk')) expect(path.has(lane.id)).toBe(true)
    // Pas les capillaires frères, ni l'autre côté.
    for (const c of info.filter((c) => c.key === cap.key && c.kind === 'capillary' && c.id !== cap.id)) expect(path.has(c.id)).toBe(false)
    const lane = info.find((c) => c.key === cap.key && c.kind === 'trunk')!
    expect(new Set(r.pathOf!(lane.id)).size).toBe(info.filter((c) => c.key === cap.key).length)
  })

  it('highlightConduit renforce le chemin, et seulement lui ; null l’éteint', () => {
    const alp = () => Float32Array.from(attrs(r).aAlpha.array)
    const before = alp()
    const cap = info.find((c) => c.kind === 'capillary')!
    const path = new Set(r.pathOf!(cap.id))
    r.highlightConduit!(cap.id)
    const lit = alp()
    for (const c of info) {
      const v = c.vertexStart
      if (path.has(c.id)) expect(lit[v]).toBeGreaterThan(before[v])
      else expect(lit[v]).toBe(before[v])
    }
    r.highlightConduit!(null)
    const off = alp()
    expect(off.every((x, k) => x === before[k])).toBe(true)
  })

  it('l’axe de chaque anneau du cœur est exposé au shader (plancher de rayon écran)', () => {
    const c = info.find((x) => x.kind === 'capillary')!
    const axis = attrs(r).aAxis.array
    const center = coreCenter(r, c, 2)
    const v = c.vertexStart + (c.layers - 1) * c.samples * SEG + 2 * SEG
    for (let d = 0; d < 3; d++) expect(axis[v * 3 + d]).toBeCloseTo(center[d], 3)
  })
})
