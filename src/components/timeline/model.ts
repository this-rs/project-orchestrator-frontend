/**
 * The timeline of a conversation, as data.
 *
 * Pure: no DOM, no request. It reads what the page already holds and answers
 * the questions the horizontal strip and the detail page share:
 *   - what happened, in order, and what is still running (`TimelineItem`);
 *   - which conversation each item belongs to (`TimelineLane`, the same
 *     parent → child organisation as the conversation list);
 *   - on which provider and model each part ran, and which routing decision
 *     chose it (score, reason, the candidates that lost);
 *   - the work it serves: plan → task → step;
 *   - how an item traces back to what caused it (`chainOf`).
 */
import type { ChatMessage, ContentBlock } from '@/types'
import type { RoutingDecision } from '@/types/routing'

/** `unknown`: a call that never got a result and is not being streamed (a background task, an interrupted call). */
export type TimelineStatus = 'running' | 'done' | 'error' | 'blocked' | 'cancelled' | 'pending' | 'unknown'
export type TimelineKind = 'request' | 'tool' | 'agent' | 'permission' | 'error' | 'marker' | 'run' | 'routing' | 'plan' | 'task' | 'step'

export interface TimelineItem {
  /** Stable across renders: the tool call id, or the message/block id. */
  id: string
  kind: TimelineKind
  status: TimelineStatus
  /** One line: tool name + the most telling input, or the first line of the request. */
  label: string
  /** Epoch ms. */
  startedAt: number
  endedAt?: number
  durationMs?: number
  /** The lane this item belongs to. */
  laneId: string
  /** The item that directly caused this one (a sub-agent's tool calls point at their agent). */
  parentId?: string
  /** The user request of the turn this item belongs to. */
  requestId?: string
  /** `data-tool-call-id` of the transcript block, to scroll to it. */
  anchorId?: string
  /** Child session to open, for a detached run. */
  sessionId?: string
  /** Provider instance and model in force when this happened. */
  provider?: string
  model?: string
  /** The routing decision behind this item (on a request and on its `routing` item). */
  routing?: RoutingDecision
  input?: unknown
  output?: string
  /**
   * What the engine's `tool_timing` says of a call's run: `ran` (the bar is the
   * run), `denied` (the permission was refused: it never ran) or `unseen` (the
   * engine took the call up but did not see it start). Absent without a timing,
   * and when a missing start is the normal case: an engine with no hook (it sees
   * no take-up either), a question (answered by its result), a permission never
   * answered, a timing already marked incomplete.
   */
  run?: 'ran' | 'denied' | 'unseen'
  /** The engine's timing may have missed a wait (`tool_timing.incomplete`). */
  timingIncomplete?: boolean
}

export interface TimelineLaneContext {
  provider?: string
  model?: string
  /** Which rule chose them (`request`, `project_rule`, `auto`…). */
  routedBy?: string
  routingMode?: string
  routeReason?: string
}

export interface TimelineLane {
  id: string
  title: string
  items: TimelineItem[]
  context?: TimelineLaneContext
  /** The lane this one was spawned from (a child session hangs below its parent's lane). */
  parentLaneId?: string
  /** How this lane relates to the conversation the reader opened. */
  relation?: 'work' | 'root' | 'child' | 'relay'
  /** The lane as one span (a child session: from its first event to its last). */
  span?: TimelineItem
}

export interface TimelineRunInput {
  sessionId: string
  title: string
  isStreaming: boolean
  startedAt: string
}

export interface TimelineWorkStep {
  id: string
  description: string
  status: string
  order?: number
}
export interface TimelineWorkTask {
  id: string
  title: string
  status: string
  planId?: string
  createdAt?: string
  steps: ReadonlyArray<TimelineWorkStep>
}
export interface TimelineWorkPlan {
  id: string
  title: string
  status?: string
}
/** The plan(s), task(s) and steps the conversation is linked to. */
export interface TimelineWork {
  plans: ReadonlyArray<TimelineWorkPlan>
  tasks: ReadonlyArray<TimelineWorkTask>
}

export interface TimelineInput {
  messages: ReadonlyArray<ChatMessage>
  sessionId: string
  title?: string
  isStreaming?: boolean
  runs?: ReadonlyArray<TimelineRunInput>
  /** How the session was opened: provider, model, and the rule that chose them. */
  session?: TimelineLaneContext
  /** Routing decisions; only those of this session are used. */
  decisions?: ReadonlyArray<RoutingDecision>
  work?: TimelineWork
  now?: number
}

export interface Timeline {
  lanes: TimelineLane[]
  /** Every item, all lanes, by start time. */
  items: TimelineItem[]
  runningCount: number
}

