/**
 * Images carried by a tool result, so a renderer can SHOW them instead of
 * printing their base64 payload as text.
 *
 * The result reaches the chat as a string (`chatAssembly` stringifies a
 * structured result). An image the agent looked at — `Read` on a PNG, an MCP
 * tool returning a picture — is a list of content blocks in Anthropic's shape:
 *
 *   [{ "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "…" } }]
 *
 * Only that shape, and only the raster types a browser shows in an `<img>`
 * without running anything, is accepted. Anything else — including `image/svg+xml`,
 * a text result that merely mentions an image, or invalid JSON — yields no image,
 * and the renderer keeps its text view.
 */

export const TOOL_IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/** Base64 of a few MiB: beyond this, the `<img>` is not worth the page weight. */
const MAX_BASE64_CHARS = 8 * 1024 * 1024

/** One image of a tool result, ready for a `data:` URL. */
export interface ToolResultImage {
  mediaType: string
  /** Standard base64, no `data:` prefix. */
  data: string
}

/** The `data:` URL to put in an `<img src>`. */
export function toolImageDataUrl(image: ToolResultImage): string {
  return `data:${image.mediaType};base64,${image.data}`
}

function imageOf(block: unknown): ToolResultImage | null {
  if (!block || typeof block !== 'object') return null
  const b = block as Record<string, unknown>
  if (b.type !== 'image') return null
  const source = b.source as Record<string, unknown> | undefined
  if (!source || typeof source !== 'object') return null
  if (source.type !== 'base64') return null
  const mediaType = source.media_type
  const data = source.data
  if (typeof mediaType !== 'string' || !TOOL_IMAGE_MEDIA_TYPES.has(mediaType)) return null
  if (typeof data !== 'string' || data.length === 0 || data.length > MAX_BASE64_CHARS) return null
  // A base64 payload has no whitespace and no prefix: a `data:` URL pasted here
  // would double-prefix the image, so it is refused rather than repaired.
  if (/[\s]/.test(data) || data.startsWith('data:')) return null
  return { mediaType, data }
}

/**
 * The images in a tool result's content. Empty when the content is not JSON,
 * or holds no image block of an accepted type.
 */
export function toolResultImages(content: string | undefined): ToolResultImage[] {
  if (!content) return []
  const trimmed = content.trim()
  // Cheap guard before JSON.parse: a plain-text result (the common case) is
  // never parsed, and a long one stops at its first character.
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }
  const blocks = Array.isArray(parsed) ? parsed : [parsed]
  const images: ToolResultImage[] = []
  for (const block of blocks) {
    const image = imageOf(block)
    if (image) images.push(image)
  }
  return images
}
