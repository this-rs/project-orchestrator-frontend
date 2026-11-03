import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createLinkSegments, parseColor } from './linkSegments'
import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'
import { ARROW_VERTICES } from './linkArrows'
import { CURVE_MAX_LINKS, CURVE_SUBDIVISIONS, linkVolume, pathPointAndTangent } from './linkCurve'

/** Vertices in a curved link's stroke: CURVE_SUBDIVISIONS points, (CURVE_SUBDIVISIONS-1) disjoint segments. */
const CURVED_STROKE_VERTS = (CURVE_SUBDIVISIONS - 1) * 2
/** Vertices in a plain straight link's stroke (over the curvature budget, or as before this feature). */
const STRAIGHT_STROKE_VERTS = 2

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#34D399')).toEqual({ r: 0x34 / 255, g: 0xd3 / 255, b: 0x99 / 255, a: 1 })
  })

  it('parses 3-digit hex', () => {
    expect(parseColor('#abc')).toEqual({ r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255, a: 1 })
  })

  it('parses rgba with alpha', () => {
    const p = parseColor('rgba(148, 163, 184, 0.35)')
    expect(p.r).toBeCloseTo(148 / 255, 5)
    expect(p.g).toBeCloseTo(163 / 255, 5)
    expect(p.b).toBeCloseTo(184 / 255, 5)
    expect(p.a).toBeCloseTo(0.35, 5)
  })

  it('parses rgb without alpha as opaque', () => {
    const p = parseColor('rgb(107, 114, 128)')
    expect(p.a).toBe(1)
    expect(p.r).toBeCloseTo(107 / 255, 5)
  })

  it('falls back to neutral gray on unknown input', () => {
    expect(parseColor('transparent')).toEqual({ r: 0.42, g: 0.45, b: 0.5, a: 0.35 })
  })
})

