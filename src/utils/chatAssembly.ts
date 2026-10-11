/**
 * chatAssembly — Pure functions to convert raw chat events into ChatMessage[] UI format.
 *
 * Extracted from useChat.ts so the same assembly logic can be reused by
 * useChat (main conversation) and useConversationWs (inline runner conversations).
 */

import { splitAttachments } from './messageAttachments'
import { splitRefs } from './messageRefs'
import { bindResolvedRefs, parseResolvedRefs, refsFromBlock } from '@/refs/refState'
import { applyResultCost } from './cost'
import { cancelNoticeMetadata } from './cancelFailure'
import type {
  BackgroundActivityMetadata,
  BackgroundOutputEntry,
  ChatMessage,
  ContentBlock,
} from '@/types'
import { tr } from '@/i18n/lazy'
import { BACKGROUND_ACTIVITY_MAX_ENTRIES } from '@/types'
import { readProviderError, toProviderRef, toToolPolicy, type ProviderCapabilities, type ProviderErrorInfo, type ProviderRef, type ToolPolicy } from '@/types/provider'

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------

let blockIdCounter = 0
function nextBlockId() {
  return `b-${++blockIdCounter}-${Math.random().toString(36).slice(2, 8)}`
}

let messageIdCounter = 0
function nextMessageId() {
  return `m-${++messageIdCounter}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

/**
 * Extract parent_tool_use_id from a chat event (if present).
 * When set, this event originated from a sub-agent spawned by a Task tool.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getParentToolUseId(event: any): string | undefined {
  // Live events: field is at top-level
  // Replay events: field may be inside .data
  const data = event.data ?? event
  return data.parent_tool_use_id ?? undefined
}

/**
 * Inject parent_tool_use_id into metadata if present.
 * Returns the metadata object with the field added (or unchanged).
 */
function withParent(
  metadata: Record<string, unknown> | undefined,
  parentToolUseId: string | undefined,
): Record<string, unknown> | undefined {
  if (!parentToolUseId) return metadata
  return { ...metadata, parent_tool_use_id: parentToolUseId }
}

/**
 * Inject `created_at` (ISO string) into metadata for timestamp display.
 */
function withCreatedAt(
  metadata: Record<string, unknown> | undefined,
  createdAt: string | undefined,
): Record<string, unknown> | undefined {
  if (!createdAt) return metadata
  return { ...metadata, created_at: createdAt }
}

// ---------------------------------------------------------------------------
// Background output — attach to parent, or fall back to a grouped
// `background_activity` block (F6 + F10 of plan 5985a7c4)
// ---------------------------------------------------------------------------

/** A background tick normalised from a `background_output` or `workflow` event. */
export interface BackgroundTick extends BackgroundOutputEntry {
  correlation_id?: string
  subagent_type?: string
  description?: string
  /** Workflow lifecycle subtype (`task_progress`…), for `workflow` ticks. */
  subtype?: string
  /** Verbatim structured payload of a `workflow` tick. */
  data?: Record<string, unknown>
}

/**
 * Normalise a `workflow` event (emitted by the Workflow tool, e.g.
 * `{type:'workflow', subtype:'task_progress', data:{description,
 * last_tool_name, task_id, tool_use_id, usage, subagent_type}}`) into
 * the same shape as a `background_output` tick so both share one
 * attach/fallback path. `data.tool_use_id` is the correlation key.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function workflowEventToTick(evt: any, fallbackReceivedAt: string): BackgroundTick {
  const data = (evt.data ?? {}) as Record<string, unknown>
  const subtype = (evt.subtype as string | undefined) ?? 'workflow'
  const description = typeof data.description === 'string' ? data.description : undefined
  const subagentType = typeof data.subagent_type === 'string' ? data.subagent_type : undefined
  const lastTool = typeof data.last_tool_name === 'string' ? data.last_tool_name : undefined
  const usage = (data.usage ?? {}) as Record<string, unknown>
  const parts: string[] = [subtype]
  if (description) parts.push(description)
  if (lastTool) parts.push(`last tool: ${lastTool}`)
  if (typeof usage.tool_uses === 'number') parts.push(`${usage.tool_uses} tool uses`)
  const correlationId = typeof data.tool_use_id === 'string'
    ? data.tool_use_id
    : typeof data.task_id === 'string' ? data.task_id : undefined
  const receivedAt = typeof evt.received_at === 'string'
    ? evt.received_at
    : typeof data.received_at === 'string' ? data.received_at : fallbackReceivedAt
  return {
    correlation_id: correlationId,
    source: 'Workflow',
    content: parts.join(' · '),
    received_at: receivedAt,
    subagent_type: subagentType,
    description,
    subtype,
    data,
  }
}

/** The persisted, display-sized slice of a tick (the heavy `data` lives on the block metadata). */
function entryOf(tick: BackgroundTick): BackgroundOutputEntry {
  const entry: BackgroundOutputEntry = {
    source: tick.source,
    content: tick.content,
    received_at: tick.received_at,
  }
  if (tick.subtype) entry.subtype = tick.subtype
  return entry
}

/**
 * Try to attach a tick to the `tool_use` block whose `tool_call_id`
 * equals the tick's `correlation_id` (searching backwards through
 * `messages`), appending it to that block's `child_outputs` so
 * MonitorCard renders it nested. Blocks are replaced immutably.
 * Returns true when a parent was found.
 */
export function attachToParentToolUse(messages: ChatMessage[], tick: BackgroundTick): boolean {
  const correlationId = tick.correlation_id
  if (!correlationId) return false
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const msg = messages[mi]
    for (let bi = 0; bi < msg.blocks.length; bi++) {
      const block = msg.blocks[bi]
      if (block.type === 'tool_use' && block.metadata?.tool_call_id === correlationId) {
        const existing =
          (block.metadata?.child_outputs as BackgroundOutputEntry[] | undefined) ?? []
        msg.blocks[bi] = {
          ...block,
          metadata: {
            ...block.metadata,
            child_outputs: [
              ...existing,
              entryOf(tick),
            ],
            ...(tick.data
              ? { child_data: { ...(block.metadata?.child_data as Record<string, unknown> | undefined), ...tick.data } }
              : {}),
          },
        }
        return true
      }
    }
  }
  return false
}

/** The keys of a `tool_timing` event kept on the call's block (`metadata.tool_timing`). */
const TOOL_TIMING_KEYS = [
  'ended_at',
  'called_at',
  'started_at',
  'permission_requested_at',
  'permission_resolved_at',
  'permission_outcome',
  'run_started_at',
  'cancelled',
  'incomplete',
] as const

/** The call id and the times of a `tool_timing` event; `null` when it is not one. */
export function toolTimingOf(evt: Record<string, unknown>): { id: string; timing: Record<string, unknown> } | null {
  const id = typeof evt.id === 'string' ? evt.id : ''
  if (!id || typeof evt.ended_at !== 'number') return null
  const timing: Record<string, unknown> = {}
  for (const key of TOOL_TIMING_KEYS) {
    if (evt[key] !== undefined) timing[key] = evt[key]
  }
  return { id, timing }
}

/**
 * Whether `b` is the block a call is shown as: its `tool_use`, or the
 * `ask_user_question` a question call is shown as instead (both reducers turn a
 * question's `tool_use` into that block, with the call's id).
 */
function isCallBlock(b: ContentBlock, id: string): boolean {
  return (b.type === 'tool_use' || b.type === 'ask_user_question') && b.metadata?.tool_call_id === id
}

/**
 * Put a `tool_timing` on the block of its call (latest message first): its
 * `tool_use`, or the `ask_user_question` of a question call, as
 * `metadata.tool_timing`: the trace reads the real run from it. The block is
 * replaced in its message's `blocks` (never mutated). `false` when the call is
 * not in `messages`.
 */
export function attachToolTiming(messages: ChatMessage[], evt: Record<string, unknown>): boolean {
  const found = toolTimingOf(evt)
  if (!found) return false
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const bi = messages[mi].blocks.findIndex((b) => isCallBlock(b, found.id))
    if (bi < 0) continue
    const blocks = [...messages[mi].blocks]
    blocks[bi] = { ...blocks[bi], metadata: { ...blocks[bi].metadata, tool_timing: found.timing } }
    messages[mi] = { ...messages[mi], blocks }
    return true
  }
  return false
}

/** At most this many timings wait for their call (a timing that came before its `tool_use`). */
export const EARLY_TOOL_TIMINGS_MAX = 64

/**
 * The timings that came before the `tool_use` of their call (a stored row can
 * precede it), keyed by call id, until that call shows up (`take`). Bounded: the
 * oldest is dropped past `EARLY_TOOL_TIMINGS_MAX`; the owner clears it when a
 * turn ends (`result`). Holding the same id twice keeps the latest (idempotent).
 */
export class EarlyToolTimings {
  private readonly byId = new Map<string, Record<string, unknown>>()

  hold(evt: Record<string, unknown>): void {
    const found = toolTimingOf(evt)
    if (!found) return
    this.byId.delete(found.id)
    this.byId.set(found.id, found.timing)
    if (this.byId.size > EARLY_TOOL_TIMINGS_MAX) this.byId.delete(this.byId.keys().next().value as string)
  }

  /** The timing held for `id`, removed from the holder; `undefined` when none. */
  take(id: string): Record<string, unknown> | undefined {
    const timing = this.byId.get(id)
    if (timing) this.byId.delete(id)
    return timing
  }

  clear(): void {
    this.byId.clear()
  }

  get size(): number {
    return this.byId.size
  }

  /**
   * Put each held timing whose call is in `messages` on it (`attachToolTiming`:
   * the message is replaced in the array, no block is mutated); a placed timing
   * leaves the holder, the others stay.
   */
  placeIn(messages: ChatMessage[]): void {
    for (const [id, timing] of [...this.byId]) {
      if (attachToolTiming(messages, { ...timing, id })) this.byId.delete(id)
    }
  }

  /**
   * The held timings as an immutable list, for a React updater: the holder may be
   * emptied right after (`moveTo`), and an updater React replays must still see them.
   */
  snapshot(): ReadonlyArray<HeldTiming> {
    return Object.freeze([...this.byId].map(([id, timing]) => Object.freeze({ id, timing })))
  }

  /** Move the held timings into `into` (all, or those `keep` accepts), leaving this holder empty. */
  moveTo(into: EarlyToolTimings, keep: (id: string) => boolean = () => true): void {
    for (const [id, timing] of this.byId) {
      if (keep(id)) into.hold({ ...timing, id })
    }
    this.byId.clear()
  }
}

/** A timing held for call `id` (see `EarlyToolTimings.snapshot`). */
export interface HeldTiming {
  readonly id: string
  readonly timing: Record<string, unknown>
}

/**
 * `messages` with each timing of `held` whose call is in them placed on it, as a
 * new array; `messages` is not changed (pure: safe in a React updater, even replayed).
 */
export function placeTimings(messages: ReadonlyArray<ChatMessage>, held: ReadonlyArray<HeldTiming>): ChatMessage[] {
  const out = [...messages]
  for (const { id, timing } of held) attachToolTiming(out, { ...timing, id })
  return out
}

/** Whether the block of call `id` (its `tool_use`, or a question's `ask_user_question`) is in `messages`. */
export function hasToolUse(messages: ReadonlyArray<ChatMessage>, id: string): boolean {
  return messages.some((m) => m.blocks.some((b) => isCallBlock(b, id)))
}

/**
 * Which bubble the echo of a user message with text `content` (its broadcast,
 * or the replay of it) belongs to, or `null` when it is a new message:
 * - the OLDEST bubble of this browser still waiting for its echo with that text
 *   (`awaitingEcho`), sent after the last turn result: the echoes come in the
 *   order the messages were sent, and a bubble a result has gone past without
 *   its echo will not get one any more (it never captures a later message);
 * - otherwise the bubble that opens the turn in progress, when it has that text:
 *   the same message shown again (a snapshot replayed on reconnect);
 * - otherwise none. An older bubble with the same text is another message (an
 *   "ok" sent from another tab after an earlier "ok"), and so is the opener of a
 *   turn already over (a result closed it).
 */
export function userEchoTarget(messages: ReadonlyArray<ChatMessage>, content: string): { index: number; awaiting: boolean } | null {
  const sameText = (m: ChatMessage) => m.role === 'user' && m.blocks[0]?.content === content
  let since = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].duration_ms != null) {
      since = i + 1
      break
    }
  }
  for (let i = since; i < messages.length; i++) {
    if (messages[i].awaitingEcho === true && sameText(messages[i])) return { index: i, awaiting: true }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') return sameText(m) ? { index: i, awaiting: false } : null
    // The turn's result was received: no turn is in progress.
    if (m.duration_ms != null) return null
  }
  return null
}

/**
 * The server time of an event (`created_at` of its envelope, #662: seconds since
 * the epoch, or an ISO string), as ISO; `undefined` when the frame has none.
 * Live blocks are stamped with it so a call is measured on ONE clock, the
 * server's, like the engine's `tool_timing` and like the history.
 */
export function serverTimeOf(evt: unknown): string | undefined {
  if (typeof evt !== 'object' || evt === null) return undefined
  const raw = (evt as { created_at?: unknown }).created_at
  const ms = typeof raw === 'number' ? raw * 1000 : typeof raw === 'string' ? Date.parse(raw) : NaN
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

/** How long a sample of the clock gap counts (browser ms). */
export const SERVER_CLOCK_WINDOW_MS = 60_000
const SERVER_CLOCK_SAMPLES_MAX = 256

/**
 * The server's clock, as seen from the browser: the gap between the `created_at`
 * of the latest LIVE frame and the browser's clock when it came. What the browser
 * stamps itself (a message it sends, an assistant message opened before any
 * frame of it) is stamped on `now()`, so every row of a trace is on the server's
 * clock even when the browser's is off. A replayed frame carries the time of an
 * old event: it says nothing of the gap. Until a frame comes, the gap is 0.
 */
export class ServerClock {
  private offsetMs = 0
  /** Recent samples (browser time seen, gap), newest last, within `SERVER_CLOCK_WINDOW_MS`. */
  private samples: Array<{ at: number; offset: number }> = []
  /** Browser time of the latest frame observed. */
  private lastAt: number | null = null

  /**
   * Learn the gap from a frame (ignored when replayed or without `created_at`).
   * A frame that came late (a burst delivered after a stall) understates the gap
   * by its delay, never overstates it: the gap kept is the LARGEST of the recent
   * samples, so one late frame does not drag the clock back.
   */
  observe(evt: unknown): void {
    if (typeof evt !== 'object' || evt === null || (evt as { replaying?: unknown }).replaying) return
    const t = serverTimeOf(evt)
    if (!t) return
    const at = Date.now()
    // No frame for longer than the window (a frozen or sleeping tab): the frames
    // that come now were held back, they are late by up to that long and
    // understate the gap. The samples from before the silence age only while
    // frames flow: they are kept, so the burst does not drag the clock back, and
    // the frames that follow in real time take over within the window.
    const idle = this.lastAt == null ? 0 : at - this.lastAt
    if (idle > SERVER_CLOCK_WINDOW_MS) this.samples = this.samples.map((s) => ({ ...s, at: s.at + idle }))
    this.lastAt = at
    this.samples.push({ at, offset: Date.parse(t) - at })
    // A sample from the browser's future (its clock went back) is dropped too.
    this.samples = this.samples.filter((s) => s.at <= at && at - s.at <= SERVER_CLOCK_WINDOW_MS).slice(-SERVER_CLOCK_SAMPLES_MAX)
    this.offsetMs = Math.max(...this.samples.map((s) => s.offset))
  }

  /** The server's time now (browser clock + gap). */
  now(): Date {
    return new Date(Date.now() + this.offsetMs)
  }

  get offset(): number {
    return this.offsetMs
  }
}

/**
 * F10 fallback: fold an orphan tick into a `background_activity` block
 * on `msg`. Orphans sharing a `correlation_id` within the same assistant
 * message merge into one block (count + last-N entries) so 50 ticks
 * never become 50 rows; a different (or missing) correlation_id starts
 * a new block. The updated block is replaced immutably in `msg.blocks`.
 */
export function appendBackgroundActivity(msg: ChatMessage, tick: BackgroundTick): void {
  const key = tick.correlation_id ?? null
  const entry = entryOf(tick)
  for (let bi = msg.blocks.length - 1; bi >= 0; bi--) {
    const block = msg.blocks[bi]
    if (block.type !== 'background_activity') continue
    const meta = block.metadata as unknown as BackgroundActivityMetadata
    if ((meta.correlation_id ?? null) !== key) continue
    const entries = [...meta.entries, entry].slice(-BACKGROUND_ACTIVITY_MAX_ENTRIES)
    const merged: BackgroundActivityMetadata = {
      ...meta,
      source: tick.source,
      count: meta.count + 1,
      last_received_at: tick.received_at,
      subagent_type: tick.subagent_type ?? meta.subagent_type,
      description: tick.description ?? meta.description,
      data: tick.data ? { ...meta.data, ...tick.data } : meta.data,
      entries,
    }
    msg.blocks[bi] = {
      ...block,
      content: tick.content,
      metadata: merged as unknown as Record<string, unknown>,
    }
    return
  }
  const meta: BackgroundActivityMetadata = {
    correlation_id: tick.correlation_id,
    source: tick.source,
    count: 1,
    first_received_at: tick.received_at,
    last_received_at: tick.received_at,
    subagent_type: tick.subagent_type,
    description: tick.description,
    data: tick.data,
    entries: [entry],
  }
  const block: ContentBlock = {
    id: nextBlockId(),
    type: 'background_activity',
    content: tick.content,
    metadata: meta as unknown as Record<string, unknown>,
  }
  msg.blocks.push(block)
}

// ---------------------------------------------------------------------------
// Main assembly function
// ---------------------------------------------------------------------------

/** Human text for a `session_error` event: the message, tagged with its machine reason. */
export function sessionErrorText(evt: { reason?: string; message?: string }): string {
  const message = evt.message ?? tr('app.chat.sessionError')
  return evt.reason ? `${message} (${evt.reason})` : message
}

/**
 * What a `session_error` carrying a typed `code` leaves on its error block:
 * the code and the whole typed error, so the transcript can render the card of
 * that failure (sign-in, consent, retry…) instead of a bare red line.
 *
 * Empty for an event without a known code — the death of a Claude CLI keeps
 * exactly the block it always had. Shared by BOTH reducers.
 */
export function sessionErrorMetadata(evt: unknown): { code?: string; provider_error?: ProviderErrorInfo } {
  const info = readProviderError(evt)
  return info ? { code: info.code, provider_error: info } : {}
}

/**
 * The block of a session-level event the transcript states on its own line:
 * `conversation_relayed` (the conversation moved to another provider),
 * `session_closed` (the server closed the session) and `compaction_recovery`
 * (the context re-injected after a compaction). `null` for any other event.
 * Shared by BOTH reducers; `content` is the plain sentence (export, screen
 * readers), the component renders from `metadata` in the viewer's language.
 */
export function sessionEventBlock(evt: unknown): Omit<ContentBlock, 'id'> | null {
  if (typeof evt !== 'object' || evt === null) return null
  const e = evt as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  switch (e.type) {
    case 'conversation_relayed': {
      const metadata = {
        from_session_id: str(e.from_session_id),
        to_session_id: str(e.to_session_id),
        from_provider: str(e.from_provider),
        to_provider: str(e.to_provider),
        relayed_entries: num(e.relayed_entries),
        omitted_entries: num(e.omitted_entries),
        moved_by: str(e.moved_by) || 'user',
      }
      return {
        type: 'conversation_relayed',
        content: tr('app.chat.relayed', { from: metadata.from_provider, to: metadata.to_provider, relayed: metadata.relayed_entries, omitted: metadata.omitted_entries }),
        metadata,
      }
    }
    case 'session_closed': {
      const reason = str(e.reason) || 'closed'
      return { type: 'session_closed', content: sessionClosedText(reason), metadata: { reason } }
    }
    case 'compaction_recovery': {
      const metadata = {
        hint_tokens: num(e.hint_tokens),
        build_latency_ms: num(e.build_latency_ms),
        recovery_success: e.recovery_success === true,
      }
      return {
        type: 'compaction_recovery',
        content: metadata.recovery_success
          ? tr('app.chat.compactionRecovered', { tokens: metadata.hint_tokens, ms: metadata.build_latency_ms })
          : tr('app.chat.compactionRecoveryFailed', { ms: metadata.build_latency_ms }),
        metadata,
      }
    }
    default:
      return null
  }
}

/** The sentence of a closed session, by the reason the server gave (`closed`, `idle`, `error`). */
export function sessionClosedText(reason: string): string {
  if (reason === 'idle') return tr('app.chat.sessionClosed.idle')
  if (reason === 'error') return tr('app.chat.sessionClosed.error')
  return tr('app.chat.sessionClosed.closed')
}

/** Human text for a `tools_cancelled` event: how many processes were killed, and by whom. */
export function toolsCancelledText(evt: { killed_count?: number; requested_by?: string }): string {
  const n = evt.killed_count ?? 0
  const what = n === 1 ? '1 running tool process' : `${n} running tool processes`
  return evt.requested_by ? `Cancelled ${what} (requested by ${evt.requested_by})` : `Cancelled ${what}`
}

/**
 * Convert raw chat events (from REST /messages endpoint) into ChatMessage UI format.
 * Groups events into user/assistant messages — same logic as handleEvent in replay mode.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function historyEventsToMessages(events: any[], opts: { refsEnabled?: boolean } = {}): ChatMessage[] {
  return historyEventsToWindow(events, opts).messages
}

/** A page of history, assembled. */
export interface HistoryWindow {
  messages: ChatMessage[]
  /**
   * The timings of calls NOT in this page: their `tool_use` is on an older page
   * (a call that began before the page and ended inside it). Kept by the caller
   * and placed when that older page is loaded (`EarlyToolTimings.placeIn`).
   */
  unplacedTimings: EarlyToolTimings
}

/** `historyEventsToMessages`, with the timings whose call is not in the page. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function historyEventsToWindow(events: any[], opts: { refsEnabled?: boolean } = {}): HistoryWindow {
  // Without refs_v1 a stored `<po-refs>` block is plain text: the chat is what it was.
  const refsEnabled = opts.refsEnabled ?? false
  const messages: ChatMessage[] = []

  function lastAssistant(eventTimestamp?: Date): ChatMessage {
    let msg = messages[messages.length - 1]
    if (!msg || msg.role !== 'assistant') {
      msg = { id: nextMessageId(), role: 'assistant', blocks: [], timestamp: eventTimestamp ?? new Date() }
      messages.push(msg)
    }
    return msg
  }

  // Track whether the previous event was a result/error_max_turns so we can
  // transform the following "Continue" user_message into a discreet indicator.
  let lastEventWasMaxTurns = false
  // Timings stored before the tool_use of their call, until it comes. At each turn's
  // end the ones still waiting go to `unplacedTimings`: their call is not in this page.
  const earlyTimings = new EarlyToolTimings()
  const unplacedTimings = new EarlyToolTimings()

  for (const evt of events) {
    const type = evt.type as string
    const createdAt = evt.created_at
      ? new Date(typeof evt.created_at === 'number' ? evt.created_at * 1000 : evt.created_at)
      : new Date()
    /** The server time of the event (ISO), on the blocks the trace keys by it; absent when the server sent none. */
    const stamp = evt.created_at ? createdAt.toISOString() : undefined

    switch (type) {
      case 'user_message': {
        // Attachments are the outer block, refs the inner one: peel in that order.
        const { text: withoutAttachments, attachments: sentAttachments } = splitAttachments(evt.content ?? '')
        const { text: content, refs: sentRefs } = splitRefs(withoutAttachments, refsEnabled)
        // "Continue" after max_turns -> discreet indicator instead of user bubble
        if (lastEventWasMaxTurns && content === 'Continue') {
          const assistantMsg = messages[messages.length - 1]
          if (assistantMsg && assistantMsg.role === 'assistant') {
            const maxTurnsBlock = assistantMsg.blocks.find((b) => b.type === 'result_max_turns')
            const numTurns = maxTurnsBlock?.metadata?.num_turns as number | undefined
            assistantMsg.blocks.push({
              id: nextBlockId(),
              type: 'continue_indicator',
              content: 'Continued',
              metadata: numTurns != null ? { num_turns: numTurns } : undefined,
            })
          }
          lastEventWasMaxTurns = false
          break
        }
        // User sent a normal message (not "Continue") after max_turns ->
        // dismiss the result_max_turns block so the orange banner won't reappear on reload.
        if (lastEventWasMaxTurns) {
          const assistantMsg = messages[messages.length - 1]
          if (assistantMsg && assistantMsg.role === 'assistant') {
            const maxTurnsBlock = assistantMsg.blocks.find((b) => b.type === 'result_max_turns')
            if (maxTurnsBlock) {
              maxTurnsBlock.metadata = { ...maxTurnsBlock.metadata, dismissed: true }
            }
          }
        }
        lastEventWasMaxTurns = false
        // The answer to a synthetic question IS this user turn.
        const answered = answerSyntheticQuestion(messages, content)
        if (answered !== messages) messages.splice(0, messages.length, ...answered)
        messages.push({
          id: evt.id || nextMessageId(),
          role: 'user',
          blocks: [{ id: nextBlockId(), type: 'text', content }],
          ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
          ...(sentRefs.length > 0 ? { refs: refsFromBlock(sentRefs) } : {}),
          timestamp: createdAt,
        })
        break
      }

      // How the server read the references of the user message above (contract C5).
      // No id on the wire: bound by its references to the oldest user message still waiting for them
      // (see `bindResolvedRefs`); one that matches nothing is dropped.
      case 'refs_resolved': {
        const resolved = parseResolvedRefs(evt.refs ?? evt.data?.refs)
        const bound = bindResolvedRefs(messages, resolved)
        if (bound.index >= 0) messages[bound.index] = bound.messages[bound.index]
        break
      }

      case 'assistant_text': {
        const content = evt.content ?? ''
        if (content) {
          const msg = lastAssistant(createdAt)
          const parent = getParentToolUseId(evt)
          msg.blocks.push({ id: nextBlockId(), type: 'text', content, metadata: withParent(undefined, parent) })
        }
        break
      }

      case 'thinking': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({ id: nextBlockId(), type: 'thinking', content: evt.content ?? '', metadata: withParent(undefined, parent) })
        break
      }

      case 'tool_use': {
        const msg = lastAssistant(createdAt)
        const toolName = evt.tool ?? ''
        const toolId = evt.id ?? ''
        const toolInput = evt.input ?? {}
        const parent = getParentToolUseId(evt)
        const ts = createdAt.toISOString()

        if (isQuestionToolUse(evt)) {
          const questions = (toolInput as { questions?: { question: string }[] })?.questions
          if (questions && questions.length > 0) {
            // Dedup: skip if ask_user_question block with same tool_call_id already exists
            const isDupe = toolId && msg.blocks.some(
              (b) => b.type === 'ask_user_question' && b.metadata?.tool_call_id === toolId,
            )
            // A question call is timed like any call: its timing goes on this block.
            const early = toolId ? earlyTimings.take(toolId) : undefined
            if (!isDupe) {
              msg.blocks.push({
                id: nextBlockId(),
                type: 'ask_user_question',
                content: questions.map((q: { question: string }) => q.question).join('\n'),
                metadata: withCreatedAt(withParent({ tool_call_id: toolId, questions, ...(early && { tool_timing: early }) }, parent), ts),
              })
            } else if (early) {
              attachToolTiming(messages, { ...early, id: toolId })
            }
          }
        } else {
          const early = toolId ? earlyTimings.take(toolId) : undefined
          msg.blocks.push({
            id: nextBlockId(),
            type: 'tool_use',
            content: toolName,
            metadata: withCreatedAt(withParent({ tool_call_id: toolId, tool_name: toolName, tool_input: toolInput, ...toolHintMetadata(evt), ...(early && { tool_timing: early }) }, parent), ts),
          })
        }
        break
      }

      case 'tool_use_input_resolved': {
        // Update an existing tool_use block's input
        const resolvedId = evt.id
        const resolvedInput = evt.input ?? {}
        for (let mi = messages.length - 1; mi >= 0; mi--) {
          const msg = messages[mi]
          for (let bi = 0; bi < msg.blocks.length; bi++) {
            const block = msg.blocks[bi]
            if (block.type === 'tool_use' && block.metadata?.tool_call_id === resolvedId) {
              msg.blocks[bi] = { ...block, metadata: { ...block.metadata, tool_input: resolvedInput } }
            }
          }
        }
        break
      }

      case 'tool_result': {
        const msg = lastAssistant(createdAt)
        const result = evt.result
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
        const parent = getParentToolUseId(evt)
        // Calculate tool duration by finding the matching tool_use block
        let toolDurationMs: number | undefined
        const toolCallId = evt.id
        if (toolCallId) {
          for (let mi = messages.length - 1; mi >= 0; mi--) {
            const tuBlock = messages[mi].blocks.find(
              (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === toolCallId && b.metadata?.created_at,
            )
            if (tuBlock) {
              const tuTime = new Date(tuBlock.metadata!.created_at as string).getTime()
              const trTime = createdAt.getTime()
              if (trTime > tuTime) toolDurationMs = trTime - tuTime
              break
            }
          }
        }
        msg.blocks.push({
          id: nextBlockId(),
          type: 'tool_result',
          content: resultStr,
          metadata: withCreatedAt(withParent({
            tool_call_id: toolCallId,
            is_error: evt.is_error,
            ...(toolDurationMs != null && { duration_ms: toolDurationMs }),
          }, parent), createdAt.toISOString()),
        })
        break
      }

      case 'tool_timing':
        // Not a message: the timing of a call already shown. It must not reset
        // `lastEventWasMaxTurns` (a timing can follow a max-turns result).
        // Before its call (a stored row can precede it): held until the call comes.
        if (!attachToolTiming(messages, evt)) earlyTimings.hold(evt)
        break

      case 'tool_cancelled': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'tool_result',
          content: tr('app.chat.cancelledByUser'),
          metadata: withParent({ tool_call_id: evt.id, is_cancelled: true }, parent),
        })
        break
      }

      case 'viz_block': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'viz',
          content: (evt.fallback_text as string) ?? '',
          metadata: withParent({
            viz_type: evt.viz_type,
            viz_data: evt.data,
            viz_title: evt.title,
            viz_interactive: evt.interactive ?? false,
            viz_max_height: evt.max_height ?? 300,
          }, parent),
        })
        break
      }

      case 'permission_request': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'permission_request',
          content: `Tool "${evt.tool}" wants to execute`,
          // Its own time: without it the trace would date the wait from the message's start.
          metadata: withCreatedAt(
            withParent({ tool_call_id: evt.id, tool_name: evt.tool, tool_input: evt.input, ...toolHintMetadata(evt), ...permissionCallOf(evt) }, parent),
            evt.created_at ? createdAt.toISOString() : undefined,
          ),
        })
        break
      }

      case 'permission_decision': {
        // Find the matching permission_request block and stamp the decision
        const decisionId = evt.id as string
        const allowed = evt.allow as boolean
        const lasting = (evt as { scope?: string }).scope
        for (let mi = messages.length - 1; mi >= 0; mi--) {
          const msg = messages[mi]
          for (let bi = 0; bi < msg.blocks.length; bi++) {
            const block = msg.blocks[bi]
            if (block.type === 'permission_request' && block.metadata?.tool_call_id === decisionId) {
              msg.blocks[bi] = { ...block, metadata: { ...block.metadata, decided: true, decision: allowed ? 'allowed' : 'denied', decision_scope: lasting, decision_rule: (evt as { rule?: string }).rule } }
            }
          }
        }
        break
      }

      case 'ask_user_question': {
        const msg = lastAssistant(createdAt)
        const questions = evt.questions as { question: string }[] | undefined
        const toolCallId = (evt as { tool_call_id?: string }).tool_call_id ?? ''
        const parent = getParentToolUseId(evt)
        if (questions && questions.length > 0) {
          // Dedup: skip if a block with the same tool_call_id already exists
          const isDupe = toolCallId && msg.blocks.some(
            (b) => b.type === 'ask_user_question' && b.metadata?.tool_call_id === toolCallId,
          )
          if (!isDupe) {
            msg.blocks.push({
              id: nextBlockId(),
              type: 'ask_user_question',
              content: questions.map((q: { question: string }) => q.question).join('\n'),
              metadata: withCreatedAt(withParent(questionMetadata(evt, toolCallId, questions), parent), evt.created_at ? createdAt.toISOString() : undefined),
            })
          }
        }
        break
      }

      case 'error': {
        const msg = lastAssistant(createdAt)
        const parent = getParentToolUseId(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'error',
          content: evt.message ?? tr('app.chat.unknownError'),
          metadata: withCreatedAt(withParent(cancelNoticeMetadata(evt) ?? undefined, parent), stamp),
        })
        break
      }

      case 'session_error': {
        // Emitted by the backend when the CLI subprocess dies (emit_subprocess_death).
        // Typed in ChatEvent but never reduced: the death of the CLI was invisible.
        const msg = lastAssistant(createdAt)
        const typed = sessionErrorMetadata(evt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'error',
          content: sessionErrorText(evt),
          ...(typed.code || stamp ? { metadata: withCreatedAt(typed.code ? typed : undefined, stamp) } : {}),
        })
        break
      }

      case 'conversation_relayed':
      case 'session_closed':
      case 'compaction_recovery': {
        const block = sessionEventBlock(evt)
        if (block) lastAssistant(createdAt).blocks.push({ id: nextBlockId(), ...block, metadata: withCreatedAt(block.metadata, stamp) })
        break
      }

      case 'tools_cancelled': {
        // Emitted by cancel_running_tools: the tools were killed, the user must see it.
        const msg = lastAssistant(createdAt)
        msg.blocks.push({
          id: nextBlockId(),
          type: 'error',
          content: toolsCancelledText(evt),
          ...(stamp ? { metadata: withCreatedAt(undefined, stamp) } : {}),
        })
        break
      }

      case 'model_changed': {
        const msg = lastAssistant(createdAt)
        const changedModel = (evt.model as string) ?? 'unknown'
        // Additive: the reason PO gives when it changed the model itself.
        const changedReason = typeof evt.reason === 'string' && evt.reason ? evt.reason : undefined
        msg.blocks.push({
          id: nextBlockId(),
          type: 'model_changed',
          content: `Model changed to ${changedModel}`,
          metadata: withCreatedAt(changedReason ? { model: changedModel, reason: changedReason } : { model: changedModel }, stamp),
        })
        break
      }

      case 'compact_boundary': {
        const msg = lastAssistant(createdAt)
        const trigger = (evt.trigger as string) ?? 'auto'
        const preTokens = evt.pre_tokens as number | undefined
        const label = preTokens
          ? `Context compacted (${trigger}, ~${Math.round(preTokens / 1000)}K tokens)`
          : `Context compacted (${trigger})`
        msg.blocks.push({
          id: nextBlockId(),
          type: 'compact_boundary',
          content: label,
          metadata: withCreatedAt({ trigger, pre_tokens: preTokens }, stamp),
        })
        break
      }

      case 'system_init': {
        // Dedup: only show the first system_init per conversation
        const alreadyHasInit = messages.some((m) =>
          m.blocks.some((b) => b.type === 'system_init'),
        )
        if (!alreadyHasInit) {
          const msg = lastAssistant(createdAt)
          const initModel = evt.model as string | undefined
          const initTools = evt.tools as string[] | undefined
          const initMcpServers = evt.mcp_servers as { name: string; status?: string }[] | undefined
          const initPermMode = evt.permission_mode as string | undefined
          msg.blocks.push({
            id: nextBlockId(),
            type: 'system_init',
            content: tr('app.chat.sessionInitialized'),
            metadata: {
              model: initModel,
              tools_count: initTools?.length ?? 0,
              mcp_servers_count: initMcpServers?.length ?? 0,
              permission_mode: initPermMode,
              ...systemInitToolMetadata(evt),
              ...systemInitProviderMetadata(evt),
            },
          })
        }
        break
      }

      case 'result': {
        earlyTimings.moveTo(unplacedTimings)
        const rSubtype = (evt.subtype as string) ?? 'success'
        const rNumTurns = evt.num_turns as number | undefined
        const rResultText = evt.result_text as string | undefined

        // Store turn metrics on the assistant message
        const rMsg = lastAssistant(createdAt)
        if (evt.duration_ms != null) rMsg.duration_ms = evt.duration_ms as number
        applyResultCost(rMsg, evt)

        if (rSubtype === 'error_max_turns') {
          rMsg.blocks.push({
            id: nextBlockId(),
            type: 'result_max_turns',
            content: rNumTurns
              ? tr('app.chat.maxTurnsCount', { n: rNumTurns })
              : tr('app.chat.maxTurns'),
            metadata: { num_turns: rNumTurns },
          })
          lastEventWasMaxTurns = true
        } else if (rSubtype === 'error_during_execution') {
          rMsg.blocks.push({
            id: nextBlockId(),
            type: 'result_error',
            content: rResultText ?? tr('app.chat.executionError'),
            metadata: withCreatedAt({ result_text: rResultText }, stamp),
          })
          lastEventWasMaxTurns = false
        } else {
          lastEventWasMaxTurns = false
        }
        break
      }

      case 'auto_continue': {
        const msg = lastAssistant(createdAt)
        const acDelay = evt.delay_ms as number | undefined
        msg.blocks.push({
          id: nextBlockId(),
          type: 'continue_indicator',
          content: tr('app.chat.autoContinuing'),
          metadata: { delay_ms: acDelay, auto: true },
        })
        lastEventWasMaxTurns = false
        break
      }

      case 'auto_continue_state_changed':
        // State sync event — no UI block needed in history
        lastEventWasMaxTurns = false
        break

      case 'retrying': {
        const msg = lastAssistant(createdAt)
        const attempt = evt.attempt as number | undefined
        const maxAttempts = evt.max_attempts as number | undefined
        const errorMsg = evt.error_message as string | undefined
        msg.blocks.push({
          id: nextBlockId(),
          type: 'retry_indicator',
          content: maxAttempts
            ? `Retrying... (${attempt}/${maxAttempts})`
            : `Retrying... (attempt ${attempt})`,
          metadata: { attempt, max_attempts: maxAttempts, error_message: errorMsg },
        })
        lastEventWasMaxTurns = false
        break
      }

      case 'system_hint': {
        // System-generated hints are internal — never rendered in the UI.
        lastEventWasMaxTurns = false
        break
      }

      case 'background_output':
      case 'workflow': {
        // Plan 5985a7c4 (F6 + F10): a tick whose correlation_id matches a
        // previously-emitted Monitor / Bash bg tool_use block is appended
        // to that block's `child_outputs` (MonitorCard renders it nested).
        // Without a match — parent outside the loaded window, or no
        // correlation_id at all — the tick is never dropped: it folds
        // into a grouped `background_activity` block on the current
        // assistant message (F10 orphan tolerance).
        const tick: BackgroundTick = type === 'workflow'
          ? workflowEventToTick(evt, createdAt.toISOString())
          : {
              correlation_id: (evt as { correlation_id?: string }).correlation_id,
              source: (evt.source as string) ?? 'background',
              content: (evt.content as string) ?? '',
              received_at: (evt.received_at as string) ?? createdAt.toISOString(),
            }
        if (!attachToParentToolUse(messages, tick)) {
          appendBackgroundActivity(lastAssistant(createdAt), tick)
        }
        lastEventWasMaxTurns = false
        break
      }

      default:
        // Unknown event type — skip
        lastEventWasMaxTurns = false
        break
    }
  }

  // Post-processing: match ask_user_question blocks with their tool_result
  // to pre-fill the persisted response for read-only display in history.
  for (const msg of messages) {
    for (const block of msg.blocks) {
      if (block.type === 'ask_user_question' && block.metadata?.tool_call_id && !block.metadata.submitted) {
        const toolCallId = block.metadata.tool_call_id as string
        // Find the tool_result with the same tool_call_id
        const toolResult = msg.blocks.find(
          (b) => b.type === 'tool_result' && b.metadata?.tool_call_id === toolCallId,
        )
        if (toolResult) {
          block.metadata = {
            ...block.metadata,
            submitted: true,
            response: toolResult.content || '',
          }
        }
      }
    }
  }

  earlyTimings.moveTo(unplacedTimings)
  return { messages, unplacedTimings }
}

// ---------------------------------------------------------------------------
// Re-export helpers for use by streaming event handlers (useChat handleEvent)
// ---------------------------------------------------------------------------

export { nextBlockId, nextMessageId, getParentToolUseId, withParent, withCreatedAt }

/**
 * Messages loaded before refs_v1 was known keep a stored `<po-refs>` block in
 * their text. Once the flag is on, read it: the text loses the block and the
 * message gets its references. The SAME array comes back when nothing changes.
 */
export function decodeStoredRefs(messages: ChatMessage[]): ChatMessage[] {
  let changed = false
  const next = messages.map((m) => {
    const first = m.blocks[0]
    if (m.role !== 'user' || m.refs?.length || first?.type !== 'text' || !first.content.includes('<po-refs>')) return m
    const { text, refs } = splitRefs(first.content)
    if (refs.length === 0) return m
    changed = true
    return { ...m, blocks: [{ ...first, content: text }, ...m.blocks.slice(1)], refs: refsFromBlock(refs) }
  })
  return changed ? next : messages
}

/**
 * What the provider adapter said about a tool call (`tool_use`,
 * `permission_request`), as block metadata: `tool_category` and
 * `tool_canonical`. The renderer registry and the permission block read them
 * instead of guessing from the tool's name.
 *
 * Only the fields the event carries are returned, so a Claude Code block —
 * whose events carry neither — keeps exactly the metadata it always had.
 * Shared by the history reducer (here) and the live one (`useChat`).
 */
export function toolHintMetadata(evt: unknown): { tool_category?: string; tool_canonical?: string } {
  if (typeof evt !== 'object' || evt === null) return {}
  const e = evt as Record<string, unknown>
  const out: { tool_category?: string; tool_canonical?: string } = {}
  if (typeof e.category === 'string' && e.category !== '') out.tool_category = e.category
  if (typeof e.canonical === 'string' && e.canonical !== '') out.tool_canonical = e.canonical
  return out
}

/**
 * The tool call a permission is about (`permission_request.tool_use_id`, when the
 * engine gives it), kept as `metadata.tool_use_id`: the control id of a
 * permission is not the call's id. Shared by BOTH reducers.
 */
export function permissionCallOf(evt: unknown): { tool_use_id?: string } {
  if (typeof evt !== 'object' || evt === null) return {}
  const id = (evt as { tool_use_id?: unknown }).tool_use_id
  return typeof id === 'string' && id !== '' ? { tool_use_id: id } : {}
}

// ============================================================================
// Questions to the user (shared by the live and the history reducers)
// ============================================================================

/** Claude's question tool. The ONE place its name is spelled in the reducers. */
const QUESTION_TOOL = 'AskUserQuestion'

/**
 * Is this `tool_use` the provider's "ask the user a question" tool? Decided on
 * the canonical alias its adapter supplied, and on Claude's own tool name for
 * the events that carry no alias (Claude Code).
 */
export function isQuestionToolUse(evt: unknown): boolean {
  if (typeof evt !== 'object' || evt === null) return false
  const e = evt as Record<string, unknown>
  return e.canonical === QUESTION_TOOL || e.tool === QUESTION_TOOL
}

/**
 * Metadata of an `ask_user_question` block. `synthetic` is kept when the
 * backend built the question for a provider with no native support: its answer
 * goes back as a USER TURN, not as an `input_response`.
 */
export function questionMetadata(evt: unknown, toolCallId: string, questions: unknown): Record<string, unknown> {
  const synthetic = typeof evt === 'object' && evt !== null && (evt as Record<string, unknown>).synthetic === true
  return { tool_call_id: toolCallId, questions, ...(synthetic ? { synthetic: true } : {}) }
}

/**
 * A user turn answers the SYNTHETIC question still open before it: the block
 * is stamped `submitted` with the turn's text, as a native question is from
 * its `tool_result`. Only the questions of the last assistant message are
 * looked at. Returns the same array when there is nothing to stamp.
 */
export function answerSyntheticQuestion(messages: ChatMessage[], response: string): ChatMessage[] {
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const msg = messages[mi]
    if (msg.role !== 'assistant') return messages
    const bi = msg.blocks.findIndex(
      (b) => b.type === 'ask_user_question' && b.metadata?.synthetic === true && !b.metadata.submitted,
    )
    if (bi === -1) continue
    const blocks = [...msg.blocks]
    blocks[bi] = { ...blocks[bi], metadata: { ...blocks[bi].metadata, submitted: true, response } }
    const next = [...messages]
    next[mi] = { ...msg, blocks }
    return next
  }
  return messages
}

// ============================================================================
// system_init → provider runtime (shared by the live and the history reducers)
// ============================================================================

/** What a `system_init` says about the harness behind the session. */
export interface SystemInitRuntime {
  /** `null` = the event names no provider: a pre-provider session, i.e. Claude Code. */
  provider: ProviderRef | null
  /** `null` = no capabilities carried: the fallback profile applies. */
  capabilities: Partial<ProviderCapabilities> | null
  toolPolicy: ToolPolicy | null
  /**
   * Engine that runs the session (`legacy` | `agent`). `undefined`/`null` = not
   * said (the backend omits it on the legacy engine).
   */
  engine?: string | null
  /** What this engine cannot do for the session (feature ids). Empty = nothing said. */
  degradedFeatures?: string[]
}

/**
 * Read provider, capabilities and tool policy off a `system_init` payload.
 * Used by BOTH reducers so a session renders the same live and from history.
 */
export function readSystemInitRuntime(evt: unknown): SystemInitRuntime {
  const e = (typeof evt === 'object' && evt !== null ? evt : {}) as Record<string, unknown>
  const caps = e.capabilities
  return {
    provider: toProviderRef(e.provider),
    capabilities: typeof caps === 'object' && caps !== null ? (caps as Partial<ProviderCapabilities>) : null,
    toolPolicy: toToolPolicy(e.tool_policy) ?? toToolPolicy(e.policy_mode) ?? toToolPolicy(e.permission_mode),
    engine: typeof e.engine === 'string' && e.engine ? e.engine : null,
    degradedFeatures: Array.isArray(e.degraded_features) ? e.degraded_features.filter((f): f is string => typeof f === 'string') : [],
  }
}

/** Runtime of the LAST `system_init` in a raw history window, or `null` when it holds none. */
export function lastSystemInitRuntime(rawEvents: ReadonlyArray<unknown>): SystemInitRuntime | null {
  for (let i = rawEvents.length - 1; i >= 0; i--) {
    const evt = rawEvents[i] as { type?: string; data?: unknown } | null
    if (evt?.type !== 'system_init') continue
    // A replayed record may nest its payload under `data`.
    const nested = typeof evt.data === 'object' && evt.data !== null ? (evt.data as object) : null
    return readSystemInitRuntime(nested ? { ...evt, ...nested } : evt)
  }
  return null
}

/**
 * Tools the session REALLY offers (`tools`) and the allow patterns of its
 * policy (`tool_allow`), stored on the `system_init` block so the inventory
 * renders the same live and from history. Absent when the event says nothing.
 */
export function systemInitToolMetadata(evt: unknown): { tools?: string[]; tool_allow?: string[] } {
  const e = (typeof evt === 'object' && evt !== null ? evt : {}) as Record<string, unknown>
  const out: { tools?: string[]; tool_allow?: string[] } = {}
  if (Array.isArray(e.tools)) out.tools = e.tools.filter((t): t is string => typeof t === 'string')
  const allow = readSystemInitRuntime(e).toolPolicy?.allow ?? []
  if (allow.length > 0) out.tool_allow = [...allow]
  return out
}

/** Provider fields stored on a `system_init` block (absent for a legacy session). */
export function systemInitProviderMetadata(evt: unknown): { provider?: string; provider_kind?: string; provider_label?: string } {
  const ref = readSystemInitRuntime(evt).provider
  if (!ref) return {}
  return { provider: ref.id, provider_kind: ref.kind, provider_label: ref.label }
}
