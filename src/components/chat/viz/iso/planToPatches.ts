/**
 * A plan and its tasks → the patches of a LIVE scene (`src/vendor/three-iso/live.ts`).
 * PURE: no fetch, no clock, no React. Part of the LAZY chunk (it reads the engine's
 * `meaning.ts`); `LivePlanViz` feeds it the plan read over REST and the CrudEvents of the
 * WebSocket bus, and applies what it returns to the scene.
 *
 * - The plan is kept as a MODEL (tasks, statuses, dependencies). Every event updates the
 *   model; the scene is then brought to the model's VIEW by a diff (`diffView`), so the
 *   initial state and the later events go through the same path.
 * - At most 12 stations (the engine's ceiling): beyond, the 12 most relevant tasks are
 *   shown (in progress, failed, next ready, last finished, then the rest), the others
 *   are counted (`hidden`). Shown stations keep the plan's order.
 * - The engine cannot remove a station nor a dependency: a view that loses one is
 *   rebuilt from scratch (`reset`).
 *
 * Where the statuses come from (backend, read in its code):
 *   task created   `{entity_type:'task', action:'created', payload:{title, plan_id}}`
 *                  (dependencies and tags are not in the event: `refetch` asks for the graph)
 *   task updated   `{entity_type:'task', action:'updated', payload:{status?, title?, tags?…}}`
 *                  — the UpdateTaskRequest (null fields included) or, from the runner, `{status}`
 *   status change  `{entity_type:'task', action:'status_changed', payload:{new_status}}` (lifecycle)
 *   task deleted   `{entity_type:'task', action:'deleted'}` (no payload)
 *   dependency     `{entity_type:'task', action:'linked'|'unlinked', payload:{depends_on}}`
 *   commit → task  `{entity_type:'commit', action:'linked', related:{entity_type:'task', entity_id}}`
 *   note → task    `{entity_type:'note', action:'linked', payload:{entity_type:'task', entity_id}}`
 */
import type { CrudEvent, DependencyGraph } from '@/types'
import type { LivePatch, LiveStatus } from '@/vendor/three-iso/live'
import type { MechId } from '@/vendor/three-iso/mechanisms'
import { piecesFor } from '@/vendor/three-iso/meaning'

/** The engine's ceiling of stations in a live scene. */
export const LIVE_MAX_STATIONS = 12
/** The piece of a task whose title and tags name nothing of the catalogue. */
export const DEFAULT_MECH: MechId = 'dependency-graph'
const MAX_LABEL = 60

export interface LiveTask {
  id: string
  title: string
  tags: string[]
  /** The server's status (`pending`, `in_progress`, `blocked`, `completed`, `failed`, `interrupted`). */
  status: string
  /** Ids of the tasks this one waits for. */
  after: string[]
  /** When it was completed (ms since epoch, 0 = unknown): orders the « last finished ». */
  doneAt: number
}

export interface PlanModel {
  planId: string
  tasks: LiveTask[]
}

/** What the scene shows of one task. */
export interface ShownStation {
  id: string
  mech: MechId
  label: string
  status: LiveStatus
  after: string[]
}

export interface PlanView {
  stations: ShownStation[]
  /** Tasks of the plan not shown (beyond the ceiling). */
  hidden: number
}

/** The server's task status → the scene's. Unknown → planned. */
export function toLiveStatus(status: unknown): LiveStatus {
  switch (status) {
    case 'in_progress':
      return 'building'
    case 'completed':
      return 'done'
    case 'failed':
      return 'failed'
    default:
      // pending, blocked, interrupted (waits for somebody to resume it), unknown.
      return 'planned'
  }
}

/** The library mechanism that illustrates a task, read in its title and tags. */
export function pieceFor(task: Pick<LiveTask, 'title' | 'tags'>): MechId {
  const hit = piecesFor([task.title, ...task.tags].join(' '), 10).find((m) => m.kind === 'mechanism')
  return hit ? (hit.id as MechId) : DEFAULT_MECH
}

const labelOf = (t: LiveTask): string => (t.title.trim() || t.id.slice(0, 8)).slice(0, MAX_LABEL)

