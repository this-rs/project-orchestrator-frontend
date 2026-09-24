/**
 * State machine for files attached to a chat message.
 *
 * ## Why this exists
 *
 * Three questions decide whether attachments feel solid or flaky, and all
 * three are product decisions rather than rendering details:
 *
 * 1. **When does the upload start?** At add time, not at send time. A user who
 *    clicks send and then waits with no explanation assumes the app is broken.
 * 2. **What happens to a send while an upload is still in flight?** It is held,
 *    not dropped (`ATTACHMENT_POLICY.deferSendWhileUploading`).
 * 3. **What id goes on the wire?** Only one the server has already returned.
 *    This is the invariant the whole module exists to protect — see
 *    `readyDocumentIds` and the `withFailure` transition.
 *
 * Kept out of `Attachments.tsx` so the component file exports only the
 * component (React Fast Refresh requirement), and so the rules are unit-tested
 * without rendering anything — same split as `inputAction.ts` and
 * `messageQueue.ts`.
 */

/**
 * Where one attachment is in its life.
 *
 * There is no `pending` state: `ATTACHMENT_POLICY.uploadOnAdd` means an
 * attachment is born uploading. A file that has been chosen but is not yet on
 * its way is a state the user would have to be told about, and it would exist
 * for no reason.
 */
export type AttachmentStatus = 'uploading' | 'ready' | 'error'

export interface Attachment {
  /**
   * Client-side identity, stable for the attachment's whole life.
   *
   * Distinct from `documentId` on purpose: React keys, progress routing and
   * the remove button all need an identity from the first frame, and the
   * server id does not exist until the upload resolves — if it ever does.
   */
  localId: string
  filename: string
  sizeBytes: number
  /** MIME type as the browser reported it; '' when unknown. */
  mimeType: string
  status: AttachmentStatus
  /** 0..100. Only meaningful while `uploading`. */
  progress: number
  /**
   * Server-assigned document id. Present if and only if `status === 'ready'`.
   *
   * The whole module maintains that biconditional so that "is this id safe to
   * send?" is answerable by looking at the status alone.
   */
  documentId?: string
  /** Human-readable failure, present if and only if `status === 'error'`. */
  error?: string
  /** Extraction warnings the server reported on success (pages without a text layer…). */
  warnings?: string[]
}

export const ATTACHMENT_POLICY = {
  /**
   * The upload starts when the file is added, not when the message is sent.
   *
   * Sending is then almost always instant, and the wait happens while the user
   * is still typing — where it costs nothing. The cost is uploading files for
   * a message that is never sent; a removed attachment aborts its request, and
   * an abandoned one is the server's problem to garbage-collect, which is the
   * cheaper side of the trade.
   */
  uploadOnAdd: true,

  /**
   * A send composed while an upload is still in flight is HELD, then
   * dispatched on its own once every attachment has settled.
   *
   * The alternative — disabling the send button until uploads finish — throws
   * the click away: the user presses a dead button, nothing happens, and they
   * have to come back and press it again at a moment they have to guess. Here
   * the click is honoured, the text stays visible in the box, and the message
   * leaves by itself.
   *
   * What is never done is sending the message without the attachment, or with
   * an id the server has not issued.
   */
  deferSendWhileUploading: true,

  /**
   * A failed attachment blocks the send instead of being silently dropped.
   *
   * Sending anyway would mean quietly discarding a file the user deliberately
   * attached — the message goes out looking complete and the agent answers
   * without ever seeing the screenshot. Removing the failed thumbnail is one
   * click and makes the decision explicit.
   */
  blockSendOnError: true,

  /**
   * Text is required even when files are attached.
   *
   * Not a UX preference: `ChatRequest.message` is a non-optional `String` in
   * the frozen API contract, so an attachment-only send has nothing to put in
   * it. Revisit here if the contract ever makes `message` optional.
   */
  requireTextWithAttachments: true,

  /** Upper bound on attachments per message, to keep the thumbnail row legible. */
  maxAttachments: 10,
} as const

// ---------------------------------------------------------------------------
// Transitions on a single attachment
// ---------------------------------------------------------------------------

