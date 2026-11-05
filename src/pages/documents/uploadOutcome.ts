/**
 * The words of an upload's ending, for `DocumentsPage` — kept apart from the
 * page so the page file exports only its component (fast refresh) and so a
 * chat drop zone can reuse the same sentences.
 */
import { ApiError, apiErrorMessage } from '@/services/api'
import type { DocumentDetail } from '@/types'
import { activeTranslator } from '@/i18n'

/**
 * What a server can read, said the way the site says it (`features.documents`:
 * « Reads the text of PDF and text files »). Word, Excel and PowerPoint readers
 * exist in the backend but sit behind Cargo features (`docx`, `xlsx`, `pptx`,
 * like `pdf` itself): a build without one answers 501, never 415, and names
 * the missing format — see `uploadFailureText`.
 *
 * A function, not a constant: the list is read in the language on screen when it is asked for.
 */
export function readableFormats(): string {
  return activeTranslator().t('siteRest.upload.formats')
}

/**
 * The sentence for a failed upload, from the status the server chose
 * (`backend/src/api/document_handlers.rs`, « Why the status codes are spelled
 * out »). Each code means something different to the person who just chose
 * the file, so each one gets its own words and names the file:
 *
 *   413  too large — the server's message says the limit
 *   415  no reader for this format — say which formats are read
 *   501  the format is known, this build cannot read it — the file is fine
 *   422  the file itself is empty or damaged
 *   408 / 0  the network, not the file
 */
export function uploadFailureText(err: unknown, filename: string): string {
  const t = activeTranslator().t
  const status = err instanceof ApiError ? err.status : undefined
  const detail = err instanceof ApiError ? apiErrorMessage(err, '').trim() : ''
  const safeDetail = detail && detail.length <= 200 && !detail.startsWith('<') ? detail : ''
  switch (status) {
    case 413:
      return t('siteRest.upload.tooLarge', { name: filename, detail: safeDetail || t('siteRest.upload.sendSmaller') })
    case 415:
      return t('siteRest.upload.noReader', { name: filename, formats: readableFormats() })
    case 501: {
      // "PDF support is not compiled in — rebuild with the `pdf` feature"
      const format = safeDetail.match(/^(\w+) support is not compiled in/)?.[1] ?? t('siteRest.upload.thisFormat')
      return t('siteRest.upload.notBuilt', { name: filename, format, formats: readableFormats() })
    }
    case 422:
      return t('siteRest.upload.unreadable', { name: filename, detail: safeDetail || t('siteRest.upload.emptyOrDamaged') })
    case 408:
      return t('siteRest.upload.timeout', { name: filename })
    case 0:
      return t('siteRest.upload.noConnection', { name: filename })
    case 401:
    case 403:
      return t('siteRest.upload.forbidden', { name: filename })
    default:
      return safeDetail
        ? t('siteRest.upload.failedWithDetail', { name: filename, detail: safeDetail })
        : t('siteRest.upload.failed', { name: filename })
  }
}

/**
 * What to say once a file is stored but will not be found again: the server
 * keeps every file (a `.zip`, a screenshot) and says in `warnings` when it has
 * no text to search. Nothing else to say when the text came through.
 */
export function uploadOutcomeNote(doc: Pick<DocumentDetail, 'filename' | 'extracted' | 'chunk_count' | 'warnings'>): string | null {
  const t = activeTranslator().t
  if (doc.extracted === false) return t('siteRest.upload.stored.noText', { name: doc.filename })
  if (doc.chunk_count === 0) return t('siteRest.upload.stored.noChunks', { name: doc.filename })
  return doc.warnings?.length ? `${doc.filename}: ${doc.warnings[0]}` : null
}
