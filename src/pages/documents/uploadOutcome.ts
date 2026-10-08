/**
 * The words of an upload's ending, for `DocumentsPage` — kept apart from the
 * page so the page file exports only its component (fast refresh) and so a
 * chat drop zone can reuse the same sentences.
 */
import { ApiError, apiErrorMessage } from '@/services/api'
import type { DocumentDetail } from '@/types'

/**
 * What a server can read, said the way the site says it (`features.documents`:
 * « Reads the text of PDF and text files »). Word, Excel and PowerPoint readers
 * exist in the backend but sit behind Cargo features (`docx`, `xlsx`, `pptx`,
 * like `pdf` itself): a build without one answers 501, never 415, and names
 * the missing format — see `uploadFailureText`.
 */
export const READABLE_FORMATS = 'PDF, plain text and Markdown — and Word, Excel or PowerPoint when this server was built with them'

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
  const status = err instanceof ApiError ? err.status : undefined
  const detail = err instanceof ApiError ? apiErrorMessage(err, '').trim() : ''
  const safeDetail = detail && detail.length <= 200 && !detail.startsWith('<') ? detail : ''
  switch (status) {
    case 413:
      return `${filename} is too large. ${safeDetail || 'Send a smaller file.'}`
    case 415:
      return `${filename} is in a format this server cannot read. It reads ${READABLE_FORMATS}.`
    case 501: {
      // "PDF support is not compiled in — rebuild with the `pdf` feature"
      const format = safeDetail.match(/^(\w+) support is not compiled in/)?.[1] ?? 'this format'
      return `${filename} is fine, but this server was built without ${format} support and cannot read it. It reads ${READABLE_FORMATS}.`
    }
    case 422:
      return `${filename} could not be read: ${safeDetail || 'the file is empty or damaged'}.`
    case 408:
      return `The server did not answer in time for ${filename}. Try again.`
    case 0:
      return `${filename} never reached the server. Check the connection and try again.`
    case 401:
    case 403:
      return `You are not allowed to upload ${filename} here.`
    default:
      return safeDetail ? `Could not upload ${filename}: ${safeDetail}` : `Could not upload ${filename}.`
  }
}

/**
 * What to say once a file is stored but will not be found again: the server
 * keeps every file (a `.zip`, a screenshot) and says in `warnings` when it has
 * no text to search. Nothing else to say when the text came through.
 */
export function uploadOutcomeNote(doc: Pick<DocumentDetail, 'filename' | 'extracted' | 'chunk_count' | 'warnings'>): string | null {
  if (doc.extracted === false) return `${doc.filename} is stored and can be opened, but it has no readable text: it will not be found in search.`
  if (doc.chunk_count === 0) return `${doc.filename} is stored, but no text could be read from it: it will not be found in search.`
  return doc.warnings?.length ? `${doc.filename}: ${doc.warnings[0]}` : null
}