const LABEL_MAX = 72
const SUBAGENT_TOOL = /^(task|agent)$/i
const QUESTION_TOOL = /^AskUserQuestion$/
/** A decision is recorded a little before the request it serves reaches the transcript. */
const DECISION_SLACK_MS = 2000

function clip(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''
  return line.length > LABEL_MAX ? `${line.slice(0, LABEL_MAX - 1)}…` : line
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** `claude-sonnet-4-5-20250929` → `sonnet-4-5`. */
export function shortModel(model?: string | null): string {
  return (model ?? '').replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  const hint = [input.description, input.command, input.file_path, input.path, input.pattern, input.query, input.url, input.subagent_type, input.prompt]
    .map(str)
    .find(Boolean)
  return hint ? `${name} · ${clip(hint)}` : name
}

/** The run of a call as the engine saw it (`tool_timing`), all in epoch ms on the server's clock. */
interface EngineRun {
  /** The tool started running. Absent when it never ran or the engine did not see it start. */
  start?: number
  end: number
  /** The model announced the call (`called_at`). */
  called?: number
  /** The engine took the call up (`started_at`, its PreToolUse hook). */
  takenUp: boolean
  /** The wait for the user: asked, answered. */
  asked?: number
  answered?: number
  denied: boolean
  incomplete: boolean
}

const secondsToMs = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v * 1000 : undefined)

/**
 * The run of a call from its `tool_timing` (seconds), or `null` without one.
 * A denied call never ran: a `run_started_at` on it (sent by an older backend,
 * equal to the answer) is not a run and is ignored.
 */
function engineRun(timing: unknown): EngineRun | null {
  if (!timing || typeof timing !== 'object') return null
  const t = timing as Record<string, unknown>
  const end = secondsToMs(t.ended_at)
  if (end == null) return null
  const denied = t.permission_outcome === 'denied'
  const start = denied ? undefined : secondsToMs(t.run_started_at)
  return {
    ...(start != null && { start }),
    end,
    ...(secondsToMs(t.called_at) != null && { called: secondsToMs(t.called_at) }),
    ...(secondsToMs(t.permission_requested_at) != null && { asked: secondsToMs(t.permission_requested_at) }),
    ...(secondsToMs(t.permission_resolved_at) != null && { answered: secondsToMs(t.permission_resolved_at) }),
    takenUp: secondsToMs(t.started_at) != null,
    denied,
    incomplete: t.incomplete === true,
  }
}

/**
 * Draw a call from its engine run. With a run start, the bar is the run. Without
 * one (denied, never answered, not seen), the call did not run as far as the
 * engine knows: the bar goes from its announcement (the engine's `called_at`
 * when there is one, so both ends are server times) to its end, and when the
 * end comes before that start (two clocks), it gets no duration at all rather
 * than a made-up 0 ms.
 */
function applyEngineRun(item: TimelineItem, run: EngineRun, isQuestion: boolean): void {
  if (run.start != null) {
    item.startedAt = run.start
    item.endedAt = Math.max(run.end, run.start)
    item.durationMs = item.endedAt - item.startedAt
    item.run = 'ran'
  } else {
    if (run.called != null) item.startedAt = run.called
    if (run.end >= item.startedAt) {
      item.endedAt = run.end
      item.durationMs = run.end - item.startedAt
    } else {
      delete item.endedAt
      delete item.durationMs
    }
    if (run.denied) {
      item.run = 'denied'
      // Refused, not failed: the call never ran.
      item.status = 'cancelled'
    } else if (run.takenUp && !isQuestion && !run.incomplete && !(run.asked != null && run.answered == null)) {
      item.run = 'unseen'
    }
  }
  if (run.incomplete) item.timingIncomplete = true
}

function blockTime(block: ContentBlock, fallback: number): number {
  const iso = block.metadata?.created_at
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : fallback
}