describe('createLinkSegments', () => {
  const makeFixture = () => {
    const nodes: Graph3DNode[] = [
      { id: 'a', label: 'A', entityType: 'file', layer: 'code', x: 1, y: 2, z: 3, data: {} },
      { id: 'b', label: 'B', entityType: 'file', layer: 'code', x: 10, y: 20, z: 30, data: {} },
    ]
    const links: Graph3DLink[] = [
      { source: 'a', target: 'b', relationType: 'IMPORTS', layer: 'fabric', color: 'rgba(148,163,184,0.35)', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false },
    ]
    return { nodes, links }
  }

  it('builds a curved stroke (CURVE_SUBDIVISIONS points) per link, +4 for the head of a directional link', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    const pos = seg.object.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(CURVED_STROKE_VERTS + ARROW_VERTICES)
    seg.dispose()
  })

  it('adds no head for a tissue link', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, [{ ...links[0], relationType: 'CO_CHANGED' }])
    expect((seg.object.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(CURVED_STROKE_VERTS)
    seg.dispose()
  })

  it('falls back to a plain straight stroke (2 vertices) once the link count passes CURVE_MAX_LINKS', () => {
    const nodes: Graph3DNode[] = [
      { id: 'a', label: 'A', entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, data: {} },
      { id: 'b', label: 'B', entityType: 'file', layer: 'code', x: 10, y: 0, z: 0, data: {} },
    ]
    const mk = (): Graph3DLink => ({
      source: 'a', target: 'b', relationType: 'CO_CHANGED', layer: 'fabric',
      color: 'rgba(148,163,184,0.35)', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
    })
    const links = Array.from({ length: CURVE_MAX_LINKS + 1 }, mk)
    const seg = createLinkSegments(nodes, links)
    const pos = seg.object.geometry.getAttribute('position') as THREE.BufferAttribute
    // No directional heads (CO_CHANGED is a tissue relation): pure strokes.
    expect(pos.count).toBe(links.length * STRAIGHT_STROKE_VERTS)
    seg.dispose()
  })

  it('moves the head with the nodes, keeps it at 75% of the curved path, and colours it like its stroke', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    seg.updateColors(() => ({ r: 1, g: 0.5, b: 0.25, a: 0.8 }))
    nodes[1].x = 110
    seg.updatePositions()
    const pos = seg.object.geometry.getAttribute('position').array as Float32Array
    const headBase = CURVED_STROKE_VERTS * 3 // first float of the head's apex vertex
    const volume = linkVolume(links[0])
    const expected = pathPointAndTangent(
      [nodes[0].x, nodes[0].y, nodes[0].z], [nodes[1].x, nodes[1].y, nodes[1].z],
      volume, 'a', 'b', 0.75, true,
    ).point
    expect(pos[headBase]).toBeCloseTo(expected[0], 3)
    expect(pos[headBase + 1]).toBeCloseTo(expected[1], 3)
    expect(pos[headBase + 2]).toBeCloseTo(expected[2], 3)
    const alp = seg.object.geometry.getAttribute('aAlpha').array as Float32Array
    const headVertexIndex = CURVED_STROKE_VERTS
    expect(alp[headVertexIndex]).toBeCloseTo(0.8, 5)
    expect(alp[headVertexIndex + ARROW_VERTICES - 1]).toBeCloseTo(0.8, 5)
    seg.dispose()
  })

  it('writes node positions into the buffer: stroke starts exactly at source, ends exactly at target', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    const pos = seg.object.geometry.getAttribute('position').array as Float32Array
    expect([pos[0], pos[1], pos[2]]).toEqual([1, 2, 3])
    const lastVertex = CURVED_STROKE_VERTS - 1
    expect([pos[lastVertex * 3], pos[lastVertex * 3 + 1], pos[lastVertex * 3 + 2]]).toEqual([10, 20, 30])
    seg.dispose()
  })

  it('re-reads positions after nodes move', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    nodes[1].x = 99
    seg.updatePositions()
    const pos = seg.object.geometry.getAttribute('position').array as Float32Array
    const lastVertex = CURVED_STROKE_VERTS - 1
    expect(pos[lastVertex * 3]).toBeCloseTo(99, 5)
    seg.dispose()
  })

  it('writes per-vertex color and alpha from the style fn', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    seg.updateColors(() => ({ r: 0.5, g: 0.25, b: 0.125, a: 0.7 }))
    const col = seg.object.geometry.getAttribute('aColor').array as Float32Array
    const alp = seg.object.geometry.getAttribute('aAlpha').array as Float32Array
    expect([col[0], col[1], col[2]]).toEqual([0.5, 0.25, 0.125])
    expect([col[3], col[4], col[5]]).toEqual([0.5, 0.25, 0.125])
    expect(alp[0]).toBeCloseTo(0.7, 6)
    expect(alp[1]).toBeCloseTo(0.7, 6)
    seg.dispose()
  })

  it('interpolates a gradient per vertex: source colour at t=0, target colour at t=1', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    // Red source, green target — the stroke must run red → green along its curve.
    seg.updateColors(() => ({ r: 1, g: 0, b: 0, r2: 0, g2: 1, b2: 0, a: 0.7 }))
    const col = seg.object.geometry.getAttribute('aColor').array as Float32Array
    expect([col[0], col[1], col[2]]).toEqual([1, 0, 0])
    const lastVertex = CURVED_STROKE_VERTS - 1
    expect([col[lastVertex * 3], col[lastVertex * 3 + 1], col[lastVertex * 3 + 2]]).toEqual([0, 1, 0])
    seg.dispose()
  })

  it('a style without r2/g2/b2 stays uniform (highlight overlay path)', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    seg.updateColors(() => ({ r: 0.5, g: 0.25, b: 0.125, a: 0.7 }))
    const col = seg.object.geometry.getAttribute('aColor').array as Float32Array
    const lastVertex = CURVED_STROKE_VERTS - 1
    expect([col[lastVertex * 3], col[lastVertex * 3 + 1], col[lastVertex * 3 + 2]]).toEqual([0.5, 0.25, 0.125])
    seg.dispose()
  })

  it('resolves object endpoints after d3-force mutates them', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    // Simulate the library replacing string ids with node objects.
    ;(links[0] as unknown as { source: unknown }).source = nodes[0]
    ;(links[0] as unknown as { target: unknown }).target = nodes[1]
    seg.updatePositions()
    const pos = seg.object.geometry.getAttribute('position').array as Float32Array
    expect([pos[0], pos[1], pos[2]]).toEqual([1, 2, 3])
    const lastVertex = CURVED_STROKE_VERTS - 1
    expect([pos[lastVertex * 3], pos[lastVertex * 3 + 1], pos[lastVertex * 3 + 2]]).toEqual([10, 20, 30])
    seg.dispose()
  })

  it('a pending full recolor wins over a later ranged one (three uploads ONLY the ranges)', () => {
    const nodes: Graph3DNode[] = [
      { id: 'a', label: 'A', entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, data: {} },
      { id: 'b', label: 'B', entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, data: {} },
      { id: 'c', label: 'C', entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, data: {} },
    ]
    const mk = (source: string, target: string): Graph3DLink => ({
      source, target, relationType: 'IMPORTS', layer: 'fabric', color: 'rgba(148,163,184,0.35)', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
    })
    const seg = createLinkSegments(nodes, [mk('a', 'b'), mk('b', 'c'), mk('a', 'c')])
    const g = seg.object.geometry
    const col = () => g.getAttribute('aColor') as THREE.BufferAttribute
    const alp = () => g.getAttribute('aAlpha') as THREE.BufferAttribute
    col().onUploadCallback()
    alp().onUploadCallback()
    // Full restyle (selection dims everything), then the hover spotlight in the
    // same frame: the full upload must survive.
    seg.updateColors(() => ({ r: 0, g: 0, b: 0, a: 0.05 }))
    seg.updateColorsForNodes(['a'], () => ({ r: 1, g: 1, b: 0, a: 1 }))
    expect(col().updateRanges).toEqual([])
    expect(alp().updateRanges).toEqual([])
    // After the upload, a lone spotlight is ranged again.
    col().onUploadCallback()
    alp().onUploadCallback()
    seg.updateColorsForNodes(['a'], () => ({ r: 1, g: 1, b: 0, a: 1 }))
    expect(col().updateRanges.length).toBeGreaterThan(0)
    seg.dispose()
  })

  it('recolors only the links touching a node (hover spotlight), not the whole crate', () => {
    const nodes: Graph3DNode[] = [
      { id: 'a', label: 'A', entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, data: {} },
      { id: 'b', label: 'B', entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, data: {} },
      { id: 'c', label: 'C', entityType: 'file', layer: 'code', x: 0, y: 0, z: 0, data: {} },
    ]
    const mk = (source: string, target: string): Graph3DLink => ({
      source, target, relationType: 'IMPORTS', layer: 'fabric', color: 'rgba(148,163,184,0.35)', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
    })
    const links: Graph3DLink[] = [mk('a', 'b'), mk('b', 'c'), mk('a', 'c')]
    const seg = createLinkSegments(nodes, links)
    seg.updateColors(() => ({ r: 0, g: 0, b: 0, a: 0 }))
    let calls = 0
    seg.updateColorsForNodes(['a'], () => { calls++; return { r: 1, g: 1, b: 0, a: 1 } })
    // Only links 0 (a-b) and 2 (a-c) touch node 'a'; link 1 (b-c) is untouched.
    expect(calls).toBe(2)
    const col = seg.object.geometry.getAttribute('aColor').array as Float32Array
    const link1Base = CURVED_STROKE_VERTS * 1 * 3 // first vertex of link index 1 (b-c)
    expect([col[0], col[1], col[2]]).toEqual([1, 1, 0])   // link 0 (a-b), first vertex of its stroke
    const link0Last = (CURVED_STROKE_VERTS - 1) * 3
    expect([col[link0Last], col[link0Last + 1], col[link0Last + 2]]).toEqual([1, 1, 0]) // link 0, last vertex
    expect([col[link1Base], col[link1Base + 1], col[link1Base + 2]]).toEqual([0, 0, 0]) // link 1 (b-c) untouched
    seg.dispose()
  })
})
