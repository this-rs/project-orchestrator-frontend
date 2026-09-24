import { describe, it, expect } from 'vitest'
import {
  ATTACHMENT_POLICY,
  addAttachment,
  createAttachment,
  decideSend,
  describeUploadFailure,
  filesFromClipboard,
  formatBytes,
  readyDocumentIds,
  removeAttachment,
  resolveDeferred,
  summarize,
  truncateFilename,
  updateAttachment,
  withFailure,
  withProgress,
  withUploaded,
  type Attachment,
  type AttachmentStatus,
  type SendDecision,
} from './attachmentState'

const uploading = (localId: string, progress = 0): Attachment => ({
  localId,
  filename: `${localId}.png`,
  sizeBytes: 1024,
  mimeType: 'image/png',
  status: 'uploading',
  progress,
})

const ready = (localId: string, documentId = `doc-${localId}`): Attachment => ({
  ...uploading(localId, 100),
  status: 'ready',
  documentId,
})

const failed = (localId: string, error = 'File too large'): Attachment => ({
  ...uploading(localId, 40),
  status: 'error',
  error,
})

// ---------------------------------------------------------------------------
// Single-attachment transitions
// ---------------------------------------------------------------------------

describe('createAttachment', () => {
  it('is born uploading — the upload starts at add time, not at send time', () => {
    const a = createAttachment('a1', { name: 'shot.png', size: 2048, type: 'image/png' })
    expect(a).toEqual({
      localId: 'a1',
      filename: 'shot.png',
      sizeBytes: 2048,
      mimeType: 'image/png',
      status: 'uploading',
      progress: 0,
    })
    expect(ATTACHMENT_POLICY.uploadOnAdd).toBe(true)
  })

  it('tolerates a file with no reported MIME type', () => {
    expect(createAttachment('a1', { name: 'notes', size: 1 }).mimeType).toBe('')
  })

  it('carries no documentId before the server has answered', () => {
    expect(createAttachment('a1', { name: 'x', size: 1 }).documentId).toBeUndefined()
  })
})

describe('withProgress', () => {
  it('advances while uploading', () => {
    expect(withProgress(uploading('a1', 10), 55).progress).toBe(55)
  })

  it('rounds fractional percentages', () => {
    expect(withProgress(uploading('a1'), 33.7).progress).toBe(34)
  })

  it('clamps above 100', () => {
    expect(withProgress(uploading('a1'), 140).progress).toBe(100)
  })

  it('never goes backwards — out-of-order XHR events must not make the bar flicker', () => {
    const a = uploading('a1', 80)
    expect(withProgress(a, 30)).toBe(a)
  })

  it('ignores a negative percentage', () => {
    const a = uploading('a1', 10)
    expect(withProgress(a, -5)).toBe(a)
  })

  it('is a no-op on a ready attachment — a late event must not resurrect it', () => {
    const a = ready('a1')
    expect(withProgress(a, 42)).toBe(a)
    expect(withProgress(a, 42).status).toBe('ready')
  })

  it('is a no-op on a failed attachment', () => {
    const a = failed('a1')
    expect(withProgress(a, 90)).toBe(a)
  })
})

describe('withUploaded', () => {
  it('moves to ready with the server id and a full bar', () => {
    const a = withUploaded(uploading('a1', 60), { id: 'doc-7' })
    expect(a.status).toBe('ready')
    expect(a.documentId).toBe('doc-7')
    expect(a.progress).toBe(100)
  })

  it('keeps extraction warnings so the uploader learns what was lost', () => {
    const a = withUploaded(uploading('a1'), { id: 'doc-7', warnings: ['3 pages have no text layer'] })
    expect(a.warnings).toEqual(['3 pages have no text layer'])
  })

  it('stores no empty warnings array — absence and "none" render differently', () => {
    expect(withUploaded(uploading('a1'), { id: 'doc-7', warnings: [] }).warnings).toBeUndefined()
  })

  it('clears a previous error (retry after failure)', () => {
    const a = withUploaded(failed('a1'), { id: 'doc-7' })
    expect(a.error).toBeUndefined()
    expect('error' in a).toBe(false)
  })

  it('does not mutate its input', () => {
    const before = uploading('a1', 60)
    withUploaded(before, { id: 'doc-7' })
    expect(before.status).toBe('uploading')
    expect(before.documentId).toBeUndefined()
  })
})

