/**
 * One download per key, however many components ask for it.
 *
 * A thumbnail, a preview and a download of the same document all want the same
 * bytes. This is the shape that makes them share: a cache of in-flight and
 * settled promises, bounded, with failures NOT remembered — the overwhelming
 * cause of a failed read is transient (server restarting, token refreshing,
 * blob store still warming up), and caching a rejection would turn a momentary
 * 503 into a permanently broken file for the lifetime of the tab.
 *
 * Cancellation is best-effort by design: two callers share one request, so the
 * first caller's `signal` governs it. When it aborts, the entry is dropped and
 * the next caller retries from scratch. Anything cleverer would mean aborting
 * a download a second, still-mounted component is waiting on.
 */

/** Reads one key. Injected so the cache is testable without any transport. */
export type PromiseLoader<T> = (key: string, signal?: AbortSignal) => Promise<T>

/**
 * How many entries stay in memory.
 *
 * A value type here is a few hundred kilobytes; a screen shows a handful. 24 is
 * generous for one view and small enough that a long session cannot grow
 * without bound. Eviction is FIFO — recency would be a lie, since every entry is
 * equally cheap to fetch again.
 */
export const DEFAULT_CACHE_SIZE = 24

export interface PromiseCache<T> {
  /** The value for `key`, from memory or from the loader. */
  get(key: string, signal?: AbortSignal): Promise<T>
  /** How many entries are currently held (tests and diagnostics). */
  size(): number
  /** Forget everything. Never touches what callers did with the values. */
  clear(): void
}

export function createPromiseCache<T>(
  load: PromiseLoader<T>,
  max = DEFAULT_CACHE_SIZE,
): PromiseCache<T> {
  const entries = new Map<string, Promise<T>>()

  function evictOldest() {
    while (entries.size > max) {
      const oldest = entries.keys().next()
      if (oldest.done) return
      entries.delete(oldest.value)
    }
  }

  return {
    get(key, signal) {
      const hit = entries.get(key)
      if (hit) return hit

      const pending = load(key, signal)
      entries.set(key, pending)

      // Drops a rejection as soon as it happens, and swallows it locally: the
      // consumer handles its own copy, and an unhandled rejection here would
      // turn an aborted read into a console error.
      pending.catch(() => {
        if (entries.get(key) === pending) entries.delete(key)
      })

      evictOldest()
      return pending
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  }
}

/** True for the abort an unmounting component causes — never an error to show. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
