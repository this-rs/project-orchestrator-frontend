/**
 * Turning a session's live activity into one line of text.
 *
 * The rule this file encodes: **a conversation that is still running always
 * says so, and says what it is waiting on.** A session can stream nothing for
 * minutes while a `Monitor` watches a log or a background `Bash` runs; before
 * this, such a row showed only its old preview text, which reads exactly like
 * a conversation that has stopped working.
 *
 * Ordering matters and is deliberate: what blocks on the *human* outranks what
 * the agent is doing by itself, because that is the line the user must act on.
 */
import type { SessionActivity } from '@/types'
import { QUIET_ACTIVITY } from '@/types'

/** How the line should be painted — mapped to classes by the caller. */
export type ActivityTone = 'working' | 'blocked' | 'watching'

export interface ActivityStatus {
  /** The line to render. Never empty. */
  label: string
  tone: ActivityTone
  /** Show an animated dot: something is genuinely in motion. */
  pulse: boolean
  /**
   * Full sentence for assistive tech and the row's tooltip — it names every
   * component, where `label` keeps only the most important one.
   */
  detail: string
}

const TONE_ORDER: Record<ActivityTone, number> = { blocked: 0, working: 1, watching: 2 }

/** `n thing` / `n things`, with no "1 things". */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Normalise anything the server (or an older server) may hand us. A missing
 * field is zero, not NaN — a status line must never render "NaN watches".
 */
export function normalizeActivity(activity?: SessionActivity | null): SessionActivity {
  if (!activity) return QUIET_ACTIVITY
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  return {
    live: !!activity.live,
    streaming: !!activity.streaming,
    pending_permissions: n(activity.pending_permissions),
    monitors: n(activity.monitors),
    bash_tasks: n(activity.bash_tasks),
  }
}

/** Nothing is happening: the row shows its preview, as it always did. */
export function isQuiet(activity?: SessionActivity | null): boolean {
  const a = normalizeActivity(activity)
  return !a.live && !a.streaming && a.pending_permissions === 0 && a.monitors === 0 && a.bash_tasks === 0
}

/**
 * The status line for one session, or `null` when there is nothing to say.
 *
 * `null` is returned only for a session that is not live at all. A *live*
 * session always gets a line, even when it is merely waiting for the user to
 * type: "nothing is shown" is the state we are removing, because it is
 * indistinguishable from "it died".
 */
export function describeActivity(raw?: SessionActivity | null): ActivityStatus | null {
  const a = normalizeActivity(raw)
  if (!a.live && !a.streaming && a.pending_permissions === 0 && a.monitors === 0 && a.bash_tasks === 0) {
    return null
  }

  const parts: { label: string; tone: ActivityTone; pulse: boolean }[] = []

  if (a.pending_permissions > 0) {
    parts.push({
      label:
        a.pending_permissions === 1
          ? 'Waiting for your approval'
          : `Waiting for your approval (${a.pending_permissions})`,
      tone: 'blocked',
      pulse: true,
    })
  }
  if (a.streaming) {
    parts.push({ label: 'Working…', tone: 'working', pulse: true })
  }
  if (a.monitors > 0) {
    parts.push({ label: `Watching ${count(a.monitors, 'target')}`, tone: 'watching', pulse: true })
  }
  if (a.bash_tasks > 0) {
    parts.push({
      label: `${count(a.bash_tasks, 'background task')} running`,
      tone: 'watching',
      pulse: true,
    })
  }

  if (parts.length === 0) {
    // Live, but doing nothing of its own: it is waiting on us. Saying so is
    // the point — an empty line here is what made a live session look dead.
    return {
      label: 'Idle — waiting for you',
      tone: 'watching',
      pulse: false,
      detail: 'The agent is running and waiting for your next message.',
    }
  }

  parts.sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone])
  const head = parts[0]
  const label = parts.length > 1 ? `${head.label} · ${parts[1].label.toLowerCase()}` : head.label

  return {
    label,
    tone: head.tone,
    pulse: parts.some((p) => p.pulse),
    detail: parts.map((p) => p.label).join(' · '),
  }
}

/** True when at least one session is worth re-reading the server for. */
export function anyLive(activities: Iterable<SessionActivity>): boolean {
  for (const a of activities) {
    const n = normalizeActivity(a)
    if (n.live || n.streaming || n.pending_permissions > 0 || n.monitors > 0 || n.bash_tasks > 0) {
      return true
    }
  }
  return false
}

/**
 * Rebuild the activity map after a **session listing** came back.
 *
 * Why not a plain merge: a listing reports activity only for the sessions it
 * contains, and omits the field entirely for a quiet one. Merging would keep
 * a "Working…" for a session that has since stopped — the stuck indicator we
 * are trying to make impossible. So entries for the ids *in this window* are
 * replaced outright (dropped when the server sent no activity), and entries
 * for ids outside it are left untouched, since this response says nothing
 * about them.
 */
export function applyWindow(
  previous: ReadonlyMap<string, SessionActivity>,
  window: readonly { id: string; activity?: SessionActivity }[],
): Map<string, SessionActivity> {
  const next = new Map(previous)
  for (const item of window) {
    if (item.activity && !isQuiet(item.activity)) {
      next.set(item.id, normalizeActivity(item.activity))
    } else {
      next.delete(item.id)
    }
  }
  return next
}

/**
 * Rebuild the activity map from `GET /api/chat/live-activity`.
 *
 * This response is about *every* session, so it replaces the map wholesale.
 * That is what makes a stuck "Working…" self-healing: a session that stopped
 * is simply absent from the new map, and no merge can resurrect it.
 */
export function applySnapshot(sessions: Record<string, SessionActivity>): Map<string, SessionActivity> {
  const next = new Map<string, SessionActivity>()
  for (const [id, activity] of Object.entries(sessions ?? {})) {
    if (!isQuiet(activity)) next.set(id, normalizeActivity(activity))
  }
  return next
}

/**
 * Apply one `chat_session` CRUD event carrying `{ is_streaming }`.
 *
 * Events are an accelerator, not the truth: they make the dot appear at once
 * instead of at the next poll. So `is_streaming: true` on a session we have
 * never seen creates a minimal live entry, and `false` clears the streaming
 * flag but keeps any watch or pending permission the snapshot knows about —
 * the end of a turn does not kill a Monitor.
 */
export function applyStreamingEvent(
  previous: ReadonlyMap<string, SessionActivity>,
  sessionId: string,
  streaming: boolean,
): Map<string, SessionActivity> {
  const next = new Map(previous)
  const current = next.get(sessionId)
  if (streaming) {
    next.set(sessionId, { ...(current ?? QUIET_ACTIVITY), live: true, streaming: true })
    return next
  }
  if (!current) return next
  const updated: SessionActivity = { ...current, streaming: false }
  if (isQuiet(updated)) next.delete(sessionId)
  else next.set(sessionId, updated)
  return next
}
