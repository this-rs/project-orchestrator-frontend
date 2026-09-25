/**
 * Tests for the documents API client.
 *
 * The backend is being written in parallel against the same frozen contract
 * (plan 8b0fdd73), so there is nothing to talk to: `XMLHttpRequest` and
 * `fetch` are both replaced by fakes that answer exactly what the contract
 * says the server answers, including the three distinct rejections (413 / 415
 * / 422) the UI has to tell apart.
 *
 * Run with: npx vitest run src/services/__tests__/documents.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { documentsApi } from '../documents'
import { ApiError } from '../api'

vi.mock('../authManager', () => ({
  getValidToken: () => Promise.resolve('test-token'),
  refreshToken: vi.fn(),
  forceLogout: vi.fn(),
}))
vi.mock('../auth', () => ({ getAuthMode: () => 'none' }))
vi.mock('../env', () => ({ isTauri: false, getApiBase: () => '/api' }))

// ---------------------------------------------------------------------------
// A fake XMLHttpRequest that records what was sent and lets each test drive
// the response — including the progress events, which is the whole reason the
// upload path uses XHR rather than fetch.
// ---------------------------------------------------------------------------

interface FakeXhr {
  method: string
  url: string
  headers: Record<string, string>
  withCredentials: boolean
  body: FormData | null
  status: number
  responseText: string
  upload: { onprogress: ((e: ProgressEvent) => void) | null }
  onload: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
  abort: () => void
  /** Emit an upload progress event. */
  progress: (loaded: number, total: number) => void
  /** Complete the request with a status and body. */
  respond: (status: number, body?: string) => void
}

let lastXhr: FakeXhr | null = null

class MockXhr implements Partial<FakeXhr> {
  method = ''
  url = ''
  headers: Record<string, string> = {}
  withCredentials = false
  body: FormData | null = null
  status = 0
  responseText = ''
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value
  }

  send(body: FormData) {
    this.body = body
    lastXhr = this as unknown as FakeXhr
  }

  abort() {
    this.onabort?.()
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent)
  }

  respond(status: number, body = '') {
    this.status = status
    this.responseText = body
    this.onload?.()
  }
}

/** Resolve after the microtask that `getValidToken()` introduces. */
const flush = () => new Promise((r) => setTimeout(r, 0))

const uploaded = {
  id: 'doc-1',
  filename: 'shot.png',
  format: 'png',
  size_bytes: 12,
  sha256: 'a'.repeat(64),
  page_count: 1,
  chunk_count: 3,
  warnings: [],
}

const file = () => new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })

beforeEach(() => {
  lastXhr = null
  vi.stubGlobal('XMLHttpRequest', MockXhr)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

describe('documentsApi.upload — request shape', () => {
  it('POSTs multipart to /documents with the auth token and the cookie', async () => {
    const promise = documentsApi.upload(file())
    await flush()

    expect(lastXhr?.method).toBe('POST')
    expect(lastXhr?.url).toBe('/api/documents')
    expect(lastXhr?.headers['Authorization']).toBe('Bearer test-token')
    expect(lastXhr?.withCredentials).toBe(true)
    // Setting Content-Type by hand would break the multipart boundary.
    expect(lastXhr?.headers['Content-Type']).toBeUndefined()

    lastXhr?.respond(201, JSON.stringify(uploaded))
    await expect(promise).resolves.toEqual(uploaded)
  })

  it('carries the file, and project_id / session_id only when given', async () => {
    const promise = documentsApi.upload(file(), { projectId: 'p1', sessionId: 's1' })
    await flush()
    const body = lastXhr?.body as FormData
    expect((body.get('file') as File).name).toBe('shot.png')
    expect(body.get('project_id')).toBe('p1')
    expect(body.get('session_id')).toBe('s1')
    lastXhr?.respond(201, JSON.stringify(uploaded))
    await promise

    const second = documentsApi.upload(file())
    await flush()
    const bare = lastXhr?.body as FormData
    expect(bare.get('project_id')).toBeNull()
    expect(bare.get('session_id')).toBeNull()
    lastXhr?.respond(201, JSON.stringify(uploaded))
    await second
  })
})

describe('documentsApi.upload — progress', () => {
  it('reports progress as a percentage', async () => {
    const seen: number[] = []
    const promise = documentsApi.upload(file(), { onProgress: (p) => seen.push(p) })
    await flush()
    lastXhr?.progress(25, 100)
    lastXhr?.progress(100, 100)
    expect(seen).toEqual([25, 100])
    lastXhr?.respond(201, JSON.stringify(uploaded))
    await promise
  })

  it('ignores a progress event with no total rather than reporting NaN%', async () => {
    const seen: number[] = []
    const promise = documentsApi.upload(file(), { onProgress: (p) => seen.push(p) })
    await flush()
    lastXhr?.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 } as ProgressEvent)
    expect(seen).toEqual([])
    lastXhr?.respond(201, JSON.stringify(uploaded))
    await promise
  })
})