/** The model of a plan read over REST: its dependency graph (tasks + edges), and the completion dates when known. */
export function modelFromGraph(planId: string, graph: DependencyGraph, completedAt: Readonly<Record<string, string | undefined>> = {}): PlanModel {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const ids = new Set(nodes.map((n) => n.id))
  const after = new Map<string, string[]>()
  // An edge `from → to`: `from` DEPENDS_ON `to` (backend `get_plan_dependency_graph`).
  for (const e of Array.isArray(graph?.edges) ? graph.edges : []) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue
    const list = after.get(e.from) ?? []
    if (!list.includes(e.to)) list.push(e.to)
    after.set(e.from, list)
  }
  return {
    planId,
    tasks: nodes.map((n) => {
      const at = completedAt[n.id]
      return {
        id: n.id,
        title: typeof n.title === 'string' ? n.title : '',
        tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === 'string') : [],
        status: String(n.status ?? 'pending'),
        after: after.get(n.id) ?? [],
        doneAt: at ? Date.parse(at) || 0 : 0,
      }
    }),
  }
}

/** A fresh read of the plan, keeping what the model learnt that the server does not say (completion instants). */
export function mergeModel(prev: PlanModel, fresh: PlanModel): PlanModel {
  const before = new Map(prev.tasks.map((t) => [t.id, t]))
  return { ...fresh, tasks: fresh.tasks.map((t) => ({ ...t, doneAt: t.doneAt || before.get(t.id)?.doneAt || 0 })) }
}

/** Relevance tier of a task (lower first): in progress, failed, ready, finished, the rest. */
function tier(t: LiveTask, byId: Map<string, LiveTask>): number {
  if (t.status === 'in_progress') return 0
  if (t.status === 'failed') return 1
  if ((t.status === 'pending' || t.status === 'blocked') && t.after.every((d) => byId.get(d)?.status === 'completed')) return 2
  if (t.status === 'completed') return 3
  return 4
}

/** What the scene shows of the model: every task up to the ceiling, else the most relevant ones, in the plan's order. */
export function viewOf(model: PlanModel, max = LIVE_MAX_STATIONS): PlanView {
  const byId = new Map(model.tasks.map((t) => [t.id, t]))
  let kept = model.tasks
  if (kept.length > max) {
    const ranked = model.tasks
      .map((t, i) => ({ t, i, k: tier(t, byId) }))
      // Within « finished », the last finished first; elsewhere the plan's order.
      .sort((a, b) => a.k - b.k || (a.k === 3 ? b.t.doneAt - a.t.doneAt : 0) || a.i - b.i)
      .slice(0, max)
    const keep = new Set(ranked.map((r) => r.t.id))
    kept = model.tasks.filter((t) => keep.has(t.id))
  }
  const shown = new Set(kept.map((t) => t.id))
  return {
    stations: kept.map((t) => ({ id: t.id, mech: pieceFor(t), label: labelOf(t), status: toLiveStatus(t.status), after: t.after.filter((d) => shown.has(d)) })),
    hidden: model.tasks.length - kept.length,
  }
}

const addOf = (s: ShownStation): LivePatch => ({ op: 'add', id: s.id, mech: s.mech, label: s.label, status: s.status, ...(s.after.length ? { after: [...s.after] } : {}) })

/**
 * The patches that bring a scene showing `prev` to `next`. `reset`: the engine cannot
 * get there (a station or a dependency is gone): build a new scene with `patches`, which
 * then hold the whole of `next`. A station keeps its piece when its task is renamed (no
 * rebuild for a title): the new piece shows at the next rebuild only.
 */
export function diffView(prev: readonly ShownStation[] | null, next: readonly ShownStation[]): { reset: boolean; patches: LivePatch[] } {
  if (!prev) return { reset: false, patches: next.map(addOf) }
  const was = new Map(prev.map((s) => [s.id, s]))
  const now = new Set(next.map((s) => s.id))
  const lost = prev.some((s) => !now.has(s.id)) || next.some((s) => {
    const p = was.get(s.id)
    return !!p && p.after.some((a) => !s.after.includes(a))
  })
  if (lost) return { reset: true, patches: next.map(addOf) }
  const patches: LivePatch[] = []
  for (const s of next) {
    const p = was.get(s.id)
    if (!p) {
      patches.push(addOf(s))
      continue
    }
    if (p.label !== s.label) patches.push({ op: 'label', id: s.id, label: s.label })
    if (p.status !== s.status) patches.push({ op: 'status', id: s.id, status: s.status })
    for (const a of s.after) if (!p.after.includes(a)) patches.push({ op: 'link', id: s.id, after: a })
  }
  return { reset: false, patches }
}

