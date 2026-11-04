// ============================================================================
// refreshScheduler — turn a burst of "the graph changed" signals into ONE refresh
// ============================================================================
//
// A sync announces itself with one batch event per layer, sometimes dozens in a
// row. Refreshing on each would hammer the backend; waiting for a quiet moment
// would never fire during a long sync. So the first request opens a window of
// `delayMs`; requests inside it are absorbed (the window does NOT slide), and
// when it closes the refresh runs once. A hidden tab does not refresh: it waits
// to be seen, then runs once, so a background tab costs nothing.
// ============================================================================

export interface RefreshScheduler {
  /** A change was announced. Cheap; call it as often as events arrive. */
  request(): void
  /** Drop what is pending (unmount, project change). */
  cancel(): void
}

const defaultVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

export function createRefreshScheduler(
  run: () => void,
  delayMs: number,
  isVisible: () => boolean = defaultVisible,
): RefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let waitingForVisible = false

  const onVisibility = () => {
    if (!waitingForVisible || !isVisible()) return
    stopWaiting()
    run()
  }
  const stopWaiting = () => {
    waitingForVisible = false
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
  }

  return {
    request() {
      if (timer || waitingForVisible) return
      timer = setTimeout(() => {
        timer = null
        if (isVisible()) {
          run()
          return
        }
        waitingForVisible = true
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
      }, delayMs)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      stopWaiting()
    },
  }
}
