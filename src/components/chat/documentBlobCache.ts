/**
 * The bytes of a stored document, fetched once per document.
 *
 * Thin alias over [`createPromiseCache`]: what is cached is a **Blob**, never
 * an object URL. An object URL has exactly one owner — the component that will
 * revoke it — while a Blob can back as many URLs as there are places to draw
 * it: the thumbnail, the enlarged preview, the player, the download.
 */
import { createPromiseCache, type PromiseCache } from './promiseCache'

export { isAbortError } from './promiseCache'
export { DEFAULT_CACHE_SIZE } from './promiseCache'

/** Reads a document's bytes. Injected so the cache is testable without fetch. */
export type BlobLoader = (documentId: string, signal?: AbortSignal) => Promise<Blob>

export type DocumentBlobCache = PromiseCache<Blob>

export function createDocumentBlobCache(
  load: BlobLoader,
  max?: number,
): DocumentBlobCache {
  return createPromiseCache(load, max)
}
