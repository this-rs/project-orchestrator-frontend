import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import * as THREE from 'three'
import { createNodePoints, type NodeStyle } from './nodePoints'
import { createLinkSegments } from './linkSegments'
import { FrameAnimator, type FrameScheduler } from './frameAnimator'
import { spriteScaleFor, useLivePulse, writeLinkActivation, writeNodeActivation } from './useLivePulse'
import { PULSE_MS } from './livePulse'
import { emitEntityPulse } from '../livePulseBus'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import { CURVE_SUBDIVISIONS } from './linkCurve'

/** First vertex index of link index 1's stroke, when the graph is under the curvature budget. */
const LINK1_FIRST_VERTEX = (CURVE_SUBDIVISIONS - 1) * 2

const mk = (id: string, x = 0): Graph3DNode => ({ id, label: id, entityType: 'note', layer: 'knowledge', x, y: 0, z: 0, data: {} })
const BASE: NodeStyle = { r: 0.2, g: 0.4, b: 0.6, alpha: 0.7, size: 3, shape: 0, act: 0 }
const baseNode = () => BASE
const baseLink = () => ({ r: 0.1, g: 0.1, b: 0.1, a: 0.2 })

function manualScheduler() {
  let pending: ((now: number) => void) | null = null
  const scheduler: FrameScheduler = {
    request: (cb) => {
      pending = cb
      return 1
    },
    cancel: () => {
      pending = null
    },
  }
  return {
    scheduler,
    step(now: number) {
      const cb = pending
      pending = null
      cb?.(now)
    },
    get hasPending() {
      return pending !== null
    },
  }
}

const actAt = (np: ReturnType<typeof createNodePoints>, i: number) =>
  (np.object.geometry.getAttribute('aAct') as THREE.BufferAttribute).getX(i)
const sizeAt = (np: ReturnType<typeof createNodePoints>, i: number) =>
  (np.object.geometry.getAttribute('aSize') as THREE.BufferAttribute).getX(i)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('writeNodeActivation', () => {
  it('Points tier: a targeted write of aAct / aSize, exact base at act 0', () => {
    const nodes = [mk('a'), mk('b', 10), mk('c', 20)]
    const np = createNodePoints(nodes)
    np.updateStyles(baseNode)
    expect(writeNodeActivation(np, nodes[1], 0.8, baseNode)).toBe(true)
    expect(actAt(np, 1)).toBeGreaterThan(0.7)
    expect(sizeAt(np, 1)).toBeGreaterThan(3)
    // Neighbours untouched.
    expect(actAt(np, 0)).toBe(0)
    expect(actAt(np, 2)).toBe(0)
    expect(writeNodeActivation(np, nodes[1], 0, baseNode)).toBe(true)
    expect(actAt(np, 1)).toBe(0)
    expect(sizeAt(np, 1)).toBe(3)
    np.dispose()
  })

  it('Points tier: a node absent from the buffer is a no-op', () => {
    const np = createNodePoints([mk('a')])
    expect(writeNodeActivation(np, mk('zzz'), 1, baseNode)).toBe(false)
    np.dispose()
  })

  it('tints toward the given colour while active, never at rest', () => {
    const nodes = [mk('a')]
    const np = createNodePoints(nodes)
    np.updateStyles(baseNode)
    writeNodeActivation(np, nodes[0], 1, baseNode, { r: 1, g: 0, b: 0, k: 0.5 })
    const col = np.object.geometry.getAttribute('aColor') as THREE.BufferAttribute
    expect(col.getX(0)).toBeCloseTo(0.6)
    expect(col.getY(0)).toBeCloseTo(0.2)
    writeNodeActivation(np, nodes[0], 0, baseNode, { r: 1, g: 0, b: 0, k: 0.5 })
    expect(col.getX(0)).toBeCloseTo(0.2)
    np.dispose()
  })

  it('sprite tier: scales the node Object3D and restores scale 1', () => {
    const obj = new THREE.Group()
    const node = Object.assign(mk('a'), { __threeObj: obj })
    expect(writeNodeActivation(null, node, 0.5, baseNode)).toBe(true)
    expect(obj.scale.x).toBeCloseTo(spriteScaleFor(0.5))
    expect(obj.scale.z).toBe(1)
    writeNodeActivation(null, node, 0, baseNode)
    expect(obj.scale.x).toBe(1)
    expect(writeNodeActivation(null, mk('no-object'), 0.5, baseNode)).toBe(false)
  })
})

describe('writeLinkActivation', () => {
  it('rewrites only the links of the node', () => {
    const nodes = [mk('a'), mk('b', 10), mk('c', 20)]
    const links: Graph3DLink[] = [
      { source: 'a', target: 'b', relationType: 'SYNAPSE', color: '#fff' } as unknown as Graph3DLink,
      { source: 'b', target: 'c', relationType: 'SYNAPSE', color: '#fff' } as unknown as Graph3DLink,
    ]
    const seg = createLinkSegments(nodes, links)
    seg.updateColors(baseLink)
    const alp = seg.object.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    writeLinkActivation(seg, 'a', 1, baseLink)
    expect(alp.getX(0)).toBeGreaterThan(0.2) // link 0 (a-b), vertex 0
    expect(alp.getX(LINK1_FIRST_VERTEX)).toBeCloseTo(0.2) // link 1 (b-c) untouched
    writeLinkActivation(seg, 'a', 0, baseLink)
    expect(alp.getX(0)).toBeCloseTo(0.2)
    writeLinkActivation(null, 'a', 1, baseLink) // no segments: no-op
    seg.dispose()
  })
})