/** A newly added file, already considered to be uploading. */
export function createAttachment(
  localId: string,
  file: { name: string; size: number; type?: string },
): Attachment {
  return {
    localId,
    filename: file.name,
    sizeBytes: file.size,
    mimeType: file.type ?? '',
    status: 'uploading',
    progress: 0,
  }
}

/**
 * Record upload progress.
 *
 * Ignored unless the attachment is still uploading, and never allowed to go
 * backwards: XHR progress events can land after the response (and out of
 * order), and a finished attachment that flickers back to "42%" reads as a
 * failure to the person watching it.
 */
export function withProgress(a: Attachment, percent: number): Attachment {
  if (a.status !== 'uploading') return a
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  if (clamped <= a.progress) return a
  return { ...a, progress: clamped }
}

/**
 * The server accepted the file: it now has an id.
 *
 * This is the only transition that may set `documentId`, which is what makes
 * "ready implies a real server id" checkable by reading this file.
 */
export function withUploaded(
  a: Attachment,
  doc: { id: string; warnings?: string[] },
): Attachment {
  const next: Attachment = {
    ...a,
    status: 'ready',
    progress: 100,
    documentId: doc.id,
    warnings: doc.warnings && doc.warnings.length > 0 ? doc.warnings : undefined,
  }
  delete next.error
  return next
}

/**
 * The upload failed.
 *
 * `documentId` is cleared, not merely ignored. A retry that fails after a
 * success must not leave a stale id behind for `readyDocumentIds` to pick up —
 * that is precisely the "id that does not exist server-side" this module is
 * built to make impossible.
 */
export function withFailure(a: Attachment, message: string): Attachment {
  const next: Attachment = { ...a, status: 'error', error: message }
  delete next.documentId
  delete next.warnings
  return next
}

// ---------------------------------------------------------------------------
// Transitions on the list
// ---------------------------------------------------------------------------

/** Append, up to `maxAttachments`. Over the cap the list is returned unchanged. */
export function addAttachment(
  list: readonly Attachment[],
  a: Attachment,
): Attachment[] {
  if (list.length >= ATTACHMENT_POLICY.maxAttachments) return [...list]
  return [...list, a]
}

/** Apply a transition to one attachment. An unknown id is a no-op, not an error. */
export function updateAttachment(
  list: readonly Attachment[],
  localId: string,
  fn: (a: Attachment) => Attachment,
): Attachment[] {
  return list.map((a) => (a.localId === localId ? fn(a) : a))
}

