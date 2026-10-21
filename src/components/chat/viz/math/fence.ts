/**
 * Formulas in the agent's text: a fenced block of language `math`, or `$$…$$` (on its own
 * lines: a display formula; inside a sentence: inline). A single `$` is never math ("$5
 * and $10" stays prose). `MarkdownText` hands them to `MathFence`.
 *
 * EAGER (imported by the markdown renderer): string checks only. KaTeX, its stylesheet
 * and fonts live in the lazy chunk (`MathViz`).
 */

/** Language of the math blocks: ```math, and `$$…$$` (remark-math names both `language-math`). */
export const MATH_LANG = 'math'

/** A formula longer than this is refused before KaTeX is even loaded. */
export const MATH_MAX_CHARS = 4_000

export type MathFenceParse = { ok: true; tex: string } | { ok: false; reason: 'empty' | 'too_large' }

/** Check the body of a formula. Never throws. */
export function parseMathFence(raw: string): MathFenceParse {
  const tex = raw.trim()
  if (!tex) return { ok: false, reason: 'empty' }
  if (tex.length > MATH_MAX_CHARS) return { ok: false, reason: 'too_large' }
  return { ok: true, tex }
}
