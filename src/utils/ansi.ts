/**
 * Minimal ANSI escape parser.
 *
 * Splits a string containing ANSI SGR escapes (\x1b[...m) into typed segments
 * `{ text, color?, bold?, dim?, italic?, underline? }` ready to render in React.
 *
 * Supported SGR codes (subset most commonly emitted by Claude Code / CLI tools):
 *   0       reset
 *   1       bold
 *   2       dim
 *   3       italic
 *   4       underline
 *   22      not bold / not dim
 *   23      not italic
 *   24      not underline
 *   30-37   foreground basic colors
 *   90-97   foreground bright colors
 *   38;5;N  256-color palette
 *   38;2;R;G;B  truecolor
 *   39      default foreground
 *
 * Background colors are ignored (we only need foreground for log lines).
 * Unknown codes silently skip.
 *
 * Returning an array of segments (vs. injecting HTML) keeps the renderer XSS-safe.
 */

export interface AnsiSegment {
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
}

const BASIC_COLORS: Record<number, string> = {
  30: '#374151', // black → gray-700
  31: '#f87171', // red
  32: '#4ade80', // green
  33: '#facc15', // yellow
  34: '#60a5fa', // blue
  35: '#c084fc', // magenta
  36: '#22d3ee', // cyan
  37: '#e5e7eb', // white → gray-200
  90: '#6b7280', // bright black → gray-500
  91: '#fca5a5', // bright red
  92: '#86efac', // bright green
  93: '#fde047', // bright yellow
  94: '#93c5fd', // bright blue
  95: '#d8b4fe', // bright magenta
  96: '#67e8f9', // bright cyan
  97: '#f9fafb', // bright white
}

function parse256Color(code: number): string | undefined {
  if (code < 0 || code > 255) return undefined
  if (code < 16) {
    // Map 0-15 to basic palette
    const basic = BASIC_COLORS[code < 8 ? 30 + code : 90 + (code - 8)]
    return basic
  }
  if (code < 232) {
    // 6×6×6 cube
    const n = code - 16
    const r = Math.floor(n / 36)
    const g = Math.floor((n % 36) / 6)
    const b = n % 6
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return rgbToHex(toHex(r), toHex(g), toHex(b))
  }
  // grayscale 232-255
  const v = 8 + (code - 232) * 10
  return rgbToHex(v, v, v)
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

interface SgrState {
  color?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
}

function applySgr(state: SgrState, codes: number[]): SgrState {
  const next: SgrState = { ...state }
  let i = 0
  while (i < codes.length) {
    const c = codes[i]
    if (c === 0) {
      next.color = undefined
      next.bold = false
      next.dim = false
      next.italic = false
      next.underline = false
    } else if (c === 1) next.bold = true
    else if (c === 2) next.dim = true
    else if (c === 3) next.italic = true
    else if (c === 4) next.underline = true
    else if (c === 22) {
      next.bold = false
      next.dim = false
    } else if (c === 23) next.italic = false
    else if (c === 24) next.underline = false
    else if (c === 39) next.color = undefined
    else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) {
      next.color = BASIC_COLORS[c]
    } else if (c === 38) {
      // Extended color
      const mode = codes[i + 1]
      if (mode === 5) {
        const idx = codes[i + 2]
        next.color = parse256Color(idx) ?? next.color
        i += 2
      } else if (mode === 2) {
        const r = codes[i + 2] ?? 0
        const g = codes[i + 3] ?? 0
        const b = codes[i + 4] ?? 0
        next.color = rgbToHex(r, g, b)
        i += 4
      }
    }
    // background colors (40-47, 100-107, 48;5;N, 48;2;R;G;B) intentionally skipped
    else if (c === 48) {
      const mode = codes[i + 1]
      if (mode === 5) i += 2
      else if (mode === 2) i += 4
    }
    i++
  }
  return next
}

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[([0-9;]*)m/g

/**
 * Parse an ANSI-colored string into an array of typed segments.
 *
 * The input string is split at each SGR escape; each segment carries the
 * current style and the text run that follows it. Empty text segments are
 * dropped to keep the output compact.
 */
export function parseAnsi(input: string): AnsiSegment[] {
  if (!input) return []
  const segments: AnsiSegment[] = []
  let state: SgrState = {}
  let lastIndex = 0

  ANSI_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ANSI_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      const text = input.slice(lastIndex, match.index)
      if (text) segments.push({ text, ...state })
    }
    const codes = match[1]
      .split(';')
      .filter((s) => s.length > 0)
      .map((s) => parseInt(s, 10))
    // If no codes (`\x1b[m`), treat as reset
    state = applySgr(state, codes.length === 0 ? [0] : codes)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < input.length) {
    const text = input.slice(lastIndex)
    if (text) segments.push({ text, ...state })
  }
  return segments
}

/**
 * Strip ANSI escapes from a string — useful for full-text search inside
 * log lines without matching color codes.
 */
export function stripAnsi(input: string): string {
  if (!input) return ''
  return input.replace(ANSI_REGEX, '')
}