/** What an event does to the model: the new model, tasks to pulse, and whether to re-read the plan. */
export interface EventEffect {
  model: PlanModel
  pulse: string[]
  /** The event announces something the model cannot complete from it (a new task: its dependencies, its tags). */
  refetch: boolean
  /** The event concerned this plan. */
  relevant: boolean
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** One CrudEvent of the bus applied to the model. An event of another plan, or of anything else, changes nothing. */
export function applyEvent(model: PlanModel, event: CrudEvent, nowMs: number): EventEffect {
  const none: EventEffect = { model, pulse: [], refetch: false, relevant: false }
  if (!event || typeof event !== 'object') return none
  const payload: Record<string, unknown> = event.payload && typeof event.payload === 'object' ? event.payload : {}
  const id = str(event.entity_id) ?? ''
  const known = (x: string | undefined) => !!x && model.tasks.some((t) => t.id === x)
  const edit = (fn: (t: LiveTask) => LiveTask | null): PlanModel => ({
    ...model,
    tasks: model.tasks.flatMap((t) => {
      const r = t.id === id ? fn(t) : t
      return r ? [r] : []
    }),
  })
  const at = Date.parse(str(event.timestamp) ?? '') || nowMs

  if (event.entity_type === 'task') {
    switch (event.action) {
      case 'created': {
        if (str(payload.plan_id) !== model.planId || known(id)) return none
        const task: LiveTask = { id, title: str(payload.title) ?? '', tags: [], status: 'pending', after: [], doneAt: 0 }
        return { model: { ...model, tasks: [...model.tasks, task] }, pulse: [], refetch: true, relevant: true }
      }
      case 'updated':
      case 'status_changed': {
        if (!known(id)) return none
        const status = str(payload.status) ?? str(payload.new_status)
        const title = str(payload.title)
        const tags = Array.isArray(payload.tags) ? payload.tags.filter((t): t is string => typeof t === 'string') : undefined
        return {
          model: edit((t) => ({
            ...t,
            ...(status ? { status } : {}),
            ...(title !== undefined ? { title } : {}),
            ...(tags ? { tags } : {}),
            ...(status === 'completed' && t.status !== 'completed' ? { doneAt: at } : {}),
          })),
          pulse: [],
          refetch: false,
          relevant: true,
        }
      }
      case 'deleted': {
        if (!known(id)) return none
        const tasks = model.tasks.filter((t) => t.id !== id).map((t) => (t.after.includes(id) ? { ...t, after: t.after.filter((a) => a !== id) } : t))
        return { model: { ...model, tasks }, pulse: [], refetch: false, relevant: true }
      }
      case 'linked':
      case 'unlinked': {
        const dep = str(payload.depends_on)
        if (!known(id) || !known(dep) || dep === id) return none
        const link = event.action === 'linked'
        return {
          model: edit((t) => ({ ...t, after: link ? (t.after.includes(dep!) ? t.after : [...t.after, dep!]) : t.after.filter((a) => a !== dep) })),
          pulse: [],
          refetch: false,
          relevant: true,
        }
      }
      default:
        return none
    }
  }

  // Something linked to a task of the plan: a particle from its station.
  if (event.action === 'linked') {
    const target =
      event.entity_type === 'commit' && event.related?.entity_type === 'task'
        ? event.related.entity_id
        : event.entity_type === 'note' && str(payload.entity_type)?.toLowerCase() === 'task'
          ? str(payload.entity_id)
          : undefined
    if (known(target)) return { model, pulse: [target!], refetch: false, relevant: true }
  }
  return none
}

/** The scene state the viz keeps: the model, and what the scene currently shows. */
export interface LivePlanState {
  model: PlanModel
  view: PlanView
}

export interface LiveStep {
  state: LivePlanState
  /** Build a new scene with `patches` (instead of applying them to the current one). */
  reset: boolean
  patches: LivePatch[]
  refetch: boolean
}

/** The initial state of a plan: every station added, with its status and its dependencies, in one batch. */
export function initialStep(model: PlanModel): LiveStep {
  const view = viewOf(model)
  return { state: { model, view }, reset: true, patches: diffView(null, view.stations).patches, refetch: false }
}

/** Bring the scene to a new model (a fresh read of the plan, or an event's result). */
export function toModel(state: LivePlanState, model: PlanModel, pulse: readonly string[] = []): LiveStep {
  const view = viewOf(model)
  const { reset, patches } = diffView(state.view.stations, view.stations)
  const shown = new Set(view.stations.map((s) => s.id))
  for (const id of pulse) if (shown.has(id)) patches.push({ op: 'pulse', id })
  return { state: { model, view }, reset, patches, refetch: false }
}

/** One CrudEvent → the patches of the scene. */
export function eventStep(state: LivePlanState, event: CrudEvent, nowMs: number): LiveStep {
  const fx = applyEvent(state.model, event, nowMs)
  if (!fx.relevant) return { state, reset: false, patches: [], refetch: false }
  return { ...toModel(state, fx.model, fx.pulse), refetch: fx.refetch }
}
