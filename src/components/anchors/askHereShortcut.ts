/**
 * Cmd+K (Ctrl+K elsewhere) opens « Demander ici ». A screen that already uses
 * Cmd+K for itself (the graph search) claims it while it is mounted; the palette
 * then leaves the key alone.
 */
const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)

export const ASK_HERE_SHORTCUT_LABEL = isApple ? '⌘K' : 'Ctrl+K'

let claims = 0

/** A screen that owns Cmd+K calls this in an effect and returns the release. */
export function claimModK(): () => void {
  claims += 1
  let released = false
  return () => {
    if (released) return
    released = true
    claims -= 1
  }
}

export const isModKClaimed = (): boolean => claims > 0

export const isAskHereKey = (e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean =>
  (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'