/** Task and step statuses of the work graph, in the timeline's words. */
export function workStatus(status?: string): TimelineStatus {
  switch (status) {
    case 'completed':
    case 'approved':
      return 'done'
    case 'in_progress':
      return 'running'
    case 'failed':
      return 'error'
    case 'blocked':
      return 'blocked'
    case 'skipped':
    case 'cancelled':
    case 'interrupted':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function buildWorkLane(work: TimelineWork, sessionId: string): { lane: TimelineLane; activeTaskId?: string } | null {
  if (work.plans.length === 0 && work.tasks.length === 0) return null
  const laneId = `work:${sessionId}`
  const items: TimelineItem[] = []
  const planIds = new Set(work.plans.map((p) => p.id))
  for (const plan of work.plans) {
    items.push({ id: plan.id, kind: 'plan', status: workStatus(plan.status), label: plan.title, startedAt: 0, laneId })
  }
  for (const task of work.tasks) {
    const created = task.createdAt ? Date.parse(task.createdAt) : NaN
    items.push({
      id: task.id,
      kind: 'task',
      status: workStatus(task.status),
      label: task.title,
      startedAt: Number.isFinite(created) ? created : 0,
      laneId,
      parentId: task.planId && planIds.has(task.planId) ? task.planId : undefined,
    })
    const steps = [...task.steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    steps.forEach((step) => {
      items.push({ id: step.id, kind: 'step', status: workStatus(step.status), label: clip(step.description), startedAt: 0, laneId, parentId: task.id, input: step.description })
    })
  }
  const active = work.tasks.find((t) => t.status === 'in_progress') ?? (work.tasks.length === 1 ? work.tasks[0] : undefined)
  return { lane: { id: laneId, title: 'Plan · Task · Step', items }, activeTaskId: active?.id }
}

/** Build the lanes and the flat item list. */
export function buildTimeline(input: TimelineInput): Timeline {
  const { messages, sessionId, isStreaming = false } = input
  const now = input.now ?? Date.now()
  const mainLane: TimelineLane = { id: sessionId, title: input.title?.trim() || 'Conversation', items: [], context: input.session }
  const byId = new Map<string, TimelineItem>()
  /** `tool_timing` of each call (on its tool_use block), when the backend sent one. */
  const timings = new Map<string, unknown>()
  /** Calls that ask the user a question: the engine never sees them start, by design. */
  const questionCalls = new Set<string>()
  /** Permission items and the call each one is about, to place them once every timing is known. */
  const permissions: Array<{ item: TimelineItem; callId: string }> = []
  let requestId: string | undefined
  /** The time of the latest thing seen in the current turn, to close the turn's span. */
  let turnLast = 0
  let provider = input.session?.provider
  let model = input.session?.model

  const push = (item: TimelineItem) => {
    mainLane.items.push(item)
    byId.set(item.id, item)
  }
  /** A turn is over when the next request comes: its span ends at the last thing it did. */
  const closeTurn = () => {
    const req = requestId ? byId.get(requestId) : undefined
    if (req && req.endedAt == null && turnLast > req.startedAt) {
      req.endedAt = turnLast
      req.durationMs = turnLast - req.startedAt
    }
  }
  /** Where an item ran: the provider and model in force right now. */
  const ran = () => ({ ...(provider && { provider }), ...(model && { model }) })

  messages.forEach((msg, mi) => {
    const msgTime = msg.timestamp.getTime()
    if (msg.role === 'user') {
      const text = msg.blocks.map((b) => b.content).join('\n')
      closeTurn()
      requestId = `request:${msg.id}`
      turnLast = msgTime
      push({
        id: requestId,
        kind: 'request',
        status: 'done',
        label: clip(text) || 'Request',
        startedAt: msgTime,
        laneId: sessionId,
        input: text,
        ...ran(),
      })
      return
    }
    const isLastMessage = mi === messages.length - 1
    turnLast = Math.max(turnLast, msgTime)
    for (const block of msg.blocks) {
      turnLast = Math.max(turnLast, blockTime(block, msgTime))
      const callId = str(block.metadata?.tool_call_id) ?? block.id
      const parentCall = str(block.metadata?.parent_tool_use_id)
      const parentId = parentCall && parentCall !== callId ? parentCall : requestId
      if (block.type === 'system_init') {
        model = str(block.metadata?.model) ?? model
        provider = str(block.metadata?.provider) ?? provider
        // The request that opened the session was stamped before the CLI told us its model.
        const opener = requestId ? byId.get(requestId) : undefined
        if (opener && !opener.model && model) opener.model = model
        if (opener && !opener.provider && provider) opener.provider = provider
      } else if (block.type === 'tool_use') {
        if (block.metadata?.tool_timing) {
          timings.set(callId, block.metadata.tool_timing)
          // The turn lasts at least until the engine said the call ended.
          const run = engineRun(block.metadata.tool_timing)
          if (run) turnLast = Math.max(turnLast, run.end)
        }
        const name = str(block.metadata?.tool_name) ?? block.content
        if (QUESTION_TOOL.test(name) || block.metadata?.tool_canonical === 'AskUserQuestion') questionCalls.add(callId)
        const toolInput = (block.metadata?.tool_input as Record<string, unknown> | undefined) ?? {}
        push({
          id: callId,
          kind: SUBAGENT_TOOL.test(name) ? 'agent' : 'tool',
          // Still open until a result arrives; a finished turn leaves no call running.
          status: isStreaming && isLastMessage ? 'running' : 'unknown',
          label: toolLabel(name, toolInput),
          startedAt: blockTime(block, msgTime),
          laneId: sessionId,
          parentId,
          requestId,
          anchorId: callId,
          input: toolInput,
          ...ran(),
        })
      } else if (block.type === 'tool_result') {
        const item = byId.get(callId)
        if (!item) continue
        const failed = block.metadata?.is_error === true
        const cancelled = block.metadata?.is_cancelled === true
        item.status = cancelled ? 'cancelled' : failed ? 'error' : 'done'
        item.output = block.content
        const duration = block.metadata?.duration_ms
        const run = engineRun(timings.get(callId))
        if (run) {
          // The engine's own times: the run starts when the tool really started
          // (after a permission's answer), not when the model announced the call.
          applyEngineRun(item, run, questionCalls.has(callId))
        } else if (typeof duration === 'number') {
          item.durationMs = duration
          item.endedAt = item.startedAt + duration
        } else {
          item.endedAt = blockTime(block, item.startedAt)
          item.durationMs = Math.max(0, item.endedAt - item.startedAt)
        }
      } else if (block.type === 'permission_request' || block.type === 'ask_user_question') {
        // The call it is about: `tool_use_id` when the engine gave it (the control id is not the call's).
        const aboutCall = str(block.metadata?.tool_use_id) ?? callId
        const permission: TimelineItem = {
          id: `${block.type}:${callId}`,
          kind: 'permission',
          // The control id of a permission is not the tool call's id: the assembler stamps the answer on the block itself.
          status: block.metadata?.decided === true || block.metadata?.submitted === true
            ? (block.metadata?.decision === 'denied' ? 'cancelled' : 'done')
            : 'blocked',
          label: clip(block.content) || 'Waiting for you',
          startedAt: blockTime(block, msgTime),
          laneId: sessionId,
          parentId: byId.has(aboutCall) ? aboutCall : requestId,
          requestId,
          anchorId: aboutCall,
          ...ran(),
        }
        push(permission)
        permissions.push({ item: permission, callId: aboutCall })
      } else if (block.type === 'error' || block.type === 'result_error') {
        push({
          id: block.id,
          kind: 'error',
          status: 'error',
          label: clip(block.content) || 'Error',
          startedAt: blockTime(block, msgTime),
          laneId: sessionId,
          parentId: requestId,
          requestId,
          output: block.content,
          ...ran(),
        })
      } else if (block.type === 'model_changed') {
        const next = str(block.metadata?.model) ?? clip(block.content)
        const reason = str(block.metadata?.reason)
        model = next
        push({
          id: block.id,
          kind: 'marker',
          status: 'done',
          label: `Model → ${shortModel(next)}`,
          startedAt: blockTime(block, msgTime),
          laneId: sessionId,
          requestId,
          output: reason,
          ...ran(),
        })
      } else if (block.type === 'conversation_relayed') {
        const to = str(block.metadata?.to_provider)
        push({
          id: block.id,
          kind: 'marker',
          status: 'done',
          label: clip(block.content) || `→ ${to ?? ''}`,
          startedAt: blockTime(block, msgTime),
          laneId: sessionId,
          requestId,
          ...(str(block.metadata?.to_session_id) !== sessionId && str(block.metadata?.to_session_id) ? { sessionId: str(block.metadata?.to_session_id) } : {}),
          ...ran(),
        })
      } else if (block.type === 'compact_boundary') {
        push({
          id: block.id,
          kind: 'marker',
          status: 'done',
          label: 'Context compacted',
          startedAt: blockTime(block, msgTime),
          laneId: sessionId,
          requestId,
          ...ran(),
        })
      }
    }
    // The result of a turn says how long it took.
    if (msg.duration_ms != null && requestId) {
      const req = byId.get(requestId)
      if (req) {
        const end = Math.max(req.startedAt + msg.duration_ms, turnLast)
        req.endedAt = Math.max(req.endedAt ?? 0, end)
        req.durationMs = req.endedAt - req.startedAt
      }
    }
    if (isLastMessage && isStreaming && msg.duration_ms == null && requestId) {
      // The turn is still going: its span grows until the result comes.
      const req = byId.get(requestId)
      if (req) req.status = 'running'
    }
    if (isLastMessage && msg.duration_ms != null) {
      // The turn is over. A call with no result is not known to be running: it may be a background task. Only the last message can hold a running call, so only it is scanned.
      for (const item of mainLane.items) {
        if (item.requestId === requestId && item.status === 'running') item.status = 'unknown'
      }
    }
  })

  // A permission the engine timed is the wait it measured: asked → answered, on
  // the server's clock. It hangs below its call only when it falls inside it:
  // the run of an allowed call starts at the answer, so the wait comes before
  // the call's bar and goes beside it, under what the call hangs from. Only a
  // wait the engine dated (`asked`) moves beside: without it the permission's
  // time is the block's, not comparable with an engine run.
  for (const { item, callId } of permissions) {
    const run = engineRun(timings.get(callId))
    if (run?.asked != null) item.startedAt = run.asked
    if (run?.answered != null && run.answered >= item.startedAt) {
      item.endedAt = run.answered
      item.durationMs = run.answered - item.startedAt
      if (item.status === 'blocked') item.status = run.denied ? 'cancelled' : 'done'
    }
    const call = item.parentId ? byId.get(item.parentId) : undefined
    if (call && call.id === callId && run?.asked != null && item.startedAt < call.startedAt) item.parentId = call.parentId ?? call.requestId
  }

  // A turn the stream left without a result (an older page, an interrupted turn) still ends at its last event.
  const lastReq = requestId ? byId.get(requestId) : undefined
  if (lastReq && isStreaming && messages[messages.length - 1]?.role === 'user') lastReq.status = 'running'
  if (lastReq?.status !== 'running') closeTurn()

  // Routing: one item per recorded decision, under the request it served.
  const requests = mainLane.items.filter((i) => i.kind === 'request')
  for (const d of input.decisions ?? []) {
    if (d.session_id !== sessionId) continue
    const at = Date.parse(d.at)
    if (!Number.isFinite(at)) continue
    const served = [...requests].reverse().find((r) => r.startedAt <= at + DECISION_SLACK_MS) ?? requests[0]
    const score = d.score != null ? ` · ${d.score.toFixed(2)}` : ''
    const shadow = d.applied ? '' : ' (not applied)'
    if (served && !served.routing) {
      served.routing = d
      if (d.applied) {
        served.provider = d.provider_id
        if (d.model) served.model = d.model
      }
    }
    push({
      id: `routing:${d.id}`,
      kind: 'routing',
      status: d.applied ? 'done' : 'cancelled',
      label: `${d.provider_id}${d.model ? ` / ${shortModel(d.model)}` : ''}${score}${shadow}`,
      startedAt: served ? Math.max(at, served.startedAt + 1) : at,
      laneId: sessionId,
      parentId: served?.id,
      requestId: served?.id,
      provider: d.provider_id,
      ...(d.model && { model: d.model }),
      routing: d,
      output: d.reason,
    })
  }
  mainLane.items.sort((a, b) => a.startedAt - b.startedAt)

  const lanes: TimelineLane[] = []
  const work = input.work ? buildWorkLane(input.work, sessionId) : null
  if (work) {
    lanes.push(work.lane)
    // The conversation serves the task in progress: its requests hang below it.
    if (work.activeTaskId) for (const r of requests) r.parentId = work.activeTaskId
  }
  lanes.push(mainLane)
  for (const run of input.runs ?? []) {
    const startedAt = Date.parse(run.startedAt)
    lanes.push({
      id: run.sessionId,
      title: run.title,
      items: [{
        id: `run:${run.sessionId}`,
        kind: 'run',
        status: run.isStreaming ? 'running' : 'done',
        label: run.title,
        startedAt: Number.isFinite(startedAt) ? startedAt : now,
        laneId: run.sessionId,
        sessionId: run.sessionId,
      }],
    })
  }

  const items = lanes.flatMap((l) => l.items).sort((a, b) => a.startedAt - b.startedAt)
  return { lanes, items, runningCount: items.filter((i) => i.status === 'running').length }
}

/**
 * The path from the root (plan, task or request) to `id`, then everything that
 * hangs below `id`. `upstream` is ordered root → … → parent; `downstream` is
 * breadth-first.
 */
export function chainOf(items: ReadonlyArray<TimelineItem>, id: string): { upstream: TimelineItem[]; downstream: TimelineItem[] } {
  const byId = new Map(items.map((i) => [i.id, i]))
  const upstream: TimelineItem[] = []
  const seen = new Set<string>([id])
  let cursor = byId.get(id)?.parentId
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const parent = byId.get(cursor)
    if (!parent) break
    upstream.unshift(parent)
    cursor = parent.parentId
  }
  const downstream: TimelineItem[] = []
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const item of items) {
      if (item.parentId === current && !seen.has(item.id)) {
        seen.add(item.id)
        downstream.push(item)
        queue.push(item.id)
      }
    }
  }
  return { upstream, downstream }
}
