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
export type InputAction = 'send' | 'stop' | 'stopping' | 'idle'

export interface InputActionState {
  /** The textarea holds at least one non-whitespace character. */
  hasText: boolean
  /** A generation is currently streaming. */
  isStreaming: boolean
  /** An interrupt has been requested and not yet acknowledged. */
  isStopping: boolean
  /** The parent disabled the input entirely (no session, socket down…). */
  disabled: boolean
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
  if (state.hasText) return 'send'
  if (state.isStopping) return 'stopping'
  if (state.isStreaming) return 'stop'
  return 'idle'
}

export const ACTION_LABELS: Record<InputAction, string> = {
  send: 'Send message',
  stop: 'Stop generating',
  stopping: 'Stopping…',
  idle: 'Send message',
}
