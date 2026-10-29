/**
 * Which attachments can be shown as a picture.
 *
 * Deliberately a short, closed list. These four are exactly the types the
 * backend records when it inspects the bytes of an upload
 * (`chat::message_attachments::is_image`), so "previewable" and "sent inline to
 * the model as an image" mean the same set — a file the browser could draw but
 * the model would receive as base64 noise would be a thumbnail that promises
 * something the turn does not deliver.
 *
 * SVG is excluded on purpose: served from `/documents/:id/raw` it is a
 * document a browser will happily execute, and `Content-Disposition:
 * attachment` is what keeps that from being a script host. Inlining it as an
 * `<img>` would still be safe today, but the exclusion is what keeps anyone
 * from later "fixing" the raw endpoint into `inline` once a thumbnail appears
 * to work.
 */
export const PREVIEWABLE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const

/** Parameters (`;charset=…`) are not part of the type. */
function bareType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase()
}

/** Is this MIME type one we draw as an image? Unknown or absent → no. */
export function isPreviewableImage(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  const type = bareType(mimeType)
  return (PREVIEWABLE_IMAGE_TYPES as readonly string[]).includes(type)
}