describe('documentsApi.upload — failures', () => {
  // The three rejections in the contract must arrive as three distinct
  // statuses: the UI turns each into a different sentence.
  it.each([
    [413, 'Maximum size is 25 MB'],
    [415, 'Format not supported: application/x-tar'],
    [422, 'PDF is malformed'],
  ])('surfaces %i with the server message intact', async (status, message) => {
    const promise = documentsApi.upload(file())
    await flush()
    lastXhr?.respond(status, message)
    await expect(promise).rejects.toMatchObject({ name: 'ApiError', status, message })
  })

  it('reports a network failure as status 0, not as an HTTP error', async () => {
    const promise = documentsApi.upload(file())
    await flush()
    lastXhr?.onerror?.()
    await expect(promise).rejects.toMatchObject({ name: 'ApiError', status: 0 })
  })

  it('rejects rather than resolving with garbage when the body is not JSON', async () => {
    const promise = documentsApi.upload(file())
    await flush()
    lastXhr?.respond(201, '<html>oops</html>')
    await expect(promise).rejects.toBeInstanceOf(ApiError)
  })

  it('falls back to the status when the server sends an empty body', async () => {
    const promise = documentsApi.upload(file())
    await flush()
    lastXhr?.respond(500, '')
    await expect(promise).rejects.toMatchObject({ status: 500, message: 'HTTP 500' })
  })
})

describe('documentsApi.upload — abort', () => {
  it('rejects with an AbortError when the caller aborts mid-upload', async () => {
    const controller = new AbortController()
    const promise = documentsApi.upload(file(), { signal: controller.signal })
    await flush()
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('never opens a request when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      documentsApi.upload(file(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(lastXhr).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The JSON endpoints go through the shared `api` helper, so these check the
// URLs and the shapes rather than the transport.
// ---------------------------------------------------------------------------

describe('documentsApi — JSON endpoints', () => {
  const mockFetch = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
      }),
    )

  it('lists with the query the contract defines', async () => {
    mockFetch(200, { items: [uploaded], total: 1 })
    const res = await documentsApi.list({ session_id: 's1', limit: 20, offset: 0 })
    expect(res.total).toBe(1)
    const url = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toBe('/api/documents?session_id=s1&limit=20&offset=0')
  })

  it('fetches one document', async () => {
    mockFetch(200, uploaded)
    await expect(documentsApi.get('doc-1')).resolves.toEqual(uploaded)
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toBe('/api/documents/doc-1')
  })

  it('fetches chunks', async () => {
    mockFetch(200, { items: [{ id: 'c1', text: 'hello', start: 0, end: 5, page: 1 }] })
    const res = await documentsApi.getChunks('doc-1')
    expect(res.items[0]).toMatchObject({ id: 'c1', start: 0, end: 5 })
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toBe('/api/documents/doc-1/chunks')
  })

  it('deletes, tolerating the contract-mandated empty 204', async () => {
    mockFetch(204, '')
    await expect(documentsApi.remove('doc-1')).resolves.toBeDefined()
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/documents/doc-1')
    expect(call[1].method).toBe('DELETE')
  })

  it('builds the raw-file URL without fetching it', () => {
    expect(documentsApi.rawUrl('doc-1')).toBe('/api/documents/doc-1/raw')
  })
})
