/**
 * What KIND of file an attachment is, and how the chat can show it.
 *
 * ## Why the extension still matters
 *
 * The backend records a MIME type derived from the bytes, and it is honest —
 * but coarse where it matters most: everything it reads as text comes back as
 * `text/plain`. A `.csv`, a `.md`, a `.rs` and a 400-page `.log` are therefore
 * indistinguishable by type alone, and an `.mp3` — nothing recognises its magic
 * — comes back as `application/octet-stream`.
 *
 * So the rule is: **the recorded type wins when it is specific** (an image, a
 * PDF, an Office container), **the extension decides otherwise**. A filename is
 * untrusted input, but it is only ever used to pick an icon and a viewer, never
 * a path, a permission or a fetch target — and getting it wrong degrades to
 * "no preview", never to something unsafe.
 *
 * ## The families, and why they are not a list of extensions in a component
 *
 * The four things the chat can DO with an attachment are different:
 *
 * * **draw it** — a picture, a PDF page, a player;
 * * **show its text** — everything the extractors read, including a Word file
 *   or a spreadsheet, whose text the platform already has;
 * * **explain it** — an archive or a binary nobody can read, with a download;
 * * and the download, which every one of them gets.
 *
 * Keeping the decision here (and tested without a DOM) is what stops the
 * component from growing an `if (mime.startsWith(...))` ladder that silently
 * disagrees with itself.
 */

/** A family of file, as the chat presents it. */
export type AttachmentKind =
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'word'
  | 'spreadsheet'
  | 'presentation'
  | 'text'
  | 'code'
  | 'archive'
  | 'other'

/** How an attachment is rendered when opened. */
export type PreviewMode = 'image' | 'pdf' | 'text' | 'audio' | 'video' | 'none'

/** Lowercased, without parameters: `Text/Plain; charset=utf-8` → `text/plain`. */
function bareType(mimeType: string | null | undefined): string {
  return (mimeType ?? '').split(';')[0].trim().toLowerCase()
}

/** Extension of a filename, lowercased and without the dot. `''` when none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  // A leading dot is a dotfile, not an extension.
  if (dot <= 0 || dot === filename.length - 1) return ''
  return filename.slice(dot + 1).toLowerCase()
}

/** Types whose recorded MIME is already a family on its own. */
const MIME_KINDS: Record<string, AttachmentKind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/msword': 'word',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/rtf': 'word',
  'text/csv': 'spreadsheet',
  'application/zip': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
  'application/json': 'text',
  'application/xml': 'text',
}

/** Extensions, by family. Only ever used to pick an icon and a viewer. */
const EXTENSION_KINDS: Record<string, AttachmentKind> = {
  // pictures
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  bmp: 'image', svg: 'image', avif: 'image', heic: 'image', heif: 'image',
  tif: 'image', tiff: 'image', ico: 'image',
  // documents
  pdf: 'pdf',
  doc: 'word', docx: 'word', odt: 'word', rtf: 'word', pages: 'word',
  xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet', csv: 'spreadsheet',
  tsv: 'spreadsheet',
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation', key: 'presentation',
  // media
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio',
  flac: 'audio', aac: 'audio', opus: 'audio', aiff: 'audio', wma: 'audio',
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video', mkv: 'video',
  avi: 'video', wmv: 'video', flv: 'video', mpg: 'video', mpeg: 'video',
  // archives
  zip: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive', bz2: 'archive',
  xz: 'archive', '7z': 'archive', rar: 'archive', jar: 'archive',
  // text and source
  txt: 'text', md: 'text', markdown: 'text', mdx: 'text', rst: 'text',
  log: 'text', json: 'text', jsonl: 'text', yaml: 'text', yml: 'text',
  toml: 'text', ini: 'text', cfg: 'text', conf: 'text', env: 'text',
  properties: 'text', xml: 'text',
  rs: 'code', ts: 'code', tsx: 'code', js: 'code', jsx: 'code', mjs: 'code',
  cjs: 'code', py: 'code', go: 'code', java: 'code', kt: 'code', kts: 'code',
  c: 'code', h: 'code', cc: 'code', cpp: 'code', hpp: 'code', cs: 'code',
  rb: 'code', php: 'code', sh: 'code', bash: 'code', zsh: 'code', sql: 'code',
  html: 'code', htm: 'code', css: 'code', scss: 'code', sass: 'code',
  less: 'code', vue: 'code', svelte: 'code', swift: 'code', lua: 'code',
  zig: 'code', scala: 'code', ex: 'code', exs: 'code', erl: 'code',
  hs: 'code', ml: 'code', clj: 'code', dart: 'code', pl: 'code',
}

/**
 * The family of an attachment.
 *
 * Order, and why: the recorded MIME is evidence about the BYTES, so it wins;
 * `image/*`, `audio/*` and `video/*` are taken at their word even when the
 * extension disagrees (a `.png` that is really a JPEG is still a picture); then
 * the extension, which is all we have for the `text/plain` and
 * `application/octet-stream` cases; then `other`, which is a real answer and not
 * a failure — it means "no preview, download only".
 */
export function attachmentKind(
  filename: string,
  mimeType: string | null | undefined,
): AttachmentKind {
  const mime = bareType(mimeType)

  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  const byMime = MIME_KINDS[mime]
  if (byMime) return byMime

  return EXTENSION_KINDS[fileExtension(filename)] ?? 'other'
}

/**
 * How to render this attachment once opened.
 *
 * The text-bearing families are grouped on purpose: the platform already
 * extracted a Word file, a spreadsheet and a presentation into chunks, so the
 * most useful "view" of them in a chat is their TEXT — the alternative would be
 * to say "cannot preview" about a document whose content the server is holding.
 */
export function previewMode(kind: AttachmentKind): PreviewMode {
  switch (kind) {
    case 'image':
      return 'image'
    case 'pdf':
      return 'pdf'
    case 'audio':
      return 'audio'
    case 'video':
      return 'video'
    case 'text':
    case 'code':
    case 'word':
    case 'spreadsheet':
    case 'presentation':
      return 'text'
    case 'archive':
    case 'other':
      return 'none'
  }
}

/**
 * The MIME type to give the object URL when the recorded one is useless.
 *
 * A blob URL carries the blob's type, and a browser will not put a PDF in a
 * `<iframe>` nor an `.mp4` in a `<video>` when that type is
 * `application/octet-stream`. So when the server could not name the type — it
 * detects no audio or video magic — the family supplies a plausible one, which
 * only ever affects how the bytes are rendered locally: nothing is re-uploaded
 * and nothing is trusted.
 */
export function previewMime(kind: AttachmentKind, filename: string, mimeType: string): string {
  const mime = bareType(mimeType)
  if (mime && mime !== 'application/octet-stream') return mime
  const ext = fileExtension(filename)
  switch (kind) {
    case 'image':
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
      if (ext) return `image/${ext === 'svg' ? 'svg+xml' : ext === 'ico' ? 'x-icon' : ext}`
      return 'image/png'
    case 'pdf':
      return 'application/pdf'
    case 'audio':
      if (ext === 'mp3') return 'audio/mpeg'
      if (ext === 'm4a') return 'audio/mp4'
      return ext ? `audio/${ext}` : 'audio/mpeg'
    case 'video':
      return ext ? `video/${ext === 'mkv' ? 'x-matroska' : ext}` : 'video/mp4'
    case 'text':
    case 'code':
      return 'text/plain; charset=utf-8'
    default:
      return mime || 'application/octet-stream'
  }
}