describe('withFailure', () => {
  it('moves to error and keeps the message', () => {
    const a = withFailure(uploading('a1'), 'File too large')
    expect(a.status).toBe('error')
    expect(a.error).toBe('File too large')
  })

  it('DROPS a previously obtained documentId — never leave a sendable id on a failed attachment', () => {
    const a = withFailure(ready('a1', 'doc-7'), 'Deleted server-side')
    expect(a.documentId).toBeUndefined()
    expect('documentId' in a).toBe(false)
    expect(readyDocumentIds([a])).toEqual([])
  })

  it('drops stale warnings along with the id', () => {
    const wasReady = withUploaded(uploading('a1'), { id: 'doc-7', warnings: ['w'] })
    expect(withFailure(wasReady, 'gone').warnings).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// List transitions
// ---------------------------------------------------------------------------

describe('addAttachment', () => {
  it('appends, preserving order', () => {
    const list = addAttachment(addAttachment([], uploading('a')), uploading('b'))
    expect(list.map((a) => a.localId)).toEqual(['a', 'b'])
  })

  it('refuses to grow past the cap, returning the list unchanged', () => {
    const full = Array.from({ length: ATTACHMENT_POLICY.maxAttachments }, (_, i) => uploading(`a${i}`))
    const after = addAttachment(full, uploading('one-too-many'))
    expect(after).toHaveLength(ATTACHMENT_POLICY.maxAttachments)
    expect(after.map((a) => a.localId)).not.toContain('one-too-many')
  })

  it('does not mutate the input list', () => {
    const original = [uploading('a')]
    addAttachment(original, uploading('b'))
    expect(original).toHaveLength(1)
  })
})

describe('updateAttachment', () => {
  it('applies the transition to the matching attachment only', () => {
    const list = [uploading('a', 10), uploading('b', 10)]
    const next = updateAttachment(list, 'b', (a) => withProgress(a, 70))
    expect(next.map((a) => a.progress)).toEqual([10, 70])
  })

  it('treats an unknown id as a no-op — an upload can resolve after its removal', () => {
    const list = [uploading('a')]
    expect(updateAttachment(list, 'gone', (a) => withUploaded(a, { id: 'x' }))).toEqual(list)
  })
})

describe('removeAttachment', () => {
  it('drops the matching id and keeps order', () => {
    const list = [uploading('a'), failed('b'), ready('c')]
    expect(removeAttachment(list, 'b').map((a) => a.localId)).toEqual(['a', 'c'])
  })

  it('removes a failed attachment, which is how the user unblocks a send', () => {
    const list = [ready('a'), failed('b')]
    expect(decideSend({ hasText: true, summary: summarize(list) })).toBe('reject-failed')
    expect(decideSend({ hasText: true, summary: summarize(removeAttachment(list, 'b')) })).toBe('send')
  })

  it('treats an unknown id as a no-op', () => {
    const list = [uploading('a')]
    expect(removeAttachment(list, 'zzz')).toEqual(list)
  })
})

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('counts an empty list as settled', () => {
    expect(summarize([])).toEqual({ total: 0, uploading: 0, ready: 0, failed: 0, allSettled: true })
  })

  it('counts each status', () => {
    const s = summarize([uploading('a'), uploading('b'), ready('c'), failed('d')])
    expect(s).toEqual({ total: 4, uploading: 2, ready: 1, failed: 1, allSettled: false })
  })

  it('is settled once nothing is in flight, even with a failure', () => {
    expect(summarize([ready('a'), failed('b')]).allSettled).toBe(true)
  })
})

describe('readyDocumentIds', () => {
  it('returns the ids of ready attachments, in order', () => {
    expect(readyDocumentIds([ready('a', 'doc-1'), uploading('b'), ready('c', 'doc-2')]))
      .toEqual(['doc-1', 'doc-2'])
  })

  it('never returns an id from an uploading attachment', () => {
    expect(readyDocumentIds([uploading('a')])).toEqual([])
  })

  it('never returns an id from a failed attachment, even if one is somehow set', () => {
    // Defence in depth: `withFailure` already strips it, but the send path
    // must not depend on any other code having done the right thing.
    const corrupt = { ...failed('a'), documentId: 'doc-ghost' } as Attachment
    expect(readyDocumentIds([corrupt])).toEqual([])
  })

  it('skips a ready attachment with no id rather than emitting undefined', () => {
    const odd = { ...ready('a'), documentId: undefined } as Attachment
    expect(readyDocumentIds([odd])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Send decision — full truth table
// ---------------------------------------------------------------------------

describe('decideSend — truth table', () => {
  const cases: Array<{
    hasText: boolean
    list: Attachment[]
    expected: SendDecision
    why: string
  }> = [
    { hasText: false, list: [], expected: 'reject-empty', why: 'nothing at all' },
    { hasText: false, list: [ready('a')], expected: 'reject-empty', why: 'attachment-only: ChatRequest.message is required' },
    { hasText: false, list: [uploading('a')], expected: 'reject-empty', why: 'empty text outranks everything' },
    { hasText: false, list: [failed('a')], expected: 'reject-empty', why: 'no point reporting a failure for a message that is empty' },
    { hasText: true, list: [], expected: 'send', why: 'ordinary text message' },
    { hasText: true, list: [ready('a')], expected: 'send', why: 'everything uploaded' },
    { hasText: true, list: [ready('a'), ready('b')], expected: 'send', why: 'several, all uploaded' },
    { hasText: true, list: [uploading('a')], expected: 'defer', why: 'hold the send until the upload settles' },
    { hasText: true, list: [ready('a'), uploading('b')], expected: 'defer', why: 'one still in flight is enough to hold' },
    { hasText: true, list: [failed('a')], expected: 'reject-failed', why: 'a dropped file must be an explicit decision' },
    { hasText: true, list: [ready('a'), failed('b')], expected: 'reject-failed', why: 'failure outranks the ready ones' },
    { hasText: true, list: [uploading('a'), failed('b')], expected: 'reject-failed', why: 'failure outranks an in-flight upload: deferring would wait forever' },
  ]

  for (const { hasText, list, expected, why } of cases) {
    const shape = list.map((a) => a.status as AttachmentStatus).join('+') || 'none'
    it(`hasText=${hasText} attachments=[${shape}] → ${expected} (${why})`, () => {
      expect(decideSend({ hasText, summary: summarize(list) })).toBe(expected)
    })
  }

  it('the send path only ever ships ids from ready attachments', () => {
    const list = [ready('a', 'doc-1'), uploading('b')]
    expect(decideSend({ hasText: true, summary: summarize(list) })).toBe('defer')
    // …and after the second one lands, both ids go — not before.
    const settled = updateAttachment(list, 'b', (a) => withUploaded(a, { id: 'doc-2' }))
    expect(decideSend({ hasText: true, summary: summarize(settled) })).toBe('send')
    expect(readyDocumentIds(settled)).toEqual(['doc-1', 'doc-2'])
  })
})

describe('resolveDeferred — truth table', () => {
  const cases: Array<{ list: Attachment[]; expected: string; why: string }> = [
    { list: [uploading('a')], expected: 'wait', why: 'still in flight' },
    { list: [ready('a'), uploading('b')], expected: 'wait', why: 'one still in flight' },
    { list: [ready('a')], expected: 'dispatch', why: 'everything landed' },
    { list: [ready('a'), ready('b')], expected: 'dispatch', why: 'all landed' },
    { list: [], expected: 'dispatch', why: 'every attachment was removed while the send was held — send the text' },
    { list: [failed('a')], expected: 'abort', why: 'release the held send; waiting would never end' },
    { list: [ready('a'), failed('b')], expected: 'abort', why: 'a failure outranks the successes' },
    { list: [uploading('a'), failed('b')], expected: 'abort', why: 'no point waiting for the rest' },
  ]

  for (const { list, expected, why } of cases) {
    const shape = list.map((a) => a.status).join('+') || 'none'
    it(`[${shape}] → ${expected} (${why})`, () => {
      expect(resolveDeferred(summarize(list))).toBe(expected)
    })
  }

  it('a held send never dispatches while an upload is running', () => {
    // The invariant restated as a property: `dispatch` implies nothing in flight.
    const lists: Attachment[][] = [
      [], [uploading('a')], [ready('a')], [failed('a')],
      [ready('a'), uploading('b')], [ready('a'), failed('b')], [uploading('a'), failed('b')],
    ]
    for (const list of lists) {
      const summary = summarize(list)
      if (resolveDeferred(summary) === 'dispatch') {
        expect(summary.uploading).toBe(0)
        expect(summary.failed).toBe(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

describe('describeUploadFailure', () => {
  it('prefers the server message — it knows which limit or which format', () => {
    expect(describeUploadFailure(413, 'Maximum size is 25 MB')).toBe('Maximum size is 25 MB')
  })

  it('distinguishes 413, 415 and 422 when the server said nothing', () => {
    expect(describeUploadFailure(413)).toBe('File too large')
    expect(describeUploadFailure(415)).toBe('Unsupported file format')
    expect(describeUploadFailure(422)).toBe('File could not be read (malformed or damaged)')
    // They must not collapse into one another.
    expect(new Set([describeUploadFailure(413), describeUploadFailure(415), describeUploadFailure(422)]).size).toBe(3)
  })

  it('names a network failure rather than inventing an HTTP status', () => {
    expect(describeUploadFailure(0)).toBe('Network error — the file never reached the server')
  })

  it('falls back to the status for anything else', () => {
    expect(describeUploadFailure(500)).toBe('Upload failed (HTTP 500)')
  })

  it('ignores an HTML error page rather than showing markup to the user', () => {
    expect(describeUploadFailure(413, '<html><body>Request Entity Too Large</body></html>'))
      .toBe('File too large')
  })

  it('ignores a whitespace-only or overlong body', () => {
    expect(describeUploadFailure(415, '   ')).toBe('Unsupported file format')
    expect(describeUploadFailure(422, 'x'.repeat(500))).toBe('File could not be read (malformed or damaged)')
  })
})

describe('formatBytes', () => {
  it('formats each magnitude', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 * 3.2)).toBe('3.2 MB')
    expect(formatBytes(1024 * 1024 * 512)).toBe('512 MB')
    expect(formatBytes(1024 ** 3 * 2)).toBe('2.0 GB')
  })

  it('returns nothing for a nonsensical size rather than "NaN B"', () => {
    expect(formatBytes(NaN)).toBe('')
    expect(formatBytes(-1)).toBe('')
  })
})

describe('truncateFilename', () => {
  it('leaves a short name alone', () => {
    expect(truncateFilename('shot.png')).toBe('shot.png')
  })

  it('keeps the extension — it is the part that says what the file is', () => {
    const out = truncateFilename('quarterly-report-final-v3-really-final.pdf')
    expect(out.endsWith('.pdf')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(22)
    expect(out).toContain('…')
  })

  it('keeps the start of the name, not only its tail', () => {
    expect(truncateFilename('quarterly-report-final-v3.pdf').startsWith('quarter')).toBe(true)
  })

  it('treats a dotfile as having no extension', () => {
    const out = truncateFilename('.averyveryverylongdotfilename')
    expect(out.length).toBeLessThanOrEqual(22)
  })

  it('does not mistake a long suffix for an extension', () => {
    // No extension is detected here, so the whole name is elided in the middle
    // rather than being split around the last dot.
    const out = truncateFilename('archive.backup-2026-09-24-final')
    expect(out).not.toContain('….backup-2026-09-24-final')
    expect(out.length).toBeLessThanOrEqual(22)
  })
})

describe('filesFromClipboard', () => {
  const item = (kind: string, file: File | null): DataTransferItem =>
    ({ kind, type: file?.type ?? '', getAsFile: () => file }) as unknown as DataTransferItem

  const asList = (items: DataTransferItem[]): DataTransferItemList =>
    Object.assign([...items], { length: items.length }) as unknown as DataTransferItemList

  it('returns nothing for a plain text paste — the default paste must be untouched', () => {
    expect(filesFromClipboard(asList([item('string', null)]))).toEqual([])
  })

  it('picks up a pasted screenshot', () => {
    const png = new File([new Uint8Array([1, 2])], 'image.png', { type: 'image/png' })
    expect(filesFromClipboard(asList([item('file', png)])).map((f) => f.name)).toEqual(['image.png'])
  })

  it('ignores the text/html twin the clipboard carries alongside the image', () => {
    const png = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })
    const files = filesFromClipboard(asList([item('string', null), item('file', png), item('string', null)]))
    expect(files).toHaveLength(1)
  })

  it('names a nameless pasted file — Safari gives none and the server needs one', () => {
    const anonymous = new File([new Uint8Array([1])], '', { type: 'image/png' })
    expect(filesFromClipboard(asList([item('file', anonymous)]))[0].name).toBe('pasted-image.png')
  })

  it('tolerates an absent clipboard', () => {
    expect(filesFromClipboard(null)).toEqual([])
    expect(filesFromClipboard(undefined)).toEqual([])
  })
})
