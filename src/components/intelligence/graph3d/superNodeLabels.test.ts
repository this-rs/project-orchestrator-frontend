import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { createSuperNodeLabels, declutterRects, selectLabeledNodes, SUPER_NODE_LABEL_LIMIT } from './superNodeLabels'
import type { Graph3DNode } from './useGraph3DLayout'

const superNode = (id: string, count: number): Graph3DNode => ({
  id, label: id, entityType: 'file', layer: 'code', x: 0, y: 0, z: 0,
  data: { count },
})

describe('selectLabeledNodes', () => {
  it('keeps only super-nodes (count > 1)', () => {
    const nodes = [superNode('a', 5), superNode('b', 1), superNode('c', 3)]
    expect(selectLabeledNodes(nodes).map((n) => n.id).sort()).toEqual(['a', 'c'])
  })

  it('picks the largest first', () => {
    const nodes = [superNode('small', 2), superNode('big', 9), superNode('mid', 5)]
    expect(selectLabeledNodes(nodes, 2).map((n) => n.id)).toEqual(['big', 'mid'])
  })

  it('respects the default label limit', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => superNode('n' + i, 100 - i))
    const picked = selectLabeledNodes(nodes)
    expect(picked.length).toBe(SUPER_NODE_LABEL_LIMIT)
    expect(picked[0].id).toBe('n0')
    expect(picked[picked.length - 1].id).toBe('n' + (SUPER_NODE_LABEL_LIMIT - 1))
  })

  it('respects an explicit smaller limit', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => superNode('n' + i, 10 - i))
    expect(selectLabeledNodes(nodes, 3).length).toBe(3)
  })

  it('returns the whole population when it is smaller than the limit', () => {
    const nodes = [superNode('a', 8), superNode('b', 6)]
    expect(selectLabeledNodes(nodes, 40)).toHaveLength(2)
  })
})

describe('declutterRects — names never pile up', () => {
  it('keeps the biggest group\'s name and hides the ones overlapping it', () => {
    const show = declutterRects([
      { x: 100, y: 100, w: 80, h: 14 }, // biggest group
      { x: 120, y: 104, w: 80, h: 14 }, // overlaps it → hidden
      { x: 100, y: 140, w: 80, h: 14 }, // below, clear → shown
      null, // behind the camera
    ])
    expect(show).toEqual([true, false, true, false])
  })

  it('a gap separates two names that merely touch', () => {
    expect(declutterRects([{ x: 0, y: 0, w: 50, h: 10 }, { x: 52, y: 0, w: 50, h: 10 }], 4)).toEqual([true, false])
    expect(declutterRects([{ x: 0, y: 0, w: 50, h: 10 }, { x: 60, y: 0, w: 50, h: 10 }], 4)).toEqual([true, true])
  })
})

describe('createSuperNodeLabels — names are the same size on any screen', () => {
  // SpriteText draws on a 2D canvas jsdom lacks: accept every call, 8 px per character
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, {
      get: (_t, key) => (key === 'measureText' ? (t: string) => ({ width: t.length * 8 }) : () => {}),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D)
  })
  afterEach(() => vi.restoreAllMocks())
  const nodes = [0, 1].map((i) => ({
    id: `g${i}`, label: `group ${i}`, entityType: 'file', layer: 'code', x: i * 500, y: 0, z: -800,
    data: { count: 10 + i, name: `group ${i}` },
  })) as Graph3DNode[]
  /** Height, in px, a label covers on a viewport of height H for this camera. */
  const pxHeight = (fov: number, w: number, h: number) => {
    const labels = createSuperNodeLabels(nodes)
    const cam = new THREE.PerspectiveCamera(fov, w / h, 1, 10000)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    labels.declutter(cam, w, h)
    const sp = labels.group.children[0] as THREE.Sprite
    const out = sp.scale.y * (cam.projectionMatrix.elements[5] * h) / 2
    labels.dispose()
    return out
  }
  it('two groups at the same spot: the smaller one\'s name is hidden on screen', () => {
    const same = [
      { id: 'big', label: 'big', entityType: 'file', layer: 'code', x: 0, y: 0, z: -800, data: { count: 50, name: 'big' } },
      { id: 'small', label: 'small', entityType: 'file', layer: 'code', x: 2, y: 0, z: -800, data: { count: 5, name: 'small' } },
    ] as Graph3DNode[]
    const labels = createSuperNodeLabels(same)
    const cam = new THREE.PerspectiveCamera(50, 1440 / 900, 1, 10000)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    labels.declutter(cam, 1440, 900)
    const [first, second] = labels.group.children as THREE.Sprite[]
    expect(first.visible).toBe(true)
    expect(second.visible).toBe(false)
    labels.dispose()
  })

  it('desktop 50°, phone portrait and landscape: the label height in px matches', () => {
    const desk = pxHeight(50, 1440, 900)
    const portrait = pxHeight(50, 390, 650)
    const landscape = pxHeight(50, 844, 390)
    expect(portrait).toBeCloseTo(desk, 3)
    expect(landscape).toBeCloseTo(desk, 3)
  })
})
