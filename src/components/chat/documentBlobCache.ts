/**
 * The bytes of an attached document, fetched once per document.
 *
 * ## Why a cache and not a plain `fetch` in the component
 *
 * A thumbnail is rendered inside a list that remounts constantly: scroll,
 * tab switch, a message arriving below it, the history being replayed. A bare
 * `useEffect(fetch)` would therefore re-download the same screenshot every
 * time, and — worse — leak one object URL per render, since nothing would
 * revoke them. Here the download is keyed by document id, so N renders cost
 * one request, and the URL belongs to the component that displays it.
 *
 * ## What is cached, and what is not
 *
 * A **Blob**, never an object URL: an object URL has exactly one owner (the
 * component that will revoke it), while a Blob can back as many URLs as there
 * are places to draw it.
 *
 * A **failed** read is not cached. The overwhelming cause is transient (server
 * restarting, token refreshing, blob store still warming up), and remembering
 * a rejection would turn a momentary 503 into a permanently broken thumbnail
 * for the lifetime of the tab.
 *
 * ## Cancellation is best-effort, on purpose
 *
 * Two components asking for the same document share one request; the first
 * caller's `signal` is the one that governs it. When it aborts, the shared
 * request dies and the entry is dropped, so the next caller retries from
 * scratch. Anything cleverer (reference-counted cancellation) would mean
 * aborting a download that a second, still-mounted component is waiting on.
 */

/** Reads a document's bytes. Injected so the cache is testable without fetch. */
export type BlobLoader = (documentId: string, signal?: AbortSignal) => Promise<Blob>

/**
 * How many documents stay in memory.
 *
 * A screenshot is a few hundred kilobytes and a conversation shows a handful;
 * 24 is generous for one screen and small enough that a long session cannot
 * grow without bound. Eviction is FIFO — recency would be a lie here, since
 * every entry is equally cheap to re-fetch.
 */
export const DEFAULT_CACHE_SIZE = 24

export interface DocumentBlobCache {
  /** The document's bytes, from memory or from the loader. */
  get(documentId: string, signal?: AbortSignal): Promise<Blob>
  /** How many documents are currently held (tests and diagnostics). */
  size(): number
  /** Forget everything. Never revokes URLs: those belong to the components. */
  clear(): void
}

export function createDocumentBlobCache(
  load: BlobLoader,
  max = DEFAULT_CACHE_SIZE,
): DocumentBlobCache {
  const entries = new Map<string, Promise<Blob>>()

  function evictOldest() {
    while (entries.size > max) {
      const oldest = entries.keys().next()
      if (oldest.done) return
      entries.delete(oldest.value)
    }
  }

  return {
    get(documentId, signal) {
      const hit = entries.get(documentId)
      if (hit) return hit

      const pending = load(documentId, signal)
      entries.set(documentId, pending)

      // Drops a rejection as soon as it happens, and swallows it locally: the
      // consumer handles its own copy, and an unhandled rejection here would
      // turn an aborted thumbnail into a console error.
      pending.catch(() => {
        if (entries.get(documentId) === pending) entries.delete(documentId)
      })

      evictOldest()
      return pending
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  }
}

/** True for the abort an unmounted component causes — never an error to show. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
