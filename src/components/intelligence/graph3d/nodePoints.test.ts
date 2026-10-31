import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createNodePoints, shapeForType, sizeForType } from './nodePoints'
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
