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
  answerNext(assign?: (id: string, i: number) => number) {
    const m = this.queue.shift()!
    const communities: Record<string, number> = {}
    m.nodes.forEach((id, i) => {
      communities[id] = assign ? assign(id, i) : m.nodes.length * 100 + i
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
const inCommunity = (id: string, community: number): IntelligenceNode =>
  ({
    id,
    type: 'file',
    position: { x: 0, y: 0 },
    data: { entityType: 'file', layer: 'code', path: id, community_id: community },
  }) as unknown as IntelligenceNode

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

  it('never merges a detected community into a backend community with the same number', () => {
    // Backend communities 0..3 on the code; the notes have none, so Louvain
    // runs on them and numbers its own communities from 0 too. A note in
    // detected community 3 used to get communityId 3 and groupKey "c3": it
    // joined backend community 3.
    const backend = [0, 1, 2, 3].map((c) => inCommunity(`src/c${c}.ts`, c))
    const notes = Array.from({ length: 6 }, (_, i) => file(`notes/n${i}.md`))
    const nodes = [...backend, ...notes]
    const { result } = renderHook(() => useGraph3DLayout(nodes, NO_EDGES))
    act(() => FifoWorker.last!.answerNext(() => 3))
    const out = result.current.transformToGraph3D(nodes, NO_EDGES).data.nodes
    const backend3 = out.find((n) => n.id === 'src/c3.ts')!
    for (const n of out.filter((m) => m.id.startsWith('notes/'))) {
      expect(n.communityId).toBeDefined()
      expect(n.communityId).not.toBe(backend3.communityId)
      expect(n.groupKey).not.toBe(backend3.groupKey)
    }
  })

  it('does not run detection when the backend already gives every node a community', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => inCommunity(`src/f${i}.ts`, i % 2))
    renderHook(() => useGraph3DLayout(nodes, NO_EDGES))
    expect(FifoWorker.last?.queue.length ?? 0).toBe(0)
  })

  it('runs detection only on the nodes the backend leaves without a community', () => {
    const backend = [0, 1].map((c) => inCommunity(`src/c${c}.ts`, c))
    const notes = Array.from({ length: 3 }, (_, i) => file(`notes/n${i}.md`))
    renderHook(() => useGraph3DLayout([...backend, ...notes], NO_EDGES))
    expect(FifoWorker.last!.queue[0].nodes).toEqual(notes.map((n) => n.id))
  })
})
