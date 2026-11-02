import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createNodePoints, shapeForType, sizeForType, nodeGain, NODE_GAIN_REFERENCE, NODE_GAIN_FLOOR } from './nodePoints'
import type { Graph3DNode } from './useGraph3DLayout'

const mk = (id: string, x: number, y: number, z: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x, y, z, data: {},
})

describe('shapeForType', () => {
  it('maps entity types to 4 shapes', () => {
    expect(shapeForType('file')).toBe(0)
    expect(shapeForType('function')).toBe(1)
    expect(shapeForType('decision')).toBe(2)
    expect(shapeForType('plan')).toBe(3)
    expect(shapeForType('unknown')).toBe(0)
  })
})

describe('sizeForType', () => {
  it('gives plans bigger points than functions', () => {
    expect(sizeForType('plan')).toBeGreaterThan(sizeForType('function'))
    expect(sizeForType('function')).toBe(2)
  })
})

describe('createNodePoints', () => {
  const fixture = () => [
    mk('a', 0, 0, 0),
    mk('b', 100, 0, 0),
    mk('c', 0, 100, 0),
  ]

  it('builds one vertex per node', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    expect((np.object.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(3)
    np.dispose()
  })

  it('writes node positions', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    const pos = np.object.geometry.getAttribute('position').array as Float32Array
    expect([pos[0], pos[1], pos[2]]).toEqual([0, 0, 0])
    expect([pos[3], pos[4], pos[5]]).toEqual([100, 0, 0])
    np.dispose()
  })

  it('re-reads positions after a node moves', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    nodes[1].x = 250
    np.updatePositions()
    const pos = np.object.geometry.getAttribute('position').array as Float32Array
    expect(pos[3]).toBe(250)
    np.dispose()
  })

  it('writes style attributes per node', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    np.updateStyles((n) => (n.id === 'b'
      ? { r: 1, g: 0, b: 0, alpha: 0.9, size: 5, shape: 1, act: 0.7 }
      : { r: 0, g: 0, b: 1, alpha: 0.5, size: 2, shape: 0, act: 0 }))
    const g = np.object.geometry
    const col = g.getAttribute('aColor').array as Float32Array
    const shp = g.getAttribute('aShape').array as Float32Array
    const act = g.getAttribute('aAct').array as Float32Array
    expect([col[3], col[4], col[5]]).toEqual([1, 0, 0]) // node b
    expect(shp[1]).toBe(1)
    expect(act[1]).toBeCloseTo(0.7, 6)
    expect([col[0], col[1], col[2]]).toEqual([0, 0, 1]) // node a
    np.dispose()
  })

  it('indexes nodes by id', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    expect(np.indexOf('b')).toBe(1)
    expect(np.indexOf('missing')).toBe(-1)
    np.dispose()
  })

  it('updates one node in place via a ranged upload, leaving neighbours untouched', () => {
    const nodes = fixture()
    const np = createNodePoints(nodes)
    np.updateStyles(() => ({ r: 0, g: 0, b: 1, alpha: 0.5, size: 2, shape: 0, act: 0 }))
    const g = np.object.geometry
    const idx = np.indexOf('b')
    np.updateStyleAt(idx, { r: 1, g: 0, b: 0, alpha: 0.9, size: 5, shape: 1, act: 0.7 })
    const col = g.getAttribute('aColor').array as Float32Array
    const alp = g.getAttribute('aAlpha').array as Float32Array
    const shp = g.getAttribute('aShape').array as Float32Array
    // node b changed
    expect([col[3], col[4], col[5]]).toEqual([1, 0, 0])
    expect(alp[1]).toBeCloseTo(0.9, 6)
    expect(shp[1]).toBe(1)
    // node a untouched
    expect([col[0], col[1], col[2]]).toEqual([0, 0, 1])
    expect(alp[0]).toBeCloseTo(0.5, 6)
    // a ranged upload was queued (element units), not a full-buffer rewrite
    const aColor = g.getAttribute('aColor') as THREE.BufferAttribute
    expect(aColor.updateRanges).toEqual([{ start: 3, count: 3 }])
    np.dispose()
  })

  it('picks the node under the raycaster', () => {
    const nodes = fixture()
    // Camera on +Z looking at the origin so node a (0,0,0) projects to NDC (0,0).
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000)
    camera.position.set(0, 0, 500)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const np = createNodePoints(nodes)
    const ray = new THREE.Raycaster()
    ray.params.Points.threshold = 6
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    expect(np.pick(ray)?.id).toBe('a')
    // Aim at the far corner: no point there.
    ray.setFromCamera(new THREE.Vector2(0.99, 0.99), camera)
    expect(np.pick(ray)).toBeNull()
    np.dispose()
  })
})

