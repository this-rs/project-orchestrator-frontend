/**
 * Messages composed while the agent is still answering.
 *
 * ## Who owns the queue
 *
 * The BACKEND does. A message sent mid-stream with `queue: true` is held by the
 * session and delivered when the running turn ends (`chat/pending_queue.rs`),
 * instead of interrupting the response. The session delivers it — not this
 * page: it leaves whether or not the conversation is still on screen.
 *
 * The first version held the queue here and sent each message when the composer
 * saw the stream stop. Delivery then depended on what the screen showed: switch
 * conversation before the turn ended and the message left in the wrong
 * conversation, or — once that was fixed client-side — did not leave until the
 * user came back.
 *
 * What stays on this side:
 * - the list the server publishes (`pending_queue` events), kept per conversation;
 * - `local` entries: a message that could not be handed over yet (the
 *   conversation has no id yet, or the socket is down). It is shown at once and
 *   handed over as soon as possible (`useChat`);
 * - the same edit/drop/prioritize rules as the server, applied to the list on
 *   screen so a click answers immediately. The server's next list is the truth.
 */
import { toEntityRef, type EntityRef } from '@/refs/types'

export interface QueuedMessage {
  /** Stable identity for React keys and per-row actions. */
  id: string
  text: string
  /** Epoch ms, for display ("queued 12s ago") and stable ordering. */
  queuedAt: number
  /**
   * Document ids already uploaded when this message was queued.
   *
   * Carried with the message rather than read from the composer at flush time:
   * by then the user has moved on and the composer holds the *next* message's
   * attachments. Uploaded documents outlive the chip, so these ids stay valid
   * even after the chip is removed.
   */
  attachmentIds?: string[]
  /**
   * References (`#kind:id` tokens of `text`) to send with it. Carried with the
   * message for the same reason as `attachmentIds`: the composer has moved on by flush time.
   */
  refs?: EntityRef[]
  /**
   * The user asked for this one to go next. It sits at the head of the queue
   * and leaves first when the running turn ends — it does not interrupt anything.
   */
  prioritized?: boolean
  /**
   * Not handed to the server yet (no conversation id, or socket down). Shown
   * like any other row; `useChat` hands it over as soon as it can.
   */
  local?: boolean
}

/** An action on a held message — the `queue_op` frame, minus its `type`. */
export type QueueOp =
  | { op: 'edit'; id: string; content: string }
  | { op: 'remove'; id: string }
  | { op: 'prioritize'; id: string }
  | { op: 'send_now'; id: string }

/** One held message as the server publishes it (`pending_queue` event). */
export interface ServerQueueEntry {
  id: string
  content: string
  attachments?: { id: string }[]
  queued_at: string
  prioritized?: boolean
}

/**
 * Should a send be queued rather than dispatched?
 *
 * Only while a response is streaming. When idle, sends go straight out — the
 * queue must never become a mandatory extra click on the common path.
 */
export function shouldEnqueue(state: { isStreaming: boolean }): boolean {
  return state.isStreaming
}

/** Append a message. Text is trimmed; empty text is rejected by returning the queue unchanged. */
export function enqueue(
  queue: readonly QueuedMessage[],
  text: string,
  id: string,
  now: number,
  attachmentIds?: string[],
  refs?: readonly EntityRef[],
): QueuedMessage[] {
  const trimmed = text.trim()
  if (!trimmed) return [...queue]
  const entry: QueuedMessage = { id, text: trimmed, queuedAt: now }
  if (attachmentIds && attachmentIds.length > 0) entry.attachmentIds = [...attachmentIds]
  if (refs && refs.length > 0) entry.refs = refs.map(toEntityRef)
  return [...queue, entry]
}

/** Drop one message by id. Unknown ids are a no-op, not an error. */
export function removeFromQueue(
  queue: readonly QueuedMessage[],
  id: string,
): QueuedMessage[] {
  return queue.filter((m) => m.id !== id)
}

/**
 * Replace the text of one message, preserving its position and `queuedAt`.
 *
 * Editing to empty **removes** the message: an empty row would be a queue entry
 * that can never be sent, and the send handler would reject it anyway. Better
 * to make the edit box a second way to drop a message than to leave a dead row.
 */
export function editInQueue(
  queue: readonly QueuedMessage[],
  id: string,
  text: string,
): QueuedMessage[] {
  const trimmed = text.trim()
  if (!trimmed) return removeFromQueue(queue, id)
  return queue.map((m) => (m.id === id ? { ...m, text: trimmed } : m))
}

/**
 * Move a message to the head and mark it as the next to leave.
 *
 * This is the FIRST click of the per-row send button. It deliberately does not
 * dispatch: the message waits for the running response to finish, then leaves
 * first. A second click on an already-prioritized row is what sends immediately
 * (`send_now`: the server interrupts the running response). Unknown ids are a
 * no-op.
 */
export function prioritize(
  queue: readonly QueuedMessage[],
  id: string,
): QueuedMessage[] {
  const target = queue.find((m) => m.id === id)
  if (!target) return [...queue]
  return [{ ...target, prioritized: true }, ...queue.filter((m) => m.id !== id)]
}

/**
 * What the list on screen becomes right after an action, before the server
 * answers with its own list.
 *
 * `send_now` removes the row: the message is on its way and will come back as a
 * bubble in the transcript.
 */
export function applyQueueOp(queue: readonly QueuedMessage[], action: QueueOp): QueuedMessage[] {
  switch (action.op) {
    case 'edit':
      return editInQueue(queue, action.id, action.content)
    case 'remove':
    case 'send_now':
      return removeFromQueue(queue, action.id)
    case 'prioritize':
      return prioritize(queue, action.id)
  }
}

/** A server entry in the shape the queue bar draws. */
export function fromServerEntry(entry: ServerQueueEntry): QueuedMessage {
  const queued: QueuedMessage = {
    id: entry.id,
    text: entry.content,
    queuedAt: Date.parse(entry.queued_at) || 0,
  }
  const ids = (entry.attachments ?? []).map((a) => a.id)
  if (ids.length > 0) queued.attachmentIds = ids
  if (entry.prioritized) queued.prioritized = true
  return queued
}

/**
 * The list on screen after the server published its own: the server's entries,
 * then whatever is still waiting to be handed over. The server's list replaces
 * everything it knows about — it is the truth for those.
 */
export function mergeServerQueue(
  current: readonly QueuedMessage[],
  server: readonly ServerQueueEntry[],
): QueuedMessage[] {
  return [...server.map(fromServerEntry), ...current.filter((m) => m.local)]
}