describe('useLivePulse', () => {
  it('pulses a node named by the bus for PULSE_MS, then restores it and stops the loop', () => {
    const nodes = [mk('a'), mk('b', 10)]
    const np = createNodePoints(nodes)
    np.updateStyles(baseNode)
    const s = manualScheduler()
    const wake = vi.fn()
    const animator = new FrameAnimator(wake, s.scheduler)
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000)

    const { result, unmount } = renderHook(() =>
      useLivePulse({
        nodePointsRef: { current: np },
        linkSegmentsRef: { current: null },
        nodes,
        baseNodeStyle: baseNode,
        baseLinkStyle: baseLink,
        animator,
      }),
    )

    // Nothing at rest.
    expect(animator.isRunning).toBe(false)

    act(() => emitEntityPulse(['b', 'not-on-screen']))
    expect(result.current.clockRef.current.size).toBe(1)
    expect(animator.isRunning).toBe(true)

    act(() => s.step(1000 + PULSE_MS * 0.25))
    expect(actAt(np, 1)).toBeGreaterThan(0.5)
    expect(actAt(np, 0)).toBe(0)
    expect(wake).toHaveBeenCalled()

    // A second trigger while pulsing does not stack nor restart.
    nowSpy.mockReturnValue(1000 + PULSE_MS * 0.5)
    act(() => emitEntityPulse(['b']))
    expect(result.current.clockRef.current.size).toBe(1)

    act(() => s.step(1000 + PULSE_MS))
    expect(actAt(np, 1)).toBe(0)
    expect(sizeAt(np, 1)).toBe(3)
    expect(animator.isRunning).toBe(false)
    expect(s.hasPending).toBe(false)

    unmount()
    np.dispose()
  })

  it('does nothing when disabled', () => {
    const nodes = [mk('a')]
    const np = createNodePoints(nodes)
    const s = manualScheduler()
    const animator = new FrameAnimator(() => {}, s.scheduler)
    renderHook(() =>
      useLivePulse({
        nodePointsRef: { current: np },
        linkSegmentsRef: { current: null },
        nodes,
        baseNodeStyle: baseNode,
        baseLinkStyle: baseLink,
        animator,
        enabled: false,
      }),
    )
    act(() => emitEntityPulse(['a']))
    expect(animator.isRunning).toBe(false)
    np.dispose()
  })

  it('a graph change drops the pulses in flight and stops the loop', () => {
    const nodesA = [mk('a')]
    const np = createNodePoints(nodesA)
    const s = manualScheduler()
    const animator = new FrameAnimator(() => {}, s.scheduler)
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const { result, rerender } = renderHook(({ nodes }) =>
      useLivePulse({
        nodePointsRef: { current: np },
        linkSegmentsRef: { current: null },
        nodes,
        baseNodeStyle: baseNode,
        baseLinkStyle: baseLink,
        animator,
      }),
      { initialProps: { nodes: nodesA } },
    )
    act(() => emitEntityPulse(['a']))
    expect(result.current.clockRef.current.size).toBe(1)
    rerender({ nodes: [mk('z')] })
    expect(result.current.clockRef.current.size).toBe(0)
    expect(animator.isRunning).toBe(false)
    np.dispose()
  })

  it('a data refresh with the same ids keeps the pulse running to its end', () => {
    // The WebSocket event that pulses a node is also the one that refreshes the
    // graph: the flush hands over NEW node objects for the SAME ids. The pulse
    // used to be cleared on that identity change — it lived about one frame.
    const nodesA = [mk('a'), mk('b', 10)]
    const np = createNodePoints(nodesA)
    np.updateStyles(baseNode)
    const s = manualScheduler()
    const animator = new FrameAnimator(() => {}, s.scheduler)
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { result, rerender } = renderHook(({ nodes }) =>
      useLivePulse({
        nodePointsRef: { current: np },
        linkSegmentsRef: { current: null },
        nodes,
        baseNodeStyle: baseNode,
        baseLinkStyle: baseLink,
        animator,
      }),
      { initialProps: { nodes: nodesA } },
    )
    act(() => emitEntityPulse(['b']))
    rerender({ nodes: [mk('a'), mk('b', 10)] })
    expect(result.current.clockRef.current.size).toBe(1)
    expect(animator.isRunning).toBe(true)
    act(() => s.step(1000 + PULSE_MS * 0.25))
    expect(actAt(np, 1)).toBeGreaterThan(0.5)
    // A refresh that ADDS a node keeps the pulses whose node is still there.
    rerender({ nodes: [mk('a'), mk('b', 10), mk('c', 20)] })
    expect(result.current.clockRef.current.size).toBe(1)
    act(() => s.step(1000 + PULSE_MS))
    expect(actAt(np, 1)).toBe(0)
    expect(animator.isRunning).toBe(false)
    np.dispose()
  })
})
