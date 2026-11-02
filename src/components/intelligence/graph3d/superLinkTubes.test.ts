import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createSuperLinkTubes,
  tubeRadiusFor,
  TUBE_RADIUS_MIN,
  TUBE_RADIUS_MAX,
  TUBE_MAX_EDGES,
} from './superLinkTubes'
import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

const node = (id: string, x: number, y: number, z: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x, y, z, data: {},
})
const link = (source: string, target: string, count: number): Graph3DLink => ({
  source, target, relationType: 'AGGREGATE', layer: 'fabric', count,
  color: 'rgba(148, 163, 184, 0.4)', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: true,
})

describe('tubeRadiusFor', () => {
  it('maps the weakest bundle to TUBE_RADIUS_MIN', () => {
    expect(tubeRadiusFor(1, 1, 100)).toBeCloseTo(TUBE_RADIUS_MIN)
  })
  it('maps the strongest bundle to TUBE_RADIUS_MAX', () => {
    expect(tubeRadiusFor(100, 1, 100)).toBeCloseTo(TUBE_RADIUS_MAX)
  })
  it('is monotonic in count (√count normalisation)', () => {
    expect(tubeRadiusFor(50, 1, 100)).toBeGreaterThan(tubeRadiusFor(10, 1, 100))
    expect(tubeRadiusFor(10, 1, 100)).toBeGreaterThan(tubeRadiusFor(2, 1, 100))
  })
  it('clamps counts outside the observed range', () => {
    expect(tubeRadiusFor(1000, 1, 100)).toBeCloseTo(TUBE_RADIUS_MAX)
    expect(tubeRadiusFor(0, 1, 100)).toBeCloseTo(TUBE_RADIUS_MIN)
  })
  it('returns the mid radius when the range is degenerate', () => {
    expect(tubeRadiusFor(5, 5, 5)).toBeCloseTo((TUBE_RADIUS_MIN + TUBE_RADIUS_MAX) / 2)
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

  it('builds one tube per link with radius following √count', () => {
    const nodes = [node('a', 0, 0, 0), node('b', 1, 0, 0), node('c', 2, 0, 0)]
    const links = [link('a', 'b', 1), link('b', 'c', 100)]
    const tubes = createSuperLinkTubes(nodes, links)
    expect(tubes).not.toBeNull()
    expect(tubes!.count).toBe(2)
    const meshes = tubes!.group.children as THREE.Mesh[]
    const radii = meshes.map((m) => (m.geometry as THREE.CylinderGeometry).parameters.radiusTop)
    expect(radii[0]).toBeCloseTo(TUBE_RADIUS_MIN)
    expect(radii[1]).toBeCloseTo(TUBE_RADIUS_MAX)
    tubes!.dispose()
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
