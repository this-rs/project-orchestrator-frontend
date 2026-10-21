/**
 * TeX → sanitized KaTeX markup. LAZY: imported by `MathViz` only.
 *
 * - `trust: false`: no `\href`, `\url`, `\includegraphics`, `\htmlClass`/`\htmlStyle`…
 * - `strict`: anything KaTeX warns about is a refusal, except two habits of models that
 *   KaTeX renders anyway (`\\` directly in a display formula, a Unicode letter in math).
 * - Bounded: `maxSize` (no 1000em rules), `maxExpand` (no macro bomb), fresh macros per
 *   formula (a `\gdef` of one formula never leaks into the next).
 * - Errors come back as text (KaTeX's message), never as a thrown exception or red TeX.
 * - The markup goes through DOMPurify (`sanitizeMath`) before it reaches the DOM; KaTeX's
 *   HTML output only (its MathML copy carries `<annotation>`, which DOMPurify refuses).
 *
 * Inference rules (derivations), which KaTeX has no package for:
 * - `\inferrule[label]{P1 \\ P2}{C}` and `\inferrule*[right=label]{…}{…}` (mathpartir):
 *   premises side by side, the label on the right (`expandInferrules`);
 * - `\infer{C}{P}` (proof.sty order) — a macro;
 * - `\dfrac`, `\cfrac` and `array` nest them. bussproofs (`\AxiomC`…) is refused.
 */
import katex, { type KatexOptions } from 'katex'
import { sanitizeMath } from '../sanitize'

export type MathResult = { ok: true; html: string } | { ok: false; error: string }

/** Macros of every formula (copied for each one: KaTeX writes `\gdef` into this object). */
export const INFERENCE_MACROS: Readonly<Record<string, string>> = {
  // Fallback for an \inferrule `expandInferrules` could not read (premises stacked).
  '\\inferrule': '\\dfrac{\\begin{gathered}#1\\end{gathered}}{\\begin{gathered}#2\\end{gathered}}',
  '\\infer': '\\dfrac{\\begin{gathered}#2\\end{gathered}}{\\begin{gathered}#1\\end{gathered}}',
}

/** The balanced group opening at `tex[i]` (`{`→`}` or `[`→`]`), or null. Escaped braces do not count. */
function group(tex: string, i: number, open: '{' | '['): { body: string; end: number } | null {
  if (tex[i] !== open) return null
  const close = open === '{' ? '}' : ']'
  let depth = 0
  for (let j = i; j < tex.length; j++) {
    const c = tex[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    if (open === '[' ? c === close && depth === 0 : depth === 0) return { body: tex.slice(i + 1, j), end: j + 1 }
    if (depth < 0) return null
  }
  return null
}

const skipSpaces = (tex: string, i: number) => {
  while (i < tex.length && /\s/.test(tex[i]!)) i++
  return i
}

/** `a \\ b` at brace depth 0 → `a \qquad b` (mathpartir lays premises out on one line). */
function sideBySide(body: string): string {
  let out = ''
  let depth = 0
  for (let j = 0; j < body.length; j++) {
    const c = body[j]!
    if (c === '\\' && body[j + 1] === '\\' && depth === 0) {
      out += ' \\qquad '
      j++
      continue
    }
    if (c === '\\') {
      out += c + (body[j + 1] ?? '')
      j++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    out += c
  }
  return out
}

/** The label of `[right=Cut]`, `[Cut]`, `[left=$\land I$]` — as math, without its dollars. */
function ruleLabel(opts: string): string {
  const named = /(?:^|,)\s*(?:right|Right|left|Left|lab|Lab)\s*=\s*([^,]*)/.exec(opts)
  return (named ? named[1]! : opts).replace(/\$/g, '').trim()
}

/** mathpartir's `\inferrule` as a fraction KaTeX can draw. Unreadable ones are left to the macro. */
export function expandInferrules(tex: string, depth = 0): string {
  if (depth > 8 || !tex.includes('\\inferrule')) return tex
  let out = ''
  let i = 0
  for (;;) {
    const at = tex.indexOf('\\inferrule', i)
    if (at < 0) return out + tex.slice(i)
    let k = at + '\\inferrule'.length
    if (/[A-Za-z]/.test(tex[k] ?? '')) {
      out += tex.slice(i, k)
      i = k
      continue
    }
    if (tex[k] === '*') k++
    k = skipSpaces(tex, k)
    const opts = group(tex, k, '[')
    if (opts) k = skipSpaces(tex, opts.end)
    const premises = group(tex, k, '{')
    const conclusion = premises ? group(tex, skipSpaces(tex, premises.end), '{') : null
    if (!premises || !conclusion) {
      out += tex.slice(i, k)
      i = k
      continue
    }
    const p = sideBySide(expandInferrules(premises.body, depth + 1))
    const c = sideBySide(expandInferrules(conclusion.body, depth + 1))
    const label = opts ? ruleLabel(opts.body) : ''
    out += tex.slice(i, at) + `{\\dfrac{${p}}{${c}}${label ? `\\;{\\scriptstyle(${label})}` : ''}}`
    i = conclusion.end
  }
}

const TOLERATED = new Set(['newLineInDisplayMode', 'unicodeTextInMathMode'])

const strict: KatexOptions['strict'] = (code: string) => (TOLERATED.has(code) ? 'ignore' : 'error')

export function katexOptions(display: boolean): KatexOptions {
  return {
    displayMode: display,
    throwOnError: true,
    trust: false,
    strict,
    maxSize: 20,
    maxExpand: 500,
    // HTML only: DOMPurify (rightly) drops MathML's <semantics>/<annotation>; the TeX is the
    // formula's accessible name instead (`aria-label` in MathViz).
    output: 'html',
    macros: { ...INFERENCE_MACROS },
  }
}

export function renderTex(tex: string, display: boolean): MathResult {
  try {
    return { ok: true, html: sanitizeMath(katex.renderToString(expandInferrules(tex), katexOptions(display))) }
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 400) }
  }
}
