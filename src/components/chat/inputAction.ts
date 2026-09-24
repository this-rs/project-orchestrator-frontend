/**
 * State machine for the chat input bar's single action button.
 *
 * Send and Stop used to be two separate buttons sharing the row: during
 * streaming with text typed BOTH were visible, and the stop button animated its
 * own width in and out, shifting the send button sideways. They now share one
 * slot, and this module owns the rule that decides what that slot means.
 *
 * Kept out of `ChatInput.tsx` so the component file exports only the component
 * (React Fast Refresh requirement), and so the rule is unit-testable without
 * rendering anything.
 */

/** What the single action button does right now. */
export type InputAction = 'send' | 'stop' | 'stopping' | 'waiting' | 'idle'

/**
 * The three concerns stack rather than compete, and the order is the whole
 * design:
 *
 *   decideSend        can this message exist?   (are its attachments ready?)
 *   shouldEnqueue     when does it leave?       (is a response still running?)
 *   deriveInputAction what does the button say? (reads the result of both)
 *
 * Attachment readiness is a property of the message itself, so it is settled
 * before anything about timing. An incomplete message must never enter the
 * queue: flushing it later would send ids whose upload never finished.
 */
export interface InputActionState {
  /** The textarea holds at least one non-whitespace character. */
  hasText: boolean
  /** A generation is currently streaming. */
  isStreaming: boolean
  /** An interrupt has been requested and not yet acknowledged. */
  isStopping: boolean
  /** The parent disabled the input entirely (no session, socket down…). */
  disabled: boolean
  /**
   * Verdict of `decideSend` on the current attachments.
   *
   * `'reject-failed'` blocks: sending without a file the user attached would be
   * a silent abandonment, and the failed chip already carries the server's
   * message and a remove button.
   *
   * `'defer'` means an upload is still in flight — the send is held, not lost.
   */
  sendDecision?: 'send' | 'defer' | 'reject-empty' | 'reject-failed'
  /**
   * A send has already been committed and is being held until the uploads
   * finish.
   *
   * Distinct from `sendDecision === 'defer'`, and the distinction matters: a
   * pending upload alone must leave the button a normal **send** — clicking it
   * is what defers. Deriving `waiting` from `defer` disables the button before
   * the user can ever click it, so the send is never committed and the message
   * is stuck with no way out. (Found exactly that way, by a test.)
   */
  deferredSend?: boolean
}

/**
 * Derive the action button's state.
 *
 * Order matters, and `hasText` deliberately outranks `isStreaming`: the backend
 * queues messages sent mid-stream (see `handleSend` in `ChatInput` — it carries
 * no `isStreaming` guard), so typing during generation is a supported action,
 * not a mistake. A product that blocked mid-stream sends would want the
 * opposite precedence.
 *
 * Consequence worth keeping in mind: with text in the box there is no stop
 * affordance. Clearing the textarea brings it back.
 */
export function deriveInputAction(state: InputActionState): InputAction {
  if (state.disabled) return 'idle'
  // Attachments first: they decide whether the message can exist at all.
  if (state.sendDecision === 'reject-failed') return 'idle'
  // A held send, not merely a pending upload — see `deferredSend`.
  if (state.deferredSend) return 'waiting'
  if (state.hasText) return 'send'
  if (state.isStopping) return 'stopping'
  if (state.isStreaming) return 'stop'
  return 'idle'
}

/**
 * The button's tooltip.
 *
 * Separate from `ACTION_LABELS` because a label per action is not enough once
 * attachments are in play: `idle` can mean "nothing to send" or "a failed
 * upload is blocking you", and only the second one tells the user what to do
 * about it. A tooltip that says "Send message" on a button that refuses to
 * send is worse than no tooltip.
 */
export function describeAction(
  action: InputAction,
  sendDecision?: InputActionState['sendDecision'],
): string {
  if (sendDecision === 'reject-failed') return 'Remove the failed attachment first'
  if (action === 'waiting') return 'Waiting for the upload to finish'
  return ACTION_LABELS[action]
}

export const ACTION_LABELS: Record<InputAction, string> = {
  send: 'Send message',
  stop: 'Stop generating',
  stopping: 'Stopping…',
  waiting: 'Waiting for attachments to finish uploading',
  idle: 'Send message',
}
