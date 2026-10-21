import { describe, expect, it } from 'vitest'
import type { CrudEvent, DependencyGraph } from '@/types'
import { liveScene, type LiveScene } from '@/vendor/three-iso/live'
import {
  DEFAULT_MECH,
  LIVE_MAX_STATIONS,
  diffView,
  eventStep,
  initialStep,
  modelFromGraph,
  pieceFor,
  toLiveStatus,
  toModel,
  viewOf,
  type LivePlanState,
  type LiveStep,
} from './planToPatches'

const PLAN = '11111111-1111-4111-8111-111111111111'
const OTHER_PLAN = '22222222-2222-4222-8222-222222222222'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const A = id(1)
const B = id(2)
const C = id(3)
const D = id(4)

const graph = (nodes: { id: string; title?: string; status?: string; tags?: string[] }[], edges: [string, string][] = []): DependencyGraph =>
  ({ nodes: nodes.map((n) => ({ status: 'pending', ...n })), edges: edges.map(([from, to]) => ({ from, to })) }) as unknown as DependencyGraph

const ev = (e: Partial<CrudEvent> & Pick<CrudEvent, 'entity_type' | 'action' | 'entity_id'>): CrudEvent =>
  ({ payload: {}, timestamp: '2026-10-21T10:00:00Z', ...e }) as CrudEvent

/** Drive a real live scene through the steps, as LivePlanViz does. */
function drive(first: LiveStep) {
  let L: LiveScene = liveScene({ id: 'plan-test' })
  let state: LivePlanState = first.state
  let resets = 0
  let t = 0
  const apply = (step: LiveStep) => {
    state = step.state
    if (step.reset) {
      L = liveScene({ id: 'plan-test' })
      resets++
    }
    if (step.patches.length || step.reset) {
      const r = L.apply(step.patches, (t += 1000))
      expect(r, JSON.stringify(r)).toMatchObject({ ok: true })
    }
  }
  apply(first)
  resets = 0
  return {
    send: (e: CrudEvent) => {
      const step = eventStep(state, e, 0)
      apply(step)
      return step
    },
    get L() {
      return L
    },
    get state() {
      return state
    },
    get resets() {
      return resets
    },
    statuses: () => Object.fromEntries(L.stations.map((s) => [s.id, s.status])),
  }
}

describe('statuses and pieces', () => {
  it('maps the server statuses to the scene', () => {
    expect(['pending', 'blocked', 'in_progress', 'completed', 'failed', 'interrupted', 'weird'].map(toLiveStatus)).toEqual([
      'planned',
      'planned',
      'building',
      'done',
      'failed',
      'planned',
      'planned',
    ])
  })
  it('chooses a mechanism from the title and the tags, else dependency-graph', () => {
    expect(pieceFor({ title: 'Exécution parallèle des tests', tags: [] })).toBe('parallel-lanes')
    expect(pieceFor({ title: 'zzz', tags: ['qwerty'] })).toBe(DEFAULT_MECH)
    expect(pieceFor({ title: '', tags: [] })).toBe(DEFAULT_MECH)
  })
})

describe('initial state', () => {
  it('one add per task, with its status, its piece and its dependencies (edge from → to: from waits for to)', () => {
    const m = modelFromGraph(PLAN, graph([{ id: A, title: 'Plan', status: 'completed' }, { id: B, title: 'Build', status: 'in_progress' }, { id: C }], [[B, A], [C, B]]))
    const step = initialStep(m)
    expect(step.reset).toBe(true)
    expect(step.patches).toEqual([
      { op: 'add', id: A, mech: pieceFor({ title: 'Plan', tags: [] }), label: 'Plan', status: 'done' },
      { op: 'add', id: B, mech: pieceFor({ title: 'Build', tags: [] }), label: 'Build', status: 'building', after: [A] },
      { op: 'add', id: C, mech: DEFAULT_MECH, label: C.slice(0, 8), status: 'planned', after: [B] },
    ])
    const L = liveScene({ id: 'x' })
    expect(L.apply(step.patches, 0)).toMatchObject({ ok: true })
    expect(L.machine).not.toBeNull()
  })

  it('beyond 12 tasks: in progress, then next ready, then last finished; the rest counted, never refused', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: id(100 + i), title: `T${i}`, status: 'pending' }))
    // 0..5 done (5 the last), 6 in progress, 7 failed; 8 ready (deps done), 9..19 pending waiting on 6.
    for (let i = 0; i < 6; i++) nodes[i]!.status = 'completed'
    nodes[6]!.status = 'in_progress'
    nodes[7]!.status = 'failed'
    const edges: [string, string][] = [[id(108), id(100)]]
    for (let i = 9; i < 20; i++) edges.push([id(100 + i), id(106)])
    const completedAt = Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [id(100 + i), `2026-10-0${i + 1}T00:00:00Z`]))
    const v = viewOf(modelFromGraph(PLAN, graph(nodes, edges), completedAt))
    expect(v.stations).toHaveLength(LIVE_MAX_STATIONS)
    expect(v.hidden).toBe(8)
    const shown = new Set(v.stations.map((s) => s.id))
    for (const i of [6, 7, 8, 0, 1, 2, 3, 4, 5]) expect(shown.has(id(100 + i)), `T${i}`).toBe(true)
    // In the plan's order, dependencies only among shown stations.
    expect(v.stations.map((s) => s.id)).toEqual([...v.stations.map((s) => s.id)].sort())
    for (const s of v.stations) for (const a of s.after) expect(shown.has(a)).toBe(true)
    const L = liveScene({ id: 'big' })
    expect(L.apply(initialStep(modelFromGraph(PLAN, graph(nodes, edges), completedAt)).patches, 0)).toMatchObject({ ok: true })
  })
})

