import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { IntelligenceEdge, IntelligenceNode } from '@/types/intelligence'
import { groupRadius, useGraph3DLayout } from './useGraph3DLayout'
import { detectCommunities } from './communityDetect'

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
  answerNext(assign?: (id: string, i: number) => number | undefined) {
    const m = this.queue.shift()!
    const communities: Record<string, number> = {}
    m.nodes.forEach((id, i) => {
      const c = assign ? assign(id, i) : m.nodes.length * 100 + i
      if (c !== undefined) communities[id] = c
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

  it('pools the nodes detection leaves without a community instead of one group each', () => {
    // 100 files in one chain + 300 notes linked to nothing.
    const files = Array.from({ length: 100 }, (_, i) => file(`src/a/f${i}.ts`))
    const notes = Array.from({ length: 300 }, (_, i) =>
      ({ id: `note${i}`, type: 'note', position: { x: 0, y: 0 }, data: { entityType: 'note', layer: 'knowledge' } }) as unknown as IntelligenceNode,
    )
    const edges = files.slice(1).map((f, i) => link(files[i].id, f.id))
    const nodes = [...files, ...notes]
    const { result } = renderHook(() => useGraph3DLayout(nodes, edges))
    const partition = detectCommunities(
      FifoWorker.last!.queue[0].nodes,
      edges.map((e) => ({ source: e.source, target: e.target })),
    )
    act(() => FifoWorker.last!.answerNext((id) => partition.get(id)))
    const out = result.current.transformToGraph3D(nodes, edges).data.nodes
    // The files got their detected communities…
    expect(out.filter((n) => n.layer === 'code').every((n) => n.communityId !== undefined)).toBe(true)
    // …and the 300 notes share ONE pooled group, not 300.
    const noteGroups = new Set(out.filter((n) => n.layer === 'knowledge').map((n) => n.groupKey))
    expect(noteGroups.size).toBe(1)
  })

  it('runs detection only on the nodes the backend leaves without a community', () => {
    const backend = [0, 1].map((c) => inCommunity(`src/c${c}.ts`, c))
    const notes = Array.from({ length: 3 }, (_, i) => file(`notes/n${i}.md`))
    renderHook(() => useGraph3DLayout([...backend, ...notes], NO_EDGES))
    expect(FifoWorker.last!.queue[0].nodes).toEqual(notes.map((n) => n.id))
  })
})

// ── Placement across updates ─────────────────────────────────────────────────

type P = { x: number; y: number; z: number }
const centroidOf = (ps: P[]): P => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
  z: ps.reduce((s, p) => s + p.z, 0) / ps.length,
})
const gap = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const radiusOf = (ps: P[]) => {
  const c = centroidOf(ps)
  return Math.max(...ps.map((p) => gap(p, c)))
}

describe('useGraph3DLayout — placement across updates', () => {
  it('re-places the nodes when detected communities replace the fallback grouping', () => {
    // 2 000 files in 80 directories, file i importing i+1..i+3: the detected
    // communities run along the index, across the directories. Positions used
    // to stay where the directory layout put them, so each detected community
    // was scattered over the whole scene (median radius 1 565 px against 94
    // for a directory group).
    const files = Array.from({ length: 2000 }, (_, i) => file(`src/d${i % 80}/f${i}.ts`))
    const edges: IntelligenceEdge[] = []
    for (let i = 0; i < files.length; i++) {
      for (let k = 1; k <= 3; k++) if (i + k < files.length && (i * 7 + k) % 4 !== 0) edges.push(link(files[i].id, files[i + k].id))
    }
    const { result } = renderHook(() => useGraph3DLayout(files, edges))
    result.current.transformToGraph3D(files, edges) // directory fallback, cached
    const partition = detectCommunities(
      FifoWorker.last!.queue[0].nodes,
      edges.map((e) => ({ source: e.source, target: e.target })),
    )
    act(() => FifoWorker.last!.answerNext((id) => partition.get(id)))
    const out = result.current.transformToGraph3D(files, edges).data.nodes
    const byCommunity = new Map<number, P[]>()
    for (const n of out) {
      const list = byCommunity.get(n.communityId!) ?? []
      list.push(n)
      byCommunity.set(n.communityId!, list)
    }
    // A detected community is laid out as ONE group: its members within the
    // radius a group of that size gets.
    const spread = [...byCommunity.values()]
      .filter((ps) => ps.length >= 10)
      .map((ps) => radiusOf(ps) / groupRadius(ps.length))
      .sort((a, b) => a - b)
    expect(spread[Math.floor(spread.length / 2)]).toBeLessThan(1.05)
  })

  it('places a new node inside the group it joins, not at the origin', () => {
    const nodes = Array.from({ length: 500 }, (_, i) => inCommunity(`src/c${Math.floor(i / 50)}/f${i}.ts`, Math.floor(i / 50)))
    const { result } = renderHook(() => useGraph3DLayout(nodes, NO_EDGES))
    const first = result.current.transformToGraph3D(nodes, NO_EDGES).data.nodes
    const c5 = centroidOf(first.filter((n) => n.communityId === 5))
    const r5 = radiusOf(first.filter((n) => n.communityId === 5))
    expect(gap(c5, { x: 0, y: 0, z: 0 })).toBeGreaterThan(r5) // c5 is not the central group

    const grown = [...nodes, inCommunity('src/c5/new.ts', 5)]
    const second = result.current.transformToGraph3D(grown, NO_EDGES).data.nodes
    const added = second.find((n) => n.id === 'src/c5/new.ts')!
    expect(gap(added, c5)).toBeLessThan(r5 * 1.1)
    // …and nobody else moved.
    for (const n of first) expect(second.find((m) => m.id === n.id)).toMatchObject({ x: n.x, y: n.y, z: n.z })
  })

  it('places a second batch of groups next to the first, never inside it', () => {
    // Batch A: 40 code communities of 100. Batch B arrives later: 10 knowledge
    // groups of 50. B used to be laid out on its own — an independent
    // archipelago around the same origin, its envelopes overlapping A's.
    const A = Array.from({ length: 4000 }, (_, i) => inCommunity(`src/c${Math.floor(i / 100)}/f${i}.ts`, Math.floor(i / 100)))
    const B = Array.from({ length: 500 }, (_, i) =>
      ({
        id: `note${i}`,
        type: 'note',
        position: { x: 0, y: 0 },
        data: { entityType: 'note', layer: 'knowledge', community_id: 100 + Math.floor(i / 50) },
      }) as unknown as IntelligenceNode,
    )
    const { result } = renderHook(() => useGraph3DLayout(A, NO_EDGES))
    const first = result.current.transformToGraph3D(A, NO_EDGES).data.nodes
    const second = result.current.transformToGraph3D([...A, ...B], NO_EDGES).data.nodes
    const groups = (ns: typeof second, prefix: string) => {
      const m = new Map<number, P[]>()
      for (const n of ns) if (n.id.startsWith(prefix)) m.set(n.communityId!, [...(m.get(n.communityId!) ?? []), n])
      return [...m.values()].map((ps) => ({ c: centroidOf(ps), r: radiusOf(ps) }))
    }
    const a = groups(first, 'src/')
    const b = groups(second, 'note')
    for (const gb of b) for (const ga of a) expect(gap(ga.c, gb.c)).toBeGreaterThan(ga.r + gb.r)
  })
})
