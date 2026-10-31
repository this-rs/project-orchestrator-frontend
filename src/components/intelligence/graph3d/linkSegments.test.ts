import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createLinkSegments, parseColor } from './linkSegments'
import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

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

  it('builds 2 vertices per link', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    const pos = seg.object.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(2)
    seg.dispose()
  })

  it('writes node positions into the buffer', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    const pos = seg.object.geometry.getAttribute('position').array as Float32Array
    expect([pos[0], pos[1], pos[2]]).toEqual([1, 2, 3])
    expect([pos[3], pos[4], pos[5]]).toEqual([10, 20, 30])
    seg.dispose()
  })

  it('re-reads positions after nodes move', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    nodes[1].x = 99
    seg.updatePositions()
    const pos = seg.object.geometry.getAttribute('position').array as Float32Array
    expect(pos[3]).toBe(99)
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

  it('resolves object endpoints after d3-force mutates them', () => {
    const { nodes, links } = makeFixture()
    const seg = createLinkSegments(nodes, links)
    // Simulate the library replacing string ids with node objects.
    ;(links[0] as unknown as { source: unknown }).source = nodes[0]
    ;(links[0] as unknown as { target: unknown }).target = nodes[1]
    seg.updatePositions()
    const pos = seg.object.geometry.getAttribute('position').array as Float32Array
    expect([pos[0], pos[1], pos[2]]).toEqual([1, 2, 3])
    expect([pos[3], pos[4], pos[5]]).toEqual([10, 20, 30])
    seg.dispose()
  })
})