describe('events', () => {
  const base = () => modelFromGraph(PLAN, graph([{ id: A, title: 'Plan' }, { id: B, title: 'Build' }], [[B, A]]))

  it('a sequence of simulated events → the expected final scene', () => {
    const s = drive(initialStep(base()))
    // The runner starts A ({status} only), then the MCP update completes it (the whole UpdateTaskRequest, nulls included).
    expect(s.send(ev({ entity_type: 'task', action: 'updated', entity_id: A, payload: { status: 'in_progress' } })).patches).toEqual([{ op: 'status', id: A, status: 'building' }])
    s.send(ev({ entity_type: 'task', action: 'updated', entity_id: A, payload: { status: 'completed', title: null, tags: null } }))
    // A task of another plan, an unknown task: nothing.
    expect(s.send(ev({ entity_type: 'task', action: 'created', entity_id: D, payload: { title: 'Elsewhere', plan_id: OTHER_PLAN } })).patches).toEqual([])
    expect(s.send(ev({ entity_type: 'task', action: 'updated', entity_id: D, payload: { status: 'failed' } })).patches).toEqual([])
    // A new task of this plan: added, and the plan re-read for its dependencies.
    const created = s.send(ev({ entity_type: 'task', action: 'created', entity_id: C, payload: { title: 'Ship', plan_id: PLAN } }))
    expect(created.refetch).toBe(true)
    expect(created.patches).toEqual([{ op: 'add', id: C, mech: pieceFor({ title: 'Ship', tags: [] }), label: 'Ship', status: 'planned' }])
    // Its dependency, then B starts and fails, a lifecycle status change, a renamed task.
    expect(s.send(ev({ entity_type: 'task', action: 'linked', entity_id: C, payload: { depends_on: B } })).patches).toEqual([{ op: 'link', id: C, after: B }])
    s.send(ev({ entity_type: 'task', action: 'updated', entity_id: B, payload: { status: 'in_progress' } }))
    s.send(ev({ entity_type: 'task', action: 'status_changed', entity_id: B, payload: { new_status: 'failed' } }))
    expect(s.send(ev({ entity_type: 'task', action: 'updated', entity_id: C, payload: { title: 'Ship it', status: null } })).patches).toEqual([{ op: 'label', id: C, label: 'Ship it' }])
    // A commit and a note linked to a task: a particle.
    expect(s.send(ev({ entity_type: 'commit', action: 'linked', entity_id: 'abc123', related: { entity_type: 'task', entity_id: A } })).patches).toEqual([{ op: 'pulse', id: A }])
    expect(s.send(ev({ entity_type: 'note', action: 'linked', entity_id: id(9), payload: { entity_type: 'task', entity_id: B } })).patches).toEqual([{ op: 'pulse', id: B }])
    expect(s.send(ev({ entity_type: 'note', action: 'linked', entity_id: id(9), payload: { entity_type: 'plan', entity_id: PLAN } })).patches).toEqual([])
    expect(s.resets).toBe(0)
    expect(s.statuses()).toEqual({ [A]: 'done', [B]: 'failed', [C]: 'planned' })
    expect(s.L.stations.find((x) => x.id === C)).toMatchObject({ label: 'Ship it', after: [B] })
    // Interrupted → planned again.
    s.send(ev({ entity_type: 'task', action: 'updated', entity_id: B, payload: { status: 'interrupted' } }))
    expect(s.statuses()[B]).toBe('planned')
  })

  it('a deleted task or a removed dependency: the scene is rebuilt without it', () => {
    const s = drive(initialStep(base()))
    const un = s.send(ev({ entity_type: 'task', action: 'unlinked', entity_id: B, payload: { depends_on: A } }))
    expect(un.reset).toBe(true)
    expect(s.L.stations.find((x) => x.id === B)?.after).toEqual([])
    const del = s.send(ev({ entity_type: 'task', action: 'deleted', entity_id: A }))
    expect(del.reset).toBe(true)
    expect(s.L.stations.map((x) => x.id)).toEqual([B])
    // `deleted` has no payload on the wire.
    expect(s.send({ entity_type: 'task', action: 'deleted', entity_id: B, timestamp: '' } as unknown as CrudEvent).reset).toBe(true)
    expect(s.L.stations).toHaveLength(0)
  })

  it('a fresh read of the plan (after a creation) brings its dependencies and tags', () => {
    const s = drive(initialStep(base()))
    s.send(ev({ entity_type: 'task', action: 'created', entity_id: C, payload: { title: 'Ship', plan_id: PLAN } }))
    const fresh = modelFromGraph(PLAN, graph([{ id: A, title: 'Plan' }, { id: B, title: 'Build' }, { id: C, title: 'Ship' }], [[B, A], [C, B]]))
    const step = toModel(s.state, fresh)
    expect(step.reset).toBe(false)
    expect(step.patches).toEqual([{ op: 'link', id: C, after: B }])
  })

  it('diffView: nothing changed, nothing sent', () => {
    const v = viewOf(base()).stations
    expect(diffView(v, v)).toEqual({ reset: false, patches: [] })
  })
})