/** Drop one attachment by local id. Unknown ids are a no-op. */
export function removeAttachment(
  list: readonly Attachment[],
  localId: string,
): Attachment[] {
  return list.filter((a) => a.localId !== localId)
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export interface AttachmentSummary {
  total: number
  uploading: number
  ready: number
  failed: number
  /** No upload is still in flight (true for an empty list). */
  allSettled: boolean
}

export function summarize(list: readonly Attachment[]): AttachmentSummary {
  let uploading = 0
  let ready = 0
  let failed = 0
  for (const a of list) {
    if (a.status === 'uploading') uploading++
    else if (a.status === 'ready') ready++
    else failed++
  }
  return { total: list.length, uploading, ready, failed, allSettled: uploading === 0 }
}

/**
 * The ids to put on the wire.
 *
 * Reads `documentId` only from `ready` attachments — both halves of the check,
 * even though the transitions above already guarantee the invariant. The cost
 * is one comparison; the failure it prevents is a message referencing a
 * document the server has never heard of.
 */
export function readyDocumentIds(list: readonly Attachment[]): string[] {
  const ids: string[] = []
  for (const a of list) {
    if (a.status === 'ready' && a.documentId) ids.push(a.documentId)
  }
  return ids
}

// ---------------------------------------------------------------------------
// Send decision
// ---------------------------------------------------------------------------

/**
 * What a send attempt should do right now.
 *
 * - `send`     — dispatch, with `readyDocumentIds`.
 * - `defer`    — hold the text; it leaves when the uploads settle.
 * - `reject-empty`  — nothing to send.
 * - `reject-failed` — a failed attachment must be removed (or the send would
 *                     silently drop a file the user chose).
 */
export type SendDecision = 'send' | 'defer' | 'reject-empty' | 'reject-failed'

/**
 * Decide, from the composer's state, what a send attempt means.
 *
 * Precedence, and why:
 * 1. `reject-empty` — an empty message is never worth reporting a problem for.
 * 2. `reject-failed` — a failure outranks an in-flight upload: deferring would
 *    hold the message for something that will never resolve.
 * 3. `defer` — uploads still running.
 * 4. `send`.
 */
export function decideSend(state: {
  hasText: boolean
  summary: AttachmentSummary
}): SendDecision {
  if (!state.hasText) return 'reject-empty'
  if (state.summary.failed > 0) return 'reject-failed'
  if (state.summary.uploading > 0) return 'defer'
  return 'send'
}

/**
 * What to do with a send that was deferred, each time the attachments change.
 *
 * - `wait`     — an upload is still running.
 * - `abort`    — one failed; release the held send so the user can act. The
 *                text is still in the composer, so nothing is lost.
 * - `dispatch` — everything settled successfully; the message leaves now.
 *
 * `dispatch` on an empty list is correct: removing every attachment while the
 * send was held leaves an ordinary text message that should go.
 */
export type DeferredOutcome = 'wait' | 'abort' | 'dispatch'

export function resolveDeferred(summary: AttachmentSummary): DeferredOutcome {
  if (summary.failed > 0) return 'abort'
  if (summary.uploading > 0) return 'wait'
  return 'dispatch'
}

// ---------------------------------------------------------------------------
// Presentation helpers (pure, so they are tested here rather than in the DOM)
// ---------------------------------------------------------------------------

/**
 * Turn an upload failure into a sentence worth reading.
 *
 * The three rejections in the API contract mean three different things, and
 * collapsing them into "upload failed" leaves the user with no next move:
 * 413 → use a smaller file, 415 → convert it, 422 → the file is damaged.
 *
 * The server's own message wins whenever it sent one: it can say *which* limit
 * or *which* format, which a client-side table never can. `serverMessage` is
 * server-controlled text and is rendered as React text content, never as HTML.
 */
export function describeUploadFailure(status: number, serverMessage?: string): string {
  const detail = serverMessage?.trim()
  if (detail && detail.length <= 200 && !detail.startsWith('<')) return detail
  switch (status) {
    case 0:
      return 'Network error — the file never reached the server'
    case 413:
      return 'File too large'
    case 415:
      return 'Unsupported file format'
    case 422:
      return 'File could not be read (malformed or damaged)'
    case 401:
    case 403:
      return 'Not allowed to upload here'
    default:
      return `Upload failed (HTTP ${status})`
  }
}

/** Human-readable size, matching what a file manager would show. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/**
 * Shorten a filename from the middle, keeping the extension.
 *
 * The extension is the part that says what the file *is*, and truncating from
 * the end is exactly what removes it. Done here rather than with CSS
 * `text-overflow` for that reason.
 */
export function truncateFilename(name: string, max = 22): string {
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  // A leading dot is a dotfile, not an extension; no extension either if the
  // suffix is implausibly long.
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : ''
  const stem = name.slice(0, name.length - ext.length)
  const keep = Math.max(1, max - ext.length - 1)
  const head = Math.ceil(keep / 2)
  const tail = keep - head
  return tail > 0
    ? `${stem.slice(0, head)}…${stem.slice(stem.length - tail)}${ext}`
    : `${stem.slice(0, head)}…${ext}`
}

/**
 * Pull attachable files out of a paste.
 *
 * Pasting a screenshot is the most-used way to attach one and the most often
 * forgotten. The clipboard also carries the same content as text/html, so this
 * only looks at `kind === 'file'` entries; a plain text paste yields none and
 * the caller must leave the default behaviour alone.
 */
export function filesFromClipboard(items: DataTransferItemList | null | undefined): File[] {
  if (!items) return []
  const files: File[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    // A screenshot pastes as "image.png" (Chrome) or with no name at all
    // (Safari); the server needs *something* to store, so name it here.
    if (file) files.push(file.name ? file : new File([file], 'pasted-image.png', { type: file.type }))
  }
  return files
}
