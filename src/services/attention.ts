import {
  BANDS,
  LINK_VIAS,
  SESSION_STATES,
  ATTENTION_RUN_STATUSES,
  REQUEST_KINDS,
  RUNNER_STATUSES,
  STUCK_REASONS,
  THINKING_KINDS,
  WAVE_POINT_STATUSES,
  type AttentionResponse,
} from '@/types/attention'
import { api, buildQuery } from './api'
import { rfcApi } from './rfcApi'
import { decisionsApi } from './decisions'

/**
 * Strict runtime reader for `GET /api/attention` payloads.
 *
 * Mirrors the Rust `deny_unknown_fields` DTOs: a missing field, a wrong type,
 * an unknown enum value (PascalCase included) or an extra field throws, so a
 * divergence between backend and frontend fails loudly instead of rendering
 * garbage. Used by the shared-fixture contract test.
 */

type Rec = Record<string, unknown>

function fail(path: string, why: string): never {
  throw new Error(`attention contract: ${path}: ${why}`)
}

function obj(v: unknown, path: string, keys: readonly string[]): Rec {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object')
  const r = v as Rec
  for (const k of keys) if (!(k in r)) fail(path, `missing field "${k}"`)
  for (const k of Object.keys(r)) if (!keys.includes(k)) fail(path, `unknown field "${k}"`)
  return r
}

const str = (v: unknown, p: string): string => (typeof v === 'string' ? v : fail(p, 'expected a string'))
const num = (v: unknown, p: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(p, 'expected a number'))
const nullable = <T>(v: unknown, p: string, f: (x: unknown, p: string) => T): T | null => (v === null ? null : f(v, p))
const list = <T>(v: unknown, p: string, f: (x: unknown, p: string) => T): T[] =>
  Array.isArray(v) ? v.map((x, i) => f(x, `${p}[${i}]`)) : fail(p, 'expected an array')
function oneOf<T extends string>(values: readonly T[]) {
  return (v: unknown, p: string): T =>
    typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fail(p, `unknown value ${JSON.stringify(v)}`)
}

const ref = (keys: readonly string[]) => (v: unknown, p: string) => {
  const r = obj(v, p, keys)
  return { id: str(r.id, `${p}.id`), title: str(r.title, `${p}.title`) }
}
const planRef = ref(['id', 'title'])
const taskRef = ref(['id', 'title'])

const LINK_KEYS = ['via', 'run_id', 'task_id', 'plan_id'] as const
const optStr = (r: Rec, k: string, p: string) => nullable(r[k], `${p}.${k}`, str)

const REQUEST_KEYS = [
  'request_id', 'kind', 'session_id', 'thread_id', 'workspace', 'tool_name', 'text', 'options', 'seq', 'requested_at', 'age_secs',
] as const

function request(r: Rec, p: string) {
  return {
    request_id: str(r.request_id, `${p}.request_id`),
    kind: oneOf(REQUEST_KINDS)(r.kind, `${p}.kind`),
    session_id: str(r.session_id, `${p}.session_id`),
    thread_id: nullable(r.thread_id, `${p}.thread_id`, str),
    workspace: str(r.workspace, `${p}.workspace`),
    tool_name: nullable(r.tool_name, `${p}.tool_name`, str),
    text: str(r.text, `${p}.text`),
    options: list(r.options, `${p}.options`, (o, op) => {
      const x = obj(o, op, ['label', 'description'])
      return { label: str(x.label, `${op}.label`), description: nullable(x.description, `${op}.description`, str) }
    }),
    seq: num(r.seq, `${p}.seq`),
    requested_at: str(r.requested_at, `${p}.requested_at`),
    age_secs: num(r.age_secs, `${p}.age_secs`),
  }
}

