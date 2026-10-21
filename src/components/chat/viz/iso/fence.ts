/**
 * The way a model shows a 3D scene in the chat, without any backend change: a fenced
 * code block of language `iso-scene` whose body is JSON (the format is documented in
 * `./compile.ts`). `MarkdownText` hands the block to `IsoSceneFence`, which turns it into
 * an `iso_scene` viz block.
 *
 * This module is EAGER (it is imported by the markdown renderer): it parses JSON and
 * nothing else. The engine and its validation live in the lazy chunk (`IsoSceneViz`).
 */

/** Language of the fenced block (```iso-scene). */
export const ISO_SCENE_LANG = 'iso-scene'

/** A fenced scene larger than this is refused before it is parsed. */
export const ISO_SCENE_MAX_CHARS = 32_000

export type FenceParse =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: 'too_large' | 'not_json' | 'not_object'; detail?: string }

/** Parse the body of an ```iso-scene block. Never throws. */
export function parseIsoSceneFence(source: string): FenceParse {
  if (source.length > ISO_SCENE_MAX_CHARS) return { ok: false, reason: 'too_large', detail: String(source.length) }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (e) {
    return { ok: false, reason: 'not_json', detail: e instanceof Error ? e.message : String(e) }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'not_object' }
  return { ok: true, data: value as Record<string, unknown> }
}

/** The language a `<code>` class list names (`language-iso-scene hljs` → `iso-scene`), or null. */
export function fenceLang(className: unknown): string | null {
  const classes = typeof className === 'string' ? className.split(/\s+/) : Array.isArray(className) ? className : []
  for (const c of classes) if (typeof c === 'string' && c.startsWith('language-')) return c.slice('language-'.length)
  return null
}

/** The text of a hast node (the `<code>` element react-markdown passes to a `pre` override). */
export function hastText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; value?: unknown; children?: unknown[] }
  if (n.type === 'text' && typeof n.value === 'string') return n.value
  return Array.isArray(n.children) ? n.children.map(hastText).join('') : ''
}

/** The text fallback of a scene: its caption, else its title and the station labels, else the source. */
export function isoSceneFallback(data: Record<string, unknown>, source: string): string {
  if (typeof data.caption === 'string' && data.caption.trim()) return data.caption.trim()
  const labels = Array.isArray(data.stations)
    ? data.stations.map((s) => (s && typeof s === 'object' ? (s as { label?: unknown }).label : undefined)).filter((l): l is string => typeof l === 'string')
    : []
  const title = typeof data.title === 'string' ? data.title : ''
  if (title || labels.length) return [title, labels.join(' → ')].filter(Boolean).join(' — ')
  return source
}

/** A fence closes on a line of its own made of ``` / ~~~ (code) or $$ (math). */
const CLOSING_FENCE = /\n[ \t]*(?:`{3,}|~{3,}|\${2,})[ \t]*$/

/**
 * Whether the block of `text` at `position` is closed. While the message streams, the last
 * block may still miss its closing fence: its body is unfinished, and it is "composing".
 */
export function fenceClosed(text: string, position: unknown): boolean {
  const p = position as { start?: { offset?: number }; end?: { offset?: number } } | undefined
  const start = p?.start?.offset
  const end = p?.end?.offset
  if (typeof start !== 'number' || typeof end !== 'number') return false
  return CLOSING_FENCE.test(text.slice(start, end).trimEnd())
}
