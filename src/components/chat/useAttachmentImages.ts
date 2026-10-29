/**
 * Turning an attachment into something an `<img>` can draw.
 *
 * Two sources, one shape:
 *
 * * **a document the server already has** (a message's attachment, an agent's
 *   screenshot) — the bytes are behind an authenticated endpoint, so they must
 *   be fetched with the bearer token before any `<img>` can use them;
 * * **a local file** still being uploaded — the bytes are in memory, and the
 *   preview must appear at once rather than after the server has finished
 *   extracting the file.
 *
 * The lifecycle rule is the same for both: the object URL is created for a
 * given source and revoked when that source goes away, so a re-render never
 * leaks one.
 */
import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { createDocumentBlobCache, isAbortError } from './documentBlobCache'

/**
 * The one cache for the whole chat.
 *
 * Module-level on purpose: two bubbles showing the same screenshot — the same
 * file attached twice, or a message re-rendered after a scroll — must share a
 * single download. A cache per component would be a cache that never hits.
 */
export const documentImages = createDocumentBlobCache((documentId, signal) =>
  api.blob(`/documents/${encodeURIComponent(documentId)}/raw`, signal),
)

export interface AttachmentImage {
  /** Object URL, or `null` while loading and after a failure. */
  url: string | null
  loading: boolean
  /** The bytes could not be read (deleted document, forbidden, network). */
  failed: boolean
}

const IDLE: AttachmentImage = { url: null, loading: false, failed: false }

/** The image state of one document, remembered with the id it belongs to. */
interface Loaded {
  documentId: string
  image: AttachmentImage
}

/**
 * The bytes of a stored document, as an object URL.
 *
 * `enabled: false` is how a caller says "this is not a picture": no request is
 * made. It is a parameter rather than a conditional call so that the hook
 * order of the calling component never depends on a MIME type.
 *
 * The state is stored WITH the id it describes and the fallback is computed
 * during render. The obvious alternative — resetting the state at the top of
 * the effect — is a synchronous `setState` in an effect body, which renders
 * once for nothing and is what `react-hooks/set-state-in-effect` refuses.
 */
export function useDocumentImage(
  documentId: string | null | undefined,
  enabled = true,
): AttachmentImage {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const wanted = documentId && enabled ? documentId : null

  useEffect(() => {
    if (!wanted) return

    const controller = new AbortController()
    let created: string | null = null
    let live = true

    documentImages
      .get(wanted, controller.signal)
      .then((blob) => {
        // The component may have unmounted while the bytes were in flight; an
        // object URL created after that would never be revoked by anyone.
        if (!live) return
        created = URL.createObjectURL(blob)
        setLoaded({ documentId: wanted, image: { url: created, loading: false, failed: false } })
      })
      .catch((err: unknown) => {
        // An abort is this effect's own cleanup, not a failure to report.
        if (!live || isAbortError(err)) return
        setLoaded({ documentId: wanted, image: { url: null, loading: false, failed: true } })
      })

    return () => {
      live = false
      controller.abort()
      if (created) URL.revokeObjectURL(created)
    }
  }, [wanted])

  // Not loaded yet (or an image was asked for and we are still on the old one):
  // that is "loading", derived rather than stored.
  if (!wanted) return IDLE
  if (loaded?.documentId === wanted) return loaded.image
  return { url: null, loading: true, failed: false }
}

/**
 * A local file's object URL, for a preview that cannot wait for the server.
 *
 * No caching and no fetch: the `File` already holds the bytes. The URL is
 * revoked as soon as the file changes or the component goes away, which is
 * what keeps a composer left open for an hour from pinning every screenshot
 * the user tried and then removed.
 */
export function useFilePreviewUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL of the previous file must stop being rendered NOW: it is revoked on the next line and a stale `src` would show a broken image.
      setUrl(null)
      return
    }
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [file])

  return url
}