/** Parse and validate an `/api/attention` payload. Throws on any divergence. */
export function parseAttentionResponse(input: unknown): AttentionResponse {
  const r = obj(input, '$', ['generated_at', 'lanes', 'threads', 'waiting', 'orphans', 'runner', 'thinking', 'unattached'])
  return {
    generated_at: str(r.generated_at, '$.generated_at'),
    lanes: list(r.lanes, '$.lanes', (v, p) => {
      const x = obj(v, p, ['id', 'slug', 'name'])
      return { id: str(x.id, `${p}.id`), slug: str(x.slug, `${p}.slug`), name: str(x.name, `${p}.name`) }
    }),
    threads: list(r.threads, '$.threads', (v, p) => {
      const x = obj(v, p, [
        'id', 'title', 'workspace', 'band', 'stuck_reason', 'plan', 'run', 'session_ids', 'sessions', 'since', 'age_secs', 'waves', 'blocked_tasks', 'resume',
      ])
      return {
        id: str(x.id, `${p}.id`),
        title: str(x.title, `${p}.title`),
        workspace: str(x.workspace, `${p}.workspace`),
        band: oneOf(BANDS)(x.band, `${p}.band`),
        stuck_reason: nullable(x.stuck_reason, `${p}.stuck_reason`, oneOf(STUCK_REASONS)),
        plan: nullable(x.plan, `${p}.plan`, planRef),
        run: nullable(x.run, `${p}.run`, (rv, rp) => {
          const y = obj(rv, rp, ['id', 'status', 'started_at', 'duration_secs', 'cost_usd'])
          return {
            id: str(y.id, `${rp}.id`),
            status: oneOf(ATTENTION_RUN_STATUSES)(y.status, `${rp}.status`),
            started_at: str(y.started_at, `${rp}.started_at`),
            duration_secs: num(y.duration_secs, `${rp}.duration_secs`),
            cost_usd: num(y.cost_usd, `${rp}.cost_usd`),
          }
        }),
        session_ids: list(x.session_ids, `${p}.session_ids`, str),
        sessions: list(x.sessions, `${p}.sessions`, (sv, sp) => {
          const s = obj(sv, sp, ['id', 'title', 'state', 'links'])
          return {
            id: str(s.id, `${sp}.id`),
            title: str(s.title, `${sp}.title`),
            state: oneOf(SESSION_STATES)(s.state, `${sp}.state`),
            links: list(s.links, `${sp}.links`, (lv, lp) => {
              const l = obj(lv, lp, LINK_KEYS)
              return {
                via: oneOf(LINK_VIAS)(l.via, `${lp}.via`),
                run_id: optStr(l, 'run_id', lp),
                task_id: optStr(l, 'task_id', lp),
                plan_id: optStr(l, 'plan_id', lp),
              }
            }),
          }
        }),
        since: str(x.since, `${p}.since`),
        age_secs: num(x.age_secs, `${p}.age_secs`),
        waves: list(x.waves, `${p}.waves`, (wv, wp) => {
          const w = obj(wv, wp, ['wave_number', 'points'])
          return {
            wave_number: num(w.wave_number, `${wp}.wave_number`),
            points: list(w.points, `${wp}.points`, (pv, pp) => {
              const pt = obj(pv, pp, ['task_id', 'status'])
              return { task_id: str(pt.task_id, `${pp}.task_id`), status: oneOf(WAVE_POINT_STATUSES)(pt.status, `${pp}.status`) }
            }),
          }
        }),
        blocked_tasks: list(x.blocked_tasks, `${p}.blocked_tasks`, taskRef),
        resume: nullable(x.resume, `${p}.resume`, (rv, rp) => {
          const y = obj(rv, rp, ['done_count', 'skipped_blocked', 'rerun_count'])
          return {
            done_count: num(y.done_count, `${rp}.done_count`),
            skipped_blocked: list(y.skipped_blocked, `${rp}.skipped_blocked`, taskRef),
            rerun_count: num(y.rerun_count, `${rp}.rerun_count`),
          }
        }),
      }
    }),
    waiting: list(r.waiting, '$.waiting', (v, p) => request(obj(v, p, REQUEST_KEYS), p)),
    orphans: list(r.orphans, '$.orphans', (v, p) => {
      const x = obj(v, p, [...REQUEST_KEYS, 'cli_stopped_at'])
      return { ...request(x, p), cli_stopped_at: nullable(x.cli_stopped_at, `${p}.cli_stopped_at`, str) }
    }),
    runner: ((v, p) => {
      const x = obj(v, p, ['status', 'busy_with'])
      return {
        status: oneOf(RUNNER_STATUSES)(x.status, `${p}.status`),
        busy_with: nullable(x.busy_with, `${p}.busy_with`, (bv, bp) => {
          const y = obj(bv, bp, ['plan_id', 'plan_title', 'run_id', 'workspace', 'since'])
          return {
            plan_id: str(y.plan_id, `${bp}.plan_id`),
            plan_title: str(y.plan_title, `${bp}.plan_title`),
            run_id: str(y.run_id, `${bp}.run_id`),
            workspace: str(y.workspace, `${bp}.workspace`),
            since: str(y.since, `${bp}.since`),
          }
        }),
      }
    })(r.runner, '$.runner'),
    thinking: list(r.thinking, '$.thinking', (v, p) => {
      const x = obj(v, p, ['id', 'kind', 'title', 'workspace', 'status', 'thread_id', 'since', 'age_secs'])
      return {
        id: str(x.id, `${p}.id`),
        kind: oneOf(THINKING_KINDS)(x.kind, `${p}.kind`),
        title: str(x.title, `${p}.title`),
        workspace: nullable(x.workspace, `${p}.workspace`, str),
        status: str(x.status, `${p}.status`),
        thread_id: nullable(x.thread_id, `${p}.thread_id`, str),
        since: str(x.since, `${p}.since`),
        age_secs: num(x.age_secs, `${p}.age_secs`),
      }
    }),
    unattached: list(r.unattached, '$.unattached', (v, p) => {
      const x = obj(v, p, ['id', 'workspace_slug', 'title', 'state', 'pending', 'since', 'age_secs'])
      return {
        id: str(x.id, `${p}.id`),
        workspace_slug: str(x.workspace_slug, `${p}.workspace_slug`),
        title: str(x.title, `${p}.title`),
        state: oneOf(SESSION_STATES)(x.state, `${p}.state`),
        pending: list(x.pending, `${p}.pending`, (rv, rp) => request(obj(rv, rp, REQUEST_KEYS), rp)),
        since: str(x.since, `${p}.since`),
        age_secs: num(x.age_secs, `${p}.age_secs`),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Data + actions (hook `useAttention`)
// ---------------------------------------------------------------------------

/** Verdict of a Today "decide" button on a thinking item. */
export type Verdict = 'accept' | 'reject'

export const attentionApi = {
  /**
   * `GET /api/attention`, validated against the contract. `workspace` is the lane
   * slug filter (omitted = every lane). A payload that diverges from the contract
   * throws: the cockpit shows an error state rather than garbage.
   */
  fetch: async (workspace?: string | null, signal?: AbortSignal): Promise<AttentionResponse> =>
    parseAttentionResponse(await api.get<unknown>(`/attention${buildQuery({ workspace })}`, signal)),

  /**
   * Answer a permission asked by a LIVE session. Same path as the WS
   * `permission_response`. A dead CLI answers 410 (the caller turns the request
   * into an orphan); an orphan must never reach this call.
   */
  answerPermission: (sessionId: string, requestId: string, allow: boolean) =>
    api.post<void>(`/chat/sessions/${sessionId}/permissions/${requestId}`, { allow }),

  /**
   * Send a message to a session: answers a question of a live agent, and is also
   * how an orphan is "continued" (the server resumes the CLI on a user message).
   */
  sendMessage: (sessionId: string, content: string) =>
    api.post<void>(`/chat/sessions/${sessionId}/messages`, { content }),

  /**
   * Resume a stopped run (skips done AND blocked tasks, server side).
   * ASSUMPTION: `POST /plans/{id}/run/resume` (route to be confirmed with the backend).
   */
  resumeRun: (planId: string) => api.post<void>(`/plans/${planId}/run/resume`, {}),

  /** Accept / reject an RFC (FSM transition) or a decision (status). */
  decide: (kind: 'rfc' | 'decision', id: string, verdict: Verdict): Promise<unknown> =>
    kind === 'rfc'
      ? rfcApi.transition(id, verdict)
      : decisionsApi.update(id, { status: verdict === 'accept' ? 'accepted' : 'deprecated' }),
}
