/**
 * Client-side queue for messages composed while the agent is still answering.
 *
 * ## Why this exists
 *
 * Until now, sending mid-stream went straight to the backend, which queued the
 * message **and interrupted the running generation** so it would be processed
 * sooner (`chat/manager.rs`: `interrupt_flag.store(true)` + an interrupt frame
 * pushed to the CLI's stdin). The response you were reading got cut off, with
 * no way to say "wait, finish first".
 *
 * Holding the message here instead makes that a choice: it sits in a visible
 * queue you can edit, drop, move to the front, or — on a deliberate second
 * click — send right now, which is the one path that still cuts the running
 * response short. Nothing truncates anything by accident.
 *
 * ## Policy
 *
 * The behavioural questions this feature raises are answered in one place,
 * `QUEUE_POLICY`, rather than scattered through effects and handlers — they are
 * product decisions, not implementation details, and they are meant to be easy
 * to flip after using the thing for a day.
 */

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
   * The user asked for this one to go next. It sits at the head of the queue
   * and leaves on the next flush — it does not interrupt anything.
   */
  prioritized?: boolean
}

export const QUEUE_POLICY = {
  /**
   * When a response finishes and the queue is non-empty, send the oldest
   * message automatically.
   *
   * `true` means nothing can be stranded: the queue drains on its own, in
   * order, one per turn. `false` would give total control at the cost of a
   * forgotten message never being sent, with nothing to signal it.
   */
  autoFlushOnIdle: true,

  /**
   * With `autoFlushOnIdle`, send messages one per turn rather than merging the
   * whole queue into a single concatenated send.
   *
   * One per turn keeps each message a distinct turn in the transcript, which is
   * what the queue looks like on screen. Merging would be fewer agent turns but
   * would silently rewrite what the user composed.
   */
  flushAll: false,

  /**
   * The per-row send button is TWO-STAGE, and only the second stage interrupts.
   *
   *   1st click — the message moves to the head of the queue and is marked
   *               `prioritized` ("next"). Nothing is truncated: it leaves when
   *               the running response finishes.
   *   2nd click — on a row already marked "next", the message is dispatched
   *               immediately. The backend queues it and interrupts the running
   *               generation (`chat/manager.rs`), so the current response is cut
   *               short — which is the point: the user asked for it twice.
   *
   * The first version had no second stage, which made "send" a button whose only
   * visible effect was the row moving — indistinguishable from doing nothing
   * when you wanted the message to go out *now*. Making urgency the second click
   * keeps the safe default (never truncate by accident) and still gives a way
   * out, without turning the row's primary action into a destructive one.
   */
  manualSendInterrupts: 'second-click',
} as const

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
): QueuedMessage[] {
  const trimmed = text.trim()
  if (!trimmed) return [...queue]
  const entry: QueuedMessage = { id, text: trimmed, queuedAt: now }
  if (attachmentIds && attachmentIds.length > 0) entry.attachmentIds = [...attachmentIds]
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
 * Remove and return one message by id.
 *
 * Returns the message separately from the new queue so the caller dispatches
 * exactly what it removed — a read-then-filter in the caller could race with a
 * concurrent edit and send stale text.
 */
export function takeById(
  queue: readonly QueuedMessage[],
  id: string,
): { taken: QueuedMessage | null; rest: QueuedMessage[] } {
  const taken = queue.find((m) => m.id === id) ?? null
  return { taken, rest: taken ? queue.filter((m) => m.id !== id) : [...queue] }
}

/**
 * Move a message to the head and mark it as the next to leave.
 *
 * This is the FIRST click of the per-row send button. It deliberately does not
 * dispatch: the message waits for the running response to finish, then leaves on
 * the next flush. A second click on an already-prioritized row is what dispatches
 * immediately (`takeById` + send, see `QUEUE_POLICY.manualSendInterrupts`).
 * Unknown ids are a no-op.
 */
export function prioritize(
  queue: readonly QueuedMessage[],
  id: string,
): QueuedMessage[] {
  const target = queue.find((m) => m.id === id)
  if (!target) return [...queue]
  return [{ ...target, prioritized: true }, ...queue.filter((m) => m.id !== id)]
}

/** Remove and return the oldest message — the auto-flush path. */
export function takeHead(queue: readonly QueuedMessage[]): {
  taken: QueuedMessage | null
  rest: QueuedMessage[]
} {
  if (queue.length === 0) return { taken: null, rest: [] }
  return { taken: queue[0], rest: queue.slice(1) }
}
