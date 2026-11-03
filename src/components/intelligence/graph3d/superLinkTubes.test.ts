import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createSuperLinkTubes,
  tubeRadiusFor,
  TUBE_LENGTH_SHARE,
  TUBE_MAX_EDGES,
} from './superLinkTubes'
import { linkRadiusFor } from './linkRadius'
import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

const node = (id: string, x: number, y: number, z: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x, y, z, data: {},
})
const link = (source: string, target: string, count: number): Graph3DLink => ({
  source, target, relationType: 'AGGREGATE', layer: 'fabric', count,
  color: 'rgba(148, 163, 184, 0.4)', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: true,
})

describe('tubeRadiusFor — même loi que les liens vasculaires', () => {
  it('suit linkRadiusFor : un lien = 0,03 · d0, croissant en n^(1/3)', () => {
    expect(tubeRadiusFor(1, 40)).toBeCloseTo(linkRadiusFor(1, 40), 12)
    expect(tubeRadiusFor(1, 40)).toBeCloseTo(1.2, 12)
    expect(tubeRadiusFor(1000, 40)).toBeCloseTo(12, 9)
    expect(tubeRadiusFor(50, 1)).toBeGreaterThan(tubeRadiusFor(10, 1))
  })
  it('est relatif : d0 × 10 → rayon × 10 (aucune constante monde)', () => {
    expect(tubeRadiusFor(37, 120) / tubeRadiusFor(37, 12)).toBeCloseTo(10, 9)
  })
  it('plafond doux à 6 % de la longueur, strictement croissant', () => {
    const len = 100
    expect(tubeRadiusFor(1e9, 10, len)).toBeLessThan(TUBE_LENGTH_SHARE * len)
    expect(tubeRadiusFor(1e9, 10, len)).toBeGreaterThan(tubeRadiusFor(1e8, 10, len))
  })
})

describe('createSuperLinkTubes', () => {
  it('returns null when there are no links', () => {
    expect(createSuperLinkTubes([node('a', 0, 0, 0)], [])).toBeNull()
  })

  it('returns null above TUBE_MAX_EDGES (caller falls back to segments)', () => {
    const links = Array.from({ length: TUBE_MAX_EDGES + 1 }, () => link('a', 'b', 1))
    const nodes = [node('a', 0, 0, 0), node('b', 1, 0, 0)]
    expect(createSuperLinkTubes(nodes, links)).toBeNull()
  })

  it('builds one tube per link, radius from the shared law on the node spacing', () => {
    const nodes = [node('a', 0, 0, 0), node('b', 100, 0, 0), node('c', 200, 0, 0)]
    const links = [link('a', 'b', 1), link('b', 'c', 8)]
    const tubes = createSuperLinkTubes(nodes, links)
    expect(tubes).not.toBeNull()
    expect(tubes!.count).toBe(2)
    const meshes = tubes!.group.children as THREE.Mesh[]
    // d0 = 100 (median nearest-neighbour spacing).
    expect(meshes[0].scale.x).toBeCloseTo(3, 9) // 0,03 · 100 · 1
    // 0,03 · 100 · 8^(1/3) = 6, au-dessus du genou du plafond (3 = 6 % de 100 / 2).
    expect(meshes[1].scale.x).toBeCloseTo(tubeRadiusFor(8, 100, 100), 9)
    expect(meshes[1].scale.x).toBeGreaterThan(meshes[0].scale.x)
    expect(meshes[1].scale.x).toBeLessThan(6)
    tubes!.dispose()
  })

  it('a tube without both endpoints, or with coincident ones, stays hidden (no phantom at the origin)', () => {
    const nodes = [node('a', 5, 5, 5), node('b', 5, 5, 5), node('c', 50, 0, 0)]
    const tubes = createSuperLinkTubes(nodes, [link('a', 'b', 3), link('a', 'zz', 3), link('a', 'c', 3)])!
    const meshes = tubes.group.children as THREE.Mesh[]
    expect(meshes.map((m) => m.visible)).toEqual([false, false, true])
    tubes.dispose()
  })

  it('follows a zoom of the layout: positions × 10 → radii × 10', () => {
    const nodes = [node('a', 0, 0, 0), node('b', 100, 0, 0), node('c', 200, 0, 0)]
    const tubes = createSuperLinkTubes(nodes, [link('a', 'b', 4)])!
    const r0 = (tubes.group.children[0] as THREE.Mesh).scale.x
    for (const n of nodes) n.x *= 10
    tubes.updatePositions()
    expect((tubes.group.children[0] as THREE.Mesh).scale.x / r0).toBeCloseTo(10, 6)
    tubes.dispose()
  })

  it('orients a tube between its endpoints', () => {
    const nodes = [node('a', 0, 0, 0), node('b', 0, 4, 0)]
    const tubes = createSuperLinkTubes(nodes, [link('a', 'b', 5)])
    expect(tubes).not.toBeNull()
    const mesh = tubes!.group.children[0] as THREE.Mesh
    // A cylinder of unit height scaled to length 4 along Y (then rotated) —
    // the scale along its own axis equals the endpoint distance.
    expect(mesh.scale.y).toBeCloseTo(4)
    tubes!.dispose()
  })
})
