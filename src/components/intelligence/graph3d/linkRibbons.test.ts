import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createLinkRibbons } from './linkRibbons'
import { createLinkRenderer } from './linkSegments'
import { RIBBON_SUBDIVISIONS, RIBBON_BUNDLE_MAX_LINKS } from './linkRibbon'
import { linkVolume, pathPointAndTangent } from './linkCurve'
import { ARROW_ANCHOR } from './linkArrows'
import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

const node = (id: string, x: number, y = 0, z = 0, communityId?: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x, y, z, communityId, data: {},
})

const mk = (source: string, target: string, sourceCommunityId?: number, targetCommunityId?: number): Graph3DLink => ({
  source, target, relationType: 'IMPORTS', layer: 'fabric',
  color: 'rgba(148,163,184,0.35)', width: 1, particles: 0, particleSpeed: 0,
  isInterCommunity: false, sourceCommunityId, targetCommunityId,
})

function ribbonMesh(object: THREE.Object3D): THREE.Mesh {
  const group = object as THREE.Group
  const mesh = group.children.find((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
  if (!mesh) throw new Error('no ribbon mesh found')
  return mesh
}

describe('createLinkRibbons', () => {
  it('builds one strip of N × subdivisions × 2 vertices for N links (detail)', () => {
    const nodes = [node('a', 0, 0, 0), node('b', 10, 0, 0)]
    const links = [mk('a', 'b'), mk('b', 'a')]
    const ribbons = createLinkRibbons(nodes, links)
    expect(ribbons).not.toBeNull()
    const pos = ribbonMesh(ribbons!.object).geometry.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(links.length * RIBBON_SUBDIVISIONS * 2)
    ribbons!.dispose()
  })

  it('aggregates > BUNDLE_MAX_LINKS into one ribbon per community pair (sheet)', () => {
    const nodes = [node('a', 0, 0, 0, 1), node('b', 10, 0, 0, 2), node('c', 0, 10, 0, 3)]
    const links: Graph3DLink[] = []
    // Many links across two pairs: {1,2} and {2,3}.
    for (let i = 0; i < RIBBON_BUNDLE_MAX_LINKS + 10; i++) {
      links.push(mk('a', 'b', 1, 2))
      links.push(mk('b', 'c', 2, 3))
    }
    const ribbons = createLinkRibbons(nodes, links)
    expect(ribbons).not.toBeNull()
    const pos = ribbonMesh(ribbons!.object).geometry.getAttribute('position') as THREE.BufferAttribute
    // Two community pairs → two ribbons.
    expect(pos.count).toBe(2 * RIBBON_SUBDIVISIONS * 2)
    ribbons!.dispose()
  })

  it('returns null (fallback) when a node position is not finite', () => {
    const nodes = [node('a', NaN, 0, 0), node('b', 10, 0, 0)]
    const links = [mk('a', 'b')]
    expect(createLinkRibbons(nodes, links)).toBeNull()
  })

  it('returns null for an empty link set', () => {
    expect(createLinkRibbons([node('a', 0)], [])).toBeNull()
  })

  it('keeps the arrow head at 75% of the ribbon path (directional link)', () => {
    const nodes = [node('a', 1, 2, 3), node('b', 10, 20, 30)]
    const links = [mk('a', 'b')] // IMPORTS → directional
    const ribbons = createLinkRibbons(nodes, links)!
    const group = ribbons.object as THREE.Group
    const arrow = group.children.find((c) => (c as THREE.LineSegments).isLineSegments) as THREE.LineSegments | undefined
    expect(arrow).toBeDefined()
    const pos = arrow!.geometry.getAttribute('position').array as Float32Array
    // The apex (vertices 0 and 2) must sit at ARROW_ANCHOR along the curved path.
    const expected = pathPointAndTangent(
      [1, 2, 3], [10, 20, 30], linkVolume(links[0]), 'a', 'b', ARROW_ANCHOR, true,
    ).point
    expect(pos[0]).toBeCloseTo(expected[0], 3)
    expect(pos[1]).toBeCloseTo(expected[1], 3)
    expect(pos[2]).toBeCloseTo(expected[2], 3)
    ribbons.dispose()
  })
})

describe('createLinkRenderer', () => {
  it('falls back to LineSegments when ribbons cannot be built', () => {
    const nodes = [node('a', NaN, 0, 0), node('b', 10, 0, 0)]
    const links = [mk('a', 'b')]
    const renderer = createLinkRenderer(nodes, links)
    expect(renderer.object).toBeInstanceOf(THREE.LineSegments)
    renderer.dispose()
  })

  it('uses ribbons (a Group) for valid data', () => {
    const nodes = [node('a', 0, 0, 0), node('b', 10, 0, 0)]
    const links = [mk('a', 'b')]
    const renderer = createLinkRenderer(nodes, links)
    expect(renderer.object).toBeInstanceOf(THREE.Group)
    renderer.dispose()
  })

  it('exposes the same recolor surface as the fallback (updateColors + updateColorsForNodes)', () => {
    const nodes = [node('a', 0, 0, 0), node('b', 10, 0, 0), node('c', 0, 10, 0)]
    const links = [mk('a', 'b'), mk('b', 'c')]
    const renderer = createLinkRenderer(nodes, links)
    renderer.updateColors(() => ({ r: 1, g: 0, b: 0, a: 0.5 }))
    let calls = 0
    renderer.updateColorsForNodes(['a'], () => { calls++; return { r: 0, g: 1, b: 0, a: 1 } })
    expect(calls).toBe(1) // only link a-b touches 'a'
    renderer.dispose()
  })
})
