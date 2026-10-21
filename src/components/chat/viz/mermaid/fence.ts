/**
 * A diagram in the agent's text: a fenced code block of language `mermaid`. `MarkdownText`
 * hands it to `MermaidFence`, which shows it as a `mermaid` viz block.
 *
 * EAGER (imported by the markdown renderer): string checks only. Mermaid, its parser and
 * the SVG sanitizer live in the lazy chunk (`MermaidViz`).
 */

/** Language of the fenced block (```mermaid). */
export const MERMAID_LANG = 'mermaid'

/** A diagram longer than this is refused before Mermaid is even loaded (also its `maxTextSize`). */
export const MERMAID_MAX_CHARS = 20_000

export type MermaidFenceParse =
  | { ok: true; source: string; title?: string }
  | { ok: false; reason: 'empty' | 'too_large' }

/** The title a diagram gives itself: front matter `title:`, else a `title …` line (gantt, pie, xychart…). */
export function mermaidTitle(source: string): string | undefined {
  const front = /^---\s*\n([\s\S]*?)\n---/.exec(source)
  const fromFront = front ? /^\s*title:\s*["']?(.+?)["']?\s*$/m.exec(front[1] ?? '')?.[1] : undefined
  const fromLine = /^\s*(?:pie\s+)?title\s+(.+?)\s*$/m.exec(source)?.[1]
  const title = (fromFront ?? fromLine)?.trim()
  return title ? title.slice(0, 80) : undefined
}

/** Check the body of a ```mermaid block. Never throws. */
export function parseMermaidFence(raw: string): MermaidFenceParse {
  const source = raw.trim()
  if (!source) return { ok: false, reason: 'empty' }
  if (source.length > MERMAID_MAX_CHARS) return { ok: false, reason: 'too_large' }
  return { ok: true, source, title: mermaidTitle(source) }
}
