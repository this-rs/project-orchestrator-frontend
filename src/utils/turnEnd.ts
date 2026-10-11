/**
 * A turn the user stopped ends with `stop_reason: "interrupted"`. The Claude
 * Code CLI still reports it as `error_during_execution` with an empty text on
 * the live stream (the runner relies on that flag), so the chat must not turn
 * it into an empty error block. The stored copy already says `interrupted`
 * (backend #715); this keeps the live view and the reloaded view identical.
 */
export function isUserStoppedTurn(evt: Record<string, unknown>): boolean {
  return evt.stop_reason === 'interrupted'
}
