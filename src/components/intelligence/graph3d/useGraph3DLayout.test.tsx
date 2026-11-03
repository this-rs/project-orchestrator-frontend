import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { IntelligenceEdge, IntelligenceNode } from '@/types/intelligence'
import { useGraph3DLayout } from './useGraph3DLayout'

// A single-threaded worker: it answers its requests one by one, in the order
// they were posted, like the real communityWorker. Each answer gives node i of
// a request of size N the community N·100 + i, so an answer says which request
// it belongs to.
interface Request {
  requestId?: number
  nodes: string[]
}
class FifoWorker {
  static last: FifoWorker | null = null
  readonly queue: Request[] = []
  private readonly listeners = { message: new Set<(e: MessageEvent) => void>(), error: new Set<() => void>() }
  constructor() {
    FifoWorker.last = this
  }
  addEventListener(type: 'message' | 'error', f: (e: MessageEvent) => void) {
    this.listeners[type].add(f)
  }
  removeEventListener(type: 'message' | 'error', f: (e: MessageEvent) => void) {
    this.listeners[type].delete(f)
  }
  postMessage(m: Request) {
    this.queue.push(m)
  }
  terminate() {}
  answerNext() {
    const m = this.queue.shift()!
    const communities: Record<string, number> = {}
    m.nodes.forEach((id, i) => {
      communities[id] = m.nodes.length * 100 + i
    })
    const data = { type: 'result', requestId: m.requestId, communities, count: m.nodes.length }
    for (const f of [...this.listeners.message]) f({ data } as MessageEvent)
  }
}

const file = (id: string): IntelligenceNode =>
  ({ id, type: 'file', position: { x: 0, y: 0 }, data: { entityType: 'file', layer: 'code', path: id } }) as unknown as IntelligenceNode
const link = (s: string, t: string): IntelligenceEdge =>
  ({ id: `${s}-${t}`, source: s, target: t, data: { relationType: 'IMPORTS' } }) as unknown as IntelligenceEdge
const NO_EDGES: IntelligenceEdge[] = []

let savedWorker: unknown
beforeEach(() => {
  savedWorker = (globalThis as { Worker?: unknown }).Worker
  ;(globalThis as { Worker?: unknown }).Worker = FifoWorker
})
afterEach(() => {
  ;(globalThis as { Worker?: unknown }).Worker = savedWorker
  FifoWorker.last = null
})

describe('useGraph3DLayout — community worker', () => {
  it('drops an answer meant for an older request, and keeps its own', () => {
    // Version A (10 files), then version B (A + 1 file) before the worker has
    // answered A. The worker is shared and answers A first: B used to take
    // A's answer as its own and unsubscribe, so B's real answer was lost.
    const A = Array.from({ length: 10 }, (_, i) => file(`src/a/f${i}.ts`))
    const B = [...A, file('src/a/f10.ts')]
    const { result, rerender } = renderHook(({ nodes }) => useGraph3DLayout(nodes, NO_EDGES), {
      initialProps: { nodes: A },
    })
    rerender({ nodes: B })
    act(() => FifoWorker.last!.answerNext()) // A's answer
    const afterA = result.current.transformToGraph3D(B, NO_EDGES).data.nodes
    expect(afterA.every((n) => n.communityId === undefined)).toBe(true)

    act(() => FifoWorker.last!.answerNext()) // B's answer
    const afterB = result.current.transformToGraph3D(B, NO_EDGES).data.nodes
    expect(afterB.map((n) => n.communityId)).toEqual(B.map((_, i) => 1100 + i))
  })

  it('does not apply a partition computed for another data set', () => {
    // Project P is answered; then project Q, which shares a few file ids with
    // P (two repositories both have src/main.ts) but is mostly different.
    // P's communities must not leak onto Q's homonyms while Q is computed.
    const P = Array.from({ length: 10 }, (_, i) => file(`src/f${i}.ts`))
    const Q = [...P.slice(0, 3), ...Array.from({ length: 12 }, (_, i) => file(`lib/g${i}.ts`))]
    const { result, rerender } = renderHook(({ nodes }) => useGraph3DLayout(nodes, NO_EDGES), {
      initialProps: { nodes: P },
    })
    act(() => FifoWorker.last!.answerNext())
    expect(result.current.transformToGraph3D(P, NO_EDGES).data.nodes[0].communityId).toBe(1000)

    rerender({ nodes: Q })
    const q = result.current.transformToGraph3D(Q, [link('src/f0.ts', 'lib/g0.ts')]).data.nodes
    expect(q.every((n) => n.communityId === undefined)).toBe(true)
  })
})
