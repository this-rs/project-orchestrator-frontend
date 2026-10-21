/**
 * Mermaid source → sanitized SVG, once per source and theme. LAZY: imported by
 * `MermaidViz` only (Mermaid itself is in this chunk).
 */
import mermaid from 'mermaid'
import { sanitizeSvg } from '../sanitize'
import { MERMAID_MAX_CHARS } from './fence'
import { mermaidConfig, themeMode, type ThemeMode } from './theme'

export type MermaidResult = { ok: true; svg: string } | { ok: false; error: string }

let initialized: ThemeMode | null = null
let seq = 0
const cache = new Map<string, Promise<MermaidResult>>()
const CACHE_MAX = 64

const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : String((e as { str?: unknown })?.str ?? e)).slice(0, 600)

async function render(source: string, mode: ThemeMode): Promise<MermaidResult> {
  if (initialized !== mode) {
    mermaid.initialize(mermaidConfig(mode, MERMAID_MAX_CHARS))
    initialized = mode
  }
  const id = `po-mermaid-${++seq}`
  try {
    await mermaid.parse(source)
    const { svg } = await mermaid.render(id, source)
    const clean = sanitizeSvg(svg)
    return clean.includes('<svg') ? { ok: true, svg: clean } : { ok: false, error: 'empty SVG' }
  } catch (e) {
    return { ok: false, error: message(e) }
  } finally {
    // Mermaid renders in a temporary element of <body>; it is gone on success, not always on error.
    for (const stray of [id, `d${id}`]) document.getElementById(stray)?.remove()
  }
}

/** The sanitized SVG of a diagram (or Mermaid's reason), rendered once per source and theme. */
export function renderMermaid(source: string, mode: ThemeMode = themeMode()): Promise<MermaidResult> {
  const key = `${mode}\u0000${source}`
  let hit = cache.get(key)
  if (!hit) {
    hit = render(source, mode)
    cache.set(key, hit)
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
  }
  return hit
}
