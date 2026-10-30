/**
 * Getting a stored document's CONTENT into the chat — its bytes, or its text.
 *
 * Two sources for the same question ("what is in this file?"), one lifecycle
 * rule: whatever the hook creates (an object URL) is revoked when the thing it
 * describes goes away, and whatever it downloads is shared with every other
 * component asking for the same document.
 */
import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { documentsApi } from '@/services/documents'
import { createDocumentBlobCache, isAbortError } from './documentBlobCache'
import { createPromiseCache } from './promiseCache'

/**
 * The one byte cache for the whole chat.
 *
 * Module-level on purpose: a thumbnail, an enlarged preview and a download of
 * the same file must share one download. A cache per component would be a
 * cache that never hits.
 */
export const documentFiles = createDocumentBlobCache((documentId, signal) =>
  api.blob(`/documents/${encodeURIComponent(documentId)}/raw`, signal),
)

export interface DocumentFile {
  /** Object URL, or `null` while loading and after a failure. */
  url: string | null
  loading: boolean
  /** The bytes could not be read (deleted document, forbidden, network). */
  failed: boolean
}

const NO_FILE: DocumentFile = { url: null, loading: false, failed: false }

interface LoadedFile {
  documentId: string
  file: DocumentFile
}

/**
 * A document's bytes, as an object URL ready for `<img>`, `<audio>`, `<video>`
 * or an `<iframe>`.
 *
 * `type` is the media type to give the object URL. It exists because a blob URL
 * carries its blob's type, and a browser will not play an `.mp4` typed
 * `application/octet-stream` (`previewMime` supplies a plausible type from the
 * family — this only affects how the bytes are rendered locally).
 *
 * The state is stored WITH the id it describes and the fallback is computed
 * during render: resetting it at the top of the effect would be a synchronous
 * `setState` in an effect body, which renders once for nothing.
 */
export function useDocumentFile(
  documentId: string | null | undefined,
  type?: string | null,
): DocumentFile {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const wanted = documentId ?? null
  const wantedType = type ?? null

  useEffect(() => {
    if (!wanted) return

    const controller = new AbortController()
    let created: string | null = null
    let live = true

    documentFiles
      .get(wanted, controller.signal)
      .then((blob) => {
        // The component may have unmounted while the bytes were in flight; an
        // object URL created after that would never be revoked by anyone.
        if (!live) return
        const typed = wantedType ? new Blob([blob], { type: wantedType }) : blob
        created = URL.createObjectURL(typed)
        setLoaded({ documentId: wanted, file: { url: created, loading: false, failed: false } })
      })
      .catch((err: unknown) => {
        // An abort is this effect's own cleanup, not a failure to report.
        if (!live || isAbortError(err)) return
        setLoaded({ documentId: wanted, file: { url: null, loading: false, failed: true } })
      })

    return () => {
      live = false
      controller.abort()
      if (created) URL.revokeObjectURL(created)
    }
  }, [wanted, wantedType])

  if (!wanted) return NO_FILE
  if (loaded?.documentId === wanted) return loaded.file
  return { url: null, loading: true, failed: false }
}

/**
 * How much extracted text one preview builds.
 *
 * A 400-page PDF holds several megabytes of text; rendering all of it in a
 * dialog freezes the tab for no benefit — nobody reads past this, and the rest
 * is one click away (`GET /documents/:id/chunks`).
 */
export const PREVIEW_MAX_CHARS = 200_000

export interface DocumentText {
  /** The extracted text, chunk by chunk. `''` when nothing was extracted. */
  text: string
  /** The text was cut at `PREVIEW_MAX_CHARS`. */
  truncated: boolean
  /** How many chunks the document has (0 for an opaque file). */
  chunks: number
}

/**
 * Extracted text is heavier than bytes (it is a string, not a file handle) and
 * far less numerous on one screen, so fewer entries are kept.
 */
export const documentTexts = createPromiseCache<DocumentText>(
  (documentId, signal) => loadDocumentText(documentId, signal),
  8,
)

async function loadDocumentText(documentId: string, signal?: AbortSignal): Promise<DocumentText> {
  const response = await documentsApi.getChunks(documentId, signal)
  const parts: string[] = []
  let used = 0
  let truncated = false

  for (const chunk of response.items) {
    if (used >= PREVIEW_MAX_CHARS) {
      truncated = true
      break
    }
    const room = PREVIEW_MAX_CHARS - used
    const text = chunk.text.length > room ? chunk.text.slice(0, room) : chunk.text
    if (text.length < chunk.text.length) truncated = true
    parts.push(text)
    used += text.length
  }

  // Chunks tile the extracted text; a newline between them keeps two blocks of
  // prose from running together when the chunker cut without a separator.
  return { text: parts.join('\n'), truncated, chunks: response.items.length }
}

export interface DocumentTextState {
  text: string | null
  truncated: boolean
  loading: boolean
  failed: boolean
}

const NO_TEXT: DocumentTextState = { text: null, truncated: false, loading: false, failed: false }

interface LoadedText {
  documentId: string
  state: DocumentTextState
}

/** The document's extracted text, for the families the server could read. */
export function useDocumentText(
  documentId: string | null | undefined,
  enabled: boolean,
): DocumentTextState {
  const [loaded, setLoaded] = useState<LoadedText | null>(null)
  const wanted = enabled ? (documentId ?? null) : null

  useEffect(() => {
    if (!wanted) return

    const controller = new AbortController()
    let live = true

    documentTexts
      .get(wanted, controller.signal)
      .then((doc) => {
        if (!live) return
        setLoaded({
          documentId: wanted,
          state: { text: doc.text, truncated: doc.truncated, loading: false, failed: false },
        })
      })
      .catch((err: unknown) => {
        if (!live || isAbortError(err)) return
        setLoaded({
          documentId: wanted,
          state: { text: null, truncated: false, loading: false, failed: true },
        })
      })

    return () => {
      live = false
      controller.abort()
    }
  }, [wanted])

  if (!wanted) return NO_TEXT
  if (loaded?.documentId === wanted) return loaded.state
  return { text: null, truncated: false, loading: true, failed: false }
}
