import { describe, it, expect } from 'vitest'
import { layoutGroups, separateGroups, CORE_RATIO } from './relationalLayout'
import type { RelationalGroup, AffinityMatrix, OrganicPoint } from './relationalLayout'

function dist(a: OrganicPoint, b: OrganicPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
}

describe('layoutGroups', () => {
  it('is deterministic regardless of group listing order', () => {
    const groups: RelationalGroup[] = [
      { id: 'a', radius: 60 },
      { id: 'b', radius: 80 },
      { id: 'c', radius: 100 },
      { id: 'd', radius: 60 },
    ]
    const affinities: AffinityMatrix = {
      a: { b: 5 },
      c: { d: 1 },
    }
    const forward = layoutGroups(groups, affinities)
    const shuffled = layoutGroups([...groups].reverse(), affinities)
    for (const g of groups) {
      expect(shuffled.get(g.id)).toEqual(forward.get(g.id))
    }
  })

  it('places two strongly-related groups closer than two weakly-related groups of equal radius', () => {
    // Two independent components so they don't interfere with each other.
    const groups: RelationalGroup[] = [
      { id: 'strong-a', radius: 60 },
      { id: 'strong-b', radius: 60 },
      { id: 'weak-a', radius: 60 },
      { id: 'weak-b', radius: 60 },
    ]
    const affinities: AffinityMatrix = {
      'strong-a': { 'strong-b': 20 },
      'weak-a': { 'weak-b': 0.5 },
    }
    const positions = layoutGroups(groups, affinities, { maxIterations: 300 })
    const strongDist = dist(positions.get('strong-a')!, positions.get('strong-b')!)
    const weakDist = dist(positions.get('weak-a')!, positions.get('weak-b')!)
    expect(strongDist).toBeLessThan(weakDist)
  })

  it('keeps a group with no external relation isolated (farther than the envelope sum)', () => {
    const groups: RelationalGroup[] = [
      { id: 'hub-1', radius: 80 },
      { id: 'hub-2', radius: 80 },
      { id: 'hub-3', radius: 80 },
      { id: 'lonely', radius: 80 },
    ]
    const affinities: AffinityMatrix = {
      'hub-1': { 'hub-2': 10, 'hub-3': 10 },
      'hub-2': { 'hub-3': 10 },
    }
    const positions = layoutGroups(groups, affinities, { maxIterations: 300 })
    const lonely = positions.get('lonely')!
    for (const id of ['hub-1', 'hub-2', 'hub-3']) {
      const other = positions.get(id)!
      const d = dist(lonely, other)
      const envelopeSum = 80 + 80
      expect(d).toBeGreaterThan(envelopeSum)
    }
  })

  it('never produces NaN or Infinity, including with zero/no affinities', () => {
    const groups: RelationalGroup[] = [
      { id: 'x', radius: 60 },
      { id: 'y', radius: 60 },
      { id: 'z', radius: 160 },
    ]
    const positions = layoutGroups(groups, {})
    for (const p of positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
    }
  })

  it('never lets envelopes of UNRELATED groups touch, and cores of related ones', () => {
    const groups: RelationalGroup[] = Array.from({ length: 10 }, (_, i) => ({
      id: `g${i}`,
      radius: 60 + (i % 3) * 20,
    }))
    const affinities: AffinityMatrix = {}
    // A chain of affinities so the layout has real pulling forces to resolve
    // against the overlap constraint.
    for (let i = 0; i < groups.length - 1; i++) {
      affinities[`g${i}`] = { [`g${i + 1}`]: 3 }
    }
    const budget = 150
    const positions = layoutGroups(groups, affinities, { maxIterations: budget })
    expect(positions.size).toBe(groups.length)
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const gi = groups[i]
        const gj = groups[j]
        const d = dist(positions.get(gi.id)!, positions.get(gj.id)!)
        // Related pair: only the CORES must stay apart — sharing a halo is the
        // point. Unrelated pair: the envelopes must never touch.
        const related = affinities[gi.id]?.[gj.id] !== undefined
        const floor = related
          ? (gi.radius + gj.radius) * CORE_RATIO
          : gi.radius + gj.radius
        expect(d).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('lets a strongly-related pair share its halo, and only its halo', () => {
    const groups: RelationalGroup[] = [
      { id: 'a', radius: 80 },
      { id: 'b', radius: 80 },
    ]
    const positions = layoutGroups(groups, { a: { b: 40 } }, { maxIterations: 300 })
    const d = dist(positions.get('a')!, positions.get('b')!)
    // Closer than the envelope sum (the halos interpenetrate) but never inside
    // the two cores (which would be one group drawn twice).
    expect(d).toBeLessThan(80 + 80)
    expect(d).toBeGreaterThanOrEqual((80 + 80) * CORE_RATIO)
  })

  it('rests a linked pair closer than an unlinked one, of equal radius', () => {
    const groups: RelationalGroup[] = [
      { id: 'a', radius: 70 },
      { id: 'b', radius: 70 },
      { id: 'x', radius: 70 },
      { id: 'y', radius: 70 },
    ]
    // a—b is one real link; x and y are independent of everything.
    const positions = layoutGroups(groups, { a: { b: 1 } }, { maxIterations: 300 })
    const linked = dist(positions.get('a')!, positions.get('b')!)
    const unlinked = dist(positions.get('x')!, positions.get('y')!)
    expect(linked).toBeLessThan(unlinked)
  })

  it('resolves 200 groups through the grid, with no overlapping core left', () => {
    // Guards both the contract and the cost: the projection used to sweep every
    // pair (O(n²) per pass, 2 827 ms at 500 groups) and to spend its whole
    // budget on sub-pixel corrections. This fixture is the size the layout has
    // to stay correct at, not the size it has to stay fast at — the timing is
    // measured in the commit message, not asserted here (a wall-clock assertion
    // would be a flaky test on a shared CI runner).
    const groups: RelationalGroup[] = Array.from({ length: 200 }, (_, i) => ({
      id: `g${i}`,
      radius: 60 + (i % 5) * 10,
    }))
    const affinities: AffinityMatrix = {}
    for (let i = 0; i < groups.length; i++) {
      for (let k = 1; k <= 3; k++) {
        const j = (i * 7 + k * 13) % groups.length
        if (j === i) continue
        const a = `g${i}`
        const b = `g${j}`
        const [x, y] = a < b ? [a, b] : [b, a]
        affinities[x] ??= {}
        affinities[x][y] = (affinities[x][y] ?? 0) + 1
      }
    }
    const positions = layoutGroups(groups, affinities, { maxIterations: 200 })
    expect(positions.size).toBe(groups.length)
    const byId = new Map(groups.map((g) => [g.id, g.radius]))
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const gi = groups[i].id
        const gj = groups[j].id
        // Keys are stored in string order ("g12" < "g5"), so both directions.
        const related = affinities[gi]?.[gj] !== undefined || affinities[gj]?.[gi] !== undefined
        const floor = related
          ? (byId.get(gi)! + byId.get(gj)!) * CORE_RATIO
          : byId.get(gi)! + byId.get(gj)!
        expect(dist(positions.get(gi)!, positions.get(gj)!)).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('separation keeps every push of a pass: a group pressed on all sides converges', () => {
    // 500 unrelated groups piled into a ball far too small for them, every one
    // pressed by many neighbours at once. The projection used to read a group's
    // position ONCE per visit and write each push from that stale value, so
    // only the last push of a pass survived: on this pile it spent 78 passes
    // and still left 0.19 px of overlap (2 000 groups: 400 of 400 passes, 2.6 px).
    const N = 500
    const ids: string[] = []
    const pos = new Map<string, OrganicPoint>()
    const radiusOf = new Map<string, number>()
    for (let k = 0; k < N; k++) {
      const id = `n${String(k).padStart(3, '0')}`
      const up = 1 - (2 * (k + 0.5)) / N
      const around = Math.sqrt(1 - up * up)
      const angle = 2.39996 * k
      const r = 200 * Math.cbrt((k + 0.5) / N)
      ids.push(id)
      radiusOf.set(id, 60)
      pos.set(id, { x: Math.cos(angle) * around * r, y: up * r, z: Math.sin(angle) * around * r })
    }
    const passes = separateGroups(ids, pos, radiusOf, {}, 400)
    let worst = 0
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        worst = Math.max(worst, 120 - dist(pos.get(ids[i])!, pos.get(ids[j])!))
      }
    }
    // The constraint is envelope + 2 px margin: no envelope may overlap at all.
    expect(worst).toBeLessThanOrEqual(0)
    expect(passes).toBeLessThan(40)
  })

  it('reads only the affinities that exist: no all-pairs sweep', () => {
    // The pre-pass used to ask `affinities[g][h]` for every one of the G²/2
    // pairs: 801 directory groups cost 320 000 lookups before the descent even
    // started. A relation that does not exist must cost nothing.
    const groups: RelationalGroup[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `g${String(i).padStart(4, '0')}`,
      radius: 60,
    }))
    let reads = 0
    const counted = new Proxy<AffinityMatrix>(
      { g0000: { g0001: 1 }, g0002: { g0003: 2 } },
      {
        get(target, key, receiver) {
          reads++
          return Reflect.get(target, key, receiver)
        },
      },
    )
    layoutGroups(groups, counted, { maxIterations: 1 })
    expect(reads).toBeLessThan(10 * groups.length)
  })

  it('packs the groups: the cloud stays near the compact sphere and unrelated neighbours touch', () => {
    // The layout used to inflate the whole cloud by the worst pair's ratio,
    // which always hit its ×4 cap: the final radius was 3.45× the compact
    // sphere and the nearest unrelated neighbour of a group sat 1.6–2.2× its
    // envelope away — "les clusters sont beaucoup trop éloignés".
    const G = 200
    const groups: RelationalGroup[] = Array.from({ length: G }, (_, i) => ({
      id: `g${String(i).padStart(3, '0')}`,
      radius: 60 + (i % 7) * 15,
    }))
    const affinities: AffinityMatrix = {}
    for (let i = 0; i < G; i++) {
      for (const k of [1, 3]) {
        const j = i + k
        if (j >= G || (i * 7 + k) % 3 === 0) continue
        affinities[groups[i].id] ??= {}
        affinities[groups[i].id][groups[j].id] = 1 + (i % 4)
      }
    }
    const positions = layoutGroups(groups, affinities)
    const pts = groups.map((g) => positions.get(g.id)!)
    const c = pts.reduce((s, q) => ({ x: s.x + q.x / G, y: s.y + q.y / G, z: s.z + q.z / G }), { x: 0, y: 0, z: 0 })
    let extent = 0
    groups.forEach((g, i) => { extent = Math.max(extent, dist(pts[i], c) + g.radius) })
    // The tightest random packing of the envelopes (≈ 0.64 of a sphere).
    const compact = Math.cbrt(groups.reduce((s, g) => s + g.radius ** 3, 0) / 0.64)
    expect(extent / compact).toBeLessThan(1.6)

    const related = (a: string, b: string) =>
      affinities[a]?.[b] !== undefined || affinities[b]?.[a] !== undefined
    const ratios: number[] = []
    for (let i = 0; i < G; i++) {
      let best = Infinity
      for (let j = 0; j < G; j++) {
        if (i === j || related(groups[i].id, groups[j].id)) continue
        best = Math.min(best, dist(pts[i], pts[j]) / (groups[i].radius + groups[j].radius))
      }
      ratios.push(best)
    }
    ratios.sort((a, b) => a - b)
    expect(ratios[Math.floor(G / 2)]).toBeLessThan(1.25)
  })

  it('pulls the result toward supplied previous positions (stability)', () => {
    const groups: RelationalGroup[] = [
      { id: 'a', radius: 60 },
      { id: 'b', radius: 60 },
    ]
    const affinities: AffinityMatrix = { a: { b: 1 } }
    const previousFar = new Map<string, OrganicPoint>([
      ['a', { x: 1000, y: 1000, z: 1000 }],
      ['b', { x: -1000, y: -1000, z: -1000 }],
    ])
    const withoutPrev = layoutGroups(groups, affinities, { maxIterations: 200 })
    const withPrev = layoutGroups(groups, affinities, { maxIterations: 200, previousPositions: previousFar })

    const aWithout = withoutPrev.get('a')!
    const aWith = withPrev.get('a')!
    const distToPrevWithout = dist(aWithout, previousFar.get('a')!)
    const distToPrevWith = dist(aWith, previousFar.get('a')!)
    expect(distToPrevWith).toBeLessThan(distToPrevWithout)
  })
})
