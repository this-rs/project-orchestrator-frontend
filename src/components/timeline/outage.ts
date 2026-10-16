/**
 * Provider interruptions, as data.
 *
 * The backend announces an outage twice: a `provider_outage` whose phase is
 * `down` when it declares an instance out of service, and one whose phase is
 * `up` when it answers again. The two carry the SAME `started_at` — the pair IS
 * the interval. This module is the SINGLE place that pairs them, so the chat
 * banner, the timeline zone and their tests can never disagree on what an
 * interruption is, or on where it begins and ends.
 *
 * Pure: no DOM, no clock (the block's own time is passed in).
 */
import type { ChatMessage, ContentBlock } from '@/types'

/** One `provider_outage` block of the transcript, normalised. */
export interface OutageEvent {
  /** The interval it belongs to: `provider@started_at`, the key its `up` shares. */
  key: string
  providerId: string
  phase: 'down' | 'up'
  /** Epoch ms of the transition (the block's own time, when it has one). */
  at: number
  /** Epoch ms the outage began — the SAME instant on the `down` and on its `up`. */
  startedAt: number
  /** Consecutive failures when it was declared down (`0` on `up`). */
  failures: number
  cause?: string
  /** `up` only. */
  durationMs?: number
  /** The plain sentence the reducer stored (export, screen readers, the zone's label). */
  text: string
}

/** One interruption: a `down` and, once the instance answered again, its `up`. */
export interface OutageSpan {
  key: string
  providerId: string
  startedAt: number
  endedAt?: number
  durationMs?: number
  cause?: string
  /** Consecutive failures at the moment the instance was declared down. */
  failures: number
  /** No `up` read yet: the instance is still out, the interval is still open. */
  open: boolean
  /** The `down` transition, when it was read (absent for an `up` whose `down` is on an older page). */
  downAt?: number
  /** The `up` transition, when it was read. */
  upAt?: number
  /** The sentence of whichever transition was read (the `down`'s, else the `up`'s). */
  text: string
}

const DOWN_OR_UP = (v: unknown): 'down' | 'up' => (v === 'up' ? 'up' : 'down')

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** The key of one interval: an outage's `down` and its `up` carry the same one. */
export function outageKey(providerId: string, startedAtIso: string): string {
  return `${providerId}@${startedAtIso}`
}

/** A `provider_outage` block, normalised; `null` for any other block. */
export function readOutageEvent(block: ContentBlock, at: number): OutageEvent | null {
  if (block.type !== 'provider_outage') return null
  const m = block.metadata ?? {}
  const providerId = str(m.provider_id) ?? 'provider'
  const startedIso = str(m.started_at) ?? ''
  const parsedStart = startedIso ? Date.parse(startedIso) : NaN
  const parsedSeen = typeof m.created_at === 'string' ? Date.parse(m.created_at) : NaN
  const seen = Number.isFinite(parsedSeen) ? parsedSeen : at
  const cause = str(m.cause)
  const duration = num(m.duration_ms)
  return {
    key: outageKey(providerId, startedIso),
    providerId,
    phase: DOWN_OR_UP(m.phase),
    at: seen,
    startedAt: Number.isFinite(parsedStart) ? parsedStart : seen,
    failures: num(m.failures) ?? 0,
    ...(cause ? { cause } : {}),
    ...(duration != null ? { durationMs: duration } : {}),
    text: block.content,
  }
}

/** Every `provider_outage` of a conversation, in reading order. */
export function readOutageEvents(messages: ReadonlyArray<ChatMessage>): OutageEvent[] {
  const events: OutageEvent[] = []
  for (const msg of messages) {
    const at = msg.timestamp instanceof Date ? msg.timestamp.getTime() : Date.now()
    for (const block of msg.blocks) {
      const event = readOutageEvent(block, at)
      if (event) events.push(event)
    }
  }
  return events
}

/**
 * Pair every instance's `down` with its `up` into one interruption.
 *
 * An `up` whose `down` was not read — an older page, a tab opened mid-outage —
 * still yields a CLOSED interval: `started_at` and `duration_ms` carry its
 * bounds on their own, so the zone is never silently missing.
 */
export function pairOutages(events: ReadonlyArray<OutageEvent>): OutageSpan[] {
  const spans = new Map<string, OutageSpan>()
  const order: string[] = []
  for (const event of events) {
    const known = spans.get(event.key)
    if (event.phase === 'down') {
      // A repeated `down` (replay of the same transition) states the same interval.
      if (known) continue
      spans.set(event.key, {
        key: event.key,
        providerId: event.providerId,
        startedAt: event.startedAt,
        ...(event.cause ? { cause: event.cause } : {}),
        failures: event.failures,
        open: true,
        downAt: event.at,
        text: event.text,
      })
      order.push(event.key)
      continue
    }
    const end = event.durationMs != null ? event.startedAt + event.durationMs : event.at
    if (known) {
      known.open = false
      known.endedAt = Math.max(end, known.startedAt)
      known.durationMs = known.endedAt - known.startedAt
      known.upAt = event.at
      if (event.cause && !known.cause) known.cause = event.cause
      continue
    }
    const endedAt = Math.max(end, event.startedAt)
    spans.set(event.key, {
      key: event.key,
      providerId: event.providerId,
      startedAt: event.startedAt,
      endedAt,
      durationMs: endedAt - event.startedAt,
      ...(event.cause ? { cause: event.cause } : {}),
      failures: event.failures,
      open: false,
      upAt: event.at,
      text: event.text,
    })
    order.push(event.key)
  }
  return order.map((key) => spans.get(key) as OutageSpan)
}

/** The interruptions of a conversation the instance has NOT come back from. */
export function openOutages(messages: ReadonlyArray<ChatMessage>): OutageSpan[] {
  return pairOutages(readOutageEvents(messages)).filter((span) => span.open)
}
