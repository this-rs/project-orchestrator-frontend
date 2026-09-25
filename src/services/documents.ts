import { api, buildQuery, ApiError } from './api'
import { getApiBase } from './env'
import { getValidToken } from './authManager'
import type {
  DocumentChunkListResponse,
  DocumentDetail,
  DocumentListResponse,
} from '@/types'

interface ListDocumentsParams {
  project_id?: string
  session_id?: string
  limit?: number
  offset?: number
}

export interface UploadOptions {
  /** Attach the document to a project node in the graph. */
  projectId?: string
  /** Attach the document to the chat session it was dropped into. */
  sessionId?: string
  /**
   * Called with 0..100 as the bytes leave the browser.
   *
   * Reaching 100 means the body is sent, NOT that the document exists: the
   * server still has to extract, chunk and embed it. The attachment only
   * becomes usable when `upload` resolves.
   */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

/**
 * Upload one file, reporting progress.
 *
 * Deliberately NOT built on `api.post`: `fetch` has no upload-progress event
 * (the streaming request body that would give one is not supported in Safari
 * and needs HTTP/2), and a progress bar that only ever shows 0% then 100% is
 * worse than none on a 30 MB PDF. `XMLHttpRequest` is the only portable way to
 * observe bytes leaving, so this one call drops down to it and reproduces what
 * `request()` does around it: API base, bearer token, cookie credentials, and
 * `ApiError(status, body)` on failure.
 *
 * The status code is preserved verbatim rather than flattened into a generic
 * message — 413, 415 and 422 mean three different things to the person who
 * just dropped a file, and `describeUploadFailure` in
 * `components/chat/attachmentState.ts` turns each into its own sentence.
 */
function upload(file: File, options: UploadOptions = {}): Promise<DocumentDetail> {
  const { projectId, sessionId, onProgress, signal } = options

  return new Promise<DocumentDetail>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
      return
    }

    // The token is fetched (and possibly refreshed) before opening the request,
    // exactly as `request()` does — an expired token on a 30 MB upload would
    // otherwise mean uploading the whole file to earn a 401.
    getValidToken()
      .then((token) => {
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
          return
        }

        const form = new FormData()
        form.append('file', file, file.name)
        if (projectId) form.append('project_id', projectId)
        if (sessionId) form.append('session_id', sessionId)

        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${getApiBase()}/documents`)
        // Send the HttpOnly refresh cookie, like `credentials: 'include'`.
        xhr.withCredentials = true
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        // No Content-Type header: the browser must set it itself so the
        // multipart boundary matches the body it generates.

        const onAbort = () => xhr.abort()
        signal?.addEventListener('abort', onAbort)
        const cleanup = () => signal?.removeEventListener('abort', onAbort)

        if (onProgress) {
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable || e.total === 0) return
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          cleanup()
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as DocumentDetail)
            } catch {
              reject(new ApiError(xhr.status, 'Malformed response from the server'))
            }
            return
          }
          reject(new ApiError(xhr.status, xhr.responseText || `HTTP ${xhr.status}`))
        }

        xhr.onerror = () => {
          cleanup()
          // Status 0: the request never reached the server (offline, DNS,
          // CORS). Distinct from any HTTP status the server could return.
          reject(new ApiError(0, 'Network error'))
        }

        xhr.onabort = () => {
          cleanup()
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }

        xhr.send(form)
      })
      .catch(reject)
  })
}

export const documentsApi = {
  upload,

  list: (params: ListDocumentsParams = {}, signal?: AbortSignal) =>
    api.get<DocumentListResponse>(`/documents${buildQuery(params)}`, signal),

  get: (id: string, signal?: AbortSignal) =>
    api.get<DocumentDetail>(`/documents/${id}`, signal),

  /** Extracted text, chunk by chunk, with the byte interval each came from. */
  getChunks: (id: string, signal?: AbortSignal) =>
    api.get<DocumentChunkListResponse>(`/documents/${id}/chunks`, signal),

  remove: (id: string, signal?: AbortSignal) =>
    api.delete<void>(`/documents/${id}`, signal),

  /**
   * URL of the original file.
   *
   * A URL rather than a fetch: `<a href>` / `<img src>` is how the raw bytes
   * get used. Note it carries no bearer token, so it only works where the
   * cookie session does.
   */
  rawUrl: (id: string) => `${getApiBase()}/documents/${id}/raw`,
}