// ── The look, asserted where it can be ───────────────────────────────────────
// A test cannot see a glow. What it CAN pin down is everything that made the
// previous version flat, so a silent revert fails here instead of in the user's
// eyes: additive emission, a global gain tied to the node count, a halo that
// reaches the sprite edge, and uPx kept in lockstep with the renderer.

describe('nodeGain', () => {
  it('leaves a small graph untouched', () => {
    expect(nodeGain(1)).toBe(1)
    expect(nodeGain(50)).toBe(1)
    expect(nodeGain(NODE_GAIN_REFERENCE)).toBe(1)
  })

  it('falls off as 1/√N above the reference, then floors at NODE_GAIN_FLOOR', () => {
    expect(nodeGain(NODE_GAIN_REFERENCE * 4)).toBeCloseTo(0.5, 6)
    // 40k nodes: 1/√N would be 0.1, but the floor keeps a lit node visible.
    expect(nodeGain(NODE_GAIN_REFERENCE * 100)).toBeCloseTo(NODE_GAIN_FLOOR, 6)
  })

  it('never increases as the graph grows, and never drops below the floor', () => {
    const counts = [400, 1_000, 4_000, 16_000, 64_000, 250_000]
    const gains = counts.map(nodeGain)
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]).toBeLessThanOrEqual(gains[i - 1])
    }
    for (const g of gains) {
      expect(g).toBeGreaterThanOrEqual(NODE_GAIN_FLOOR)
    }
  })

  it('survives nonsense counts', () => {
    expect(nodeGain(0)).toBe(1)
    expect(nodeGain(-12)).toBe(1)
    expect(nodeGain(Number.NaN)).toBe(1)
  })
})

describe('nodePoints material', () => {
  const mat = (n: number) => {
    const np = createNodePoints(Array.from({ length: n }, (_, i) => mk(`n${i}`, i, 0, 0)))
    return { np, material: np.object.material as THREE.ShaderMaterial }
  }

  it('emits light additively instead of compositing', () => {
    const { np, material } = mat(3)
    expect(material.blending).toBe(THREE.AdditiveBlending)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    np.dispose()
  })

  it('carries a density gain that shrinks with the node count', () => {
    const small = mat(100)
    const large = mat(10_000)
    const gain = (m: THREE.ShaderMaterial) => m.uniforms.uGlobal.value as number
    expect(gain(small.material)).toBe(1)
    expect(gain(large.material)).toBeLessThan(0.3)
    small.np.dispose()
    large.np.dispose()
  })

  it('recomputes the gain when the data changes size', () => {
    const { np, material } = mat(10)
    expect(material.uniforms.uGlobal.value).toBe(1)
    np.setData(Array.from({ length: 4_000 }, (_, i) => mk(`x${i}`, i, 0, 0)))
    expect(material.uniforms.uGlobal.value).toBeLessThan(0.4)
    np.dispose()
  })

  it('keeps uPx equal to the renderer pixel ratio it is given', () => {
    const { np, material } = mat(2)
    np.setPixelRatio(1)
    expect(material.uniforms.uPx.value).toBe(1)
    np.setPixelRatio(1.5)
    expect(np.getPixelRatio()).toBe(1.5)
    // Junk must not blank the points (uPx 0 would collapse gl_PointSize).
    np.setPixelRatio(0)
    expect(np.getPixelRatio()).toBe(1)
    np.dispose()
  })

  it('keeps the halo, the core and the per-node alpha in the fragment shader', () => {
    const { np, material } = mat(2)
    const fs = material.fragmentShader
    expect(fs).toContain('uGlobal')
    expect(fs).toContain('vAlpha')
    expect(fs).toContain('vAct')
    // halo = q² with q = 1-d²: the smooth radial falloff the flat version lacked
    expect(fs).toMatch(/float halo = q \* q/)
    // the four shapes are still there, each with its own footprint
    expect(fs).toMatch(/vShape < 0\.5/)
    expect(fs).toMatch(/vShape < 1\.5/)
    expect(fs).toMatch(/vShape < 2\.5/)
    np.dispose()
  })

  it('scales gl_PointSize by uPx and by the activation attribute', () => {
    const { np, material } = mat(2)
    expect(material.vertexShader).toContain('gl_PointSize')
    expect(material.vertexShader).toMatch(/uPx/)
    expect(material.vertexShader).toMatch(/aAct \* 1\.2/)
    np.dispose()
  })
})
