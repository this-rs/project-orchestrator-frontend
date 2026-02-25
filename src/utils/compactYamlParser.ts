/**
 * Compact YAML Parser
 *
 * Parses the token-efficient compact YAML format produced by the backend's
 * `json_to_compact()` formatter back into JavaScript objects.
 *
 * Format rules (inverse of formatter.rs):
 * - `key: value` → object property (no quotes on keys or simple string values)
 * - Null/empty fields are omitted entirely by the formatter
 * - `[a, b, c]` → inline scalar array
 * - `- key: val` → YAML-style object array item (indented)
 * - Nested objects are indented by 2 spaces
 * - Strings needing quoting use JSON-style: `"line1\nline2"`, `"true"`, `"null"`
 * - Top-level can be: object, array, scalar
 * - `{}` → empty object, `[]` → empty array
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a compact YAML string into a JavaScript value.
 * Returns `null` if parsing fails.
 */
export function parseCompactYaml(input: string): unknown {
  if (!input || typeof input !== 'string') return null

  const trimmed = input.trim()
  if (trimmed === '') return null

  try {
    // Edge cases: standalone scalars
    if (trimmed === 'null') return null
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    if (trimmed === '{}') return {}
    if (trimmed === '[]') return []

    // Standalone number
    const num = parseNumberStrict(trimmed)
    if (num !== null) return num

    // Inline array at top level: [a, b, c]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return parseInlineArray(trimmed)
    }

    // Quoted string at top level
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return parseQuotedString(trimmed)
    }

    const lines = input.split('\n')

    // Top-level array (starts with `- `)
    if (lines[0].trimStart().startsWith('- ')) {
      return parseArrayBlock(lines, 0, findIndent(lines[0]))
    }

    // Top-level object (key: value)
    return parseObjectBlock(lines, 0, 0)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Find the indentation level (number of leading spaces) of a line. */
function findIndent(line: string): number {
  let i = 0
  while (i < line.length && line[i] === ' ') i++
  return i
}

/** Parse a strict number (not a string that starts with digits). */
function parseNumberStrict(s: string): number | null {
  if (s === '') return null
  // Must be a valid number and not start with something weird
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Parse a JSON-quoted string: `"line1\nline2"` → `line1<newline>line2` */
function parseQuotedString(s: string): string {
  // Remove surrounding quotes and process escape sequences
  const inner = s.slice(1, -1)
  let result = ''
  let i = 0
  while (i < inner.length) {
    if (inner[i] === '\\' && i + 1 < inner.length) {
      const next = inner[i + 1]
      switch (next) {
        case 'n': result += '\n'; break
        case 'r': result += '\r'; break
        case 't': result += '\t'; break
        case '"': result += '"'; break
        case '\\': result += '\\'; break
        default: result += '\\' + next; break
      }
      i += 2
    } else {
      result += inner[i]
      i++
    }
  }
  return result
}

/**
 * Parse an inline scalar array: `[a, b, c]` or `[1, 2, 3]` or `[true, false]`
 * Items can be unquoted strings, numbers, booleans, or quoted strings.
 */
function parseInlineArray(s: string): unknown[] {
  const inner = s.slice(1, -1).trim()
  if (inner === '') return []

  const items: unknown[] = []
  let i = 0

  while (i < inner.length) {
    // Skip whitespace
    while (i < inner.length && inner[i] === ' ') i++
    if (i >= inner.length) break

    if (inner[i] === '"') {
      // Quoted string — find matching end quote
      let j = i + 1
      while (j < inner.length) {
        if (inner[j] === '\\') { j += 2; continue }
        if (inner[j] === '"') { j++; break }
        j++
      }
      items.push(parseQuotedString(inner.slice(i, j)))
      i = j
    } else {
      // Unquoted value — read until comma or end
      let j = i
      while (j < inner.length && inner[j] !== ',') j++
      const token = inner.slice(i, j).trim()
      items.push(parseScalar(token))
      i = j
    }

    // Skip comma and whitespace
    while (i < inner.length && (inner[i] === ',' || inner[i] === ' ')) i++
  }

  return items
}

/** Parse a scalar string to its JS type: number, boolean, null, or string. */
function parseScalar(s: string): unknown {
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null

  // Quoted string
  if (s.startsWith('"') && s.endsWith('"')) {
    return parseQuotedString(s)
  }

  // Number
  const num = parseNumberStrict(s)
  if (num !== null) return num

  // Plain string
  return s
}

/**
 * Parse an object block starting at `startLine` with base indentation `baseIndent`.
 * Returns the parsed object and the index of the next line after the block.
 */
function parseObjectBlock(
  lines: string[],
  startLine: number,
  baseIndent: number,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  let i = startLine

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (line.trim() === '') { i++; continue }

    const indent = findIndent(line)

    // If indent is less than base, we've exited this block
    if (indent < baseIndent) break

    // If indent is greater, it's a continuation that we shouldn't handle at this level
    if (indent > baseIndent) break

    const content = line.slice(indent)

    // This line should be `key: value` or `key:` (for nested block)
    const colonIdx = content.indexOf(':')
    if (colonIdx === -1) {
      // Not a key-value line, might be a bare value — skip
      i++
      continue
    }

    const key = content.slice(0, colonIdx)
    const afterColon = content.slice(colonIdx + 1)

    if (afterColon === '' || afterColon === '\n') {
      // `key:` with no value on same line → nested block on next lines
      i++
      if (i < lines.length) {
        const nextLine = lines[i]
        const nextIndent = findIndent(nextLine)
        const nextContent = nextLine.slice(nextIndent).trimStart()

        if (nextIndent > indent && nextContent.startsWith('- ')) {
          // Nested array
          const { value, nextLine: nl } = parseArrayLines(lines, i, nextIndent)
          obj[key] = value
          i = nl
        } else if (nextIndent > indent) {
          // Nested object
          const { value, nextLine: nl } = parseObjectLines(lines, i, nextIndent)
          obj[key] = value
          i = nl
        }
      }
    } else {
      // `key: value` on the same line
      const valueStr = afterColon.startsWith(' ') ? afterColon.slice(1) : afterColon
      obj[key] = parseInlineValue(valueStr)
      i++
    }
  }

  return obj
}

/**
 * Parse an object block, returning the value and the next line index.
 */
function parseObjectLines(
  lines: string[],
  startLine: number,
  baseIndent: number,
): { value: Record<string, unknown>; nextLine: number } {
  const obj: Record<string, unknown> = {}
  let i = startLine

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }

    const indent = findIndent(line)
    if (indent < baseIndent) break

    // If this line is at our indent level, parse it as a key-value pair
    if (indent === baseIndent) {
      const content = line.slice(indent)
      const colonIdx = content.indexOf(':')

      if (colonIdx === -1) { i++; continue }

      const key = content.slice(0, colonIdx)
      const afterColon = content.slice(colonIdx + 1)

      if (afterColon === '' || afterColon === '\n') {
        // Nested block
        i++
        if (i < lines.length) {
          const nextIndent = findIndent(lines[i])
          const nextContent = lines[i].slice(nextIndent).trimStart()

          if (nextIndent > baseIndent && nextContent.startsWith('- ')) {
            const result = parseArrayLines(lines, i, nextIndent)
            obj[key] = result.value
            i = result.nextLine
          } else if (nextIndent > baseIndent) {
            const result = parseObjectLines(lines, i, nextIndent)
            obj[key] = result.value
            i = result.nextLine
          }
        }
      } else {
        const valueStr = afterColon.startsWith(' ') ? afterColon.slice(1) : afterColon
        obj[key] = parseInlineValue(valueStr)
        i++
      }
    } else {
      // Deeper indent — shouldn't happen at this level, break
      break
    }
  }

  return { value: obj, nextLine: i }
}

/**
 * Parse an array block (lines starting with `- `).
 */
function parseArrayBlock(
  lines: string[],
  startLine: number,
  baseIndent: number,
): unknown[] {
  const result = parseArrayLines(lines, startLine, baseIndent)
  return result.value
}

/**
 * Parse an array of lines starting with `- `, returning values and next line.
 */
function parseArrayLines(
  lines: string[],
  startLine: number,
  baseIndent: number,
): { value: unknown[]; nextLine: number } {
  const arr: unknown[] = []
  let i = startLine

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }

    const indent = findIndent(line)
    if (indent < baseIndent) break

    const content = line.slice(indent)

    if (!content.startsWith('- ')) break

    // Strip the `- ` prefix → what follows is the first key-value pair of an object item
    const itemContent = content.slice(2)
    const colonIdx = itemContent.indexOf(':')

    if (colonIdx === -1) {
      // Scalar array item: `- some_value`
      arr.push(parseScalar(itemContent.trim()))
      i++
      continue
    }

    // Object array item: `- key: value` (with possible continuation lines)
    const firstKey = itemContent.slice(0, colonIdx)
    const afterColon = itemContent.slice(colonIdx + 1)
    const itemObj: Record<string, unknown> = {}

    if (afterColon === '' || afterColon === '\n') {
      // `- key:` → value is a nested block
      i++
      if (i < lines.length) {
        const nextIndent = findIndent(lines[i])
        const nextContent = lines[i].slice(nextIndent).trimStart()
        if (nextIndent > indent + 2 && nextContent.startsWith('- ')) {
          const result = parseArrayLines(lines, i, nextIndent)
          itemObj[firstKey] = result.value
          i = result.nextLine
        } else if (nextIndent > indent + 2) {
          const result = parseObjectLines(lines, i, nextIndent)
          itemObj[firstKey] = result.value
          i = result.nextLine
        }
      }
    } else {
      const valueStr = afterColon.startsWith(' ') ? afterColon.slice(1) : afterColon
      itemObj[firstKey] = parseInlineValue(valueStr)
      i++
    }

    // Read continuation lines for this object item (indented beyond `- `)
    const itemIndent = indent + 2
    while (i < lines.length) {
      const nextLine = lines[i]
      if (nextLine.trim() === '') { i++; continue }

      const nextLineIndent = findIndent(nextLine)
      if (nextLineIndent < itemIndent) break

      if (nextLineIndent === itemIndent) {
        const nextContent = nextLine.slice(nextLineIndent)

        // If it starts with `- `, it's a new array item at the parent level
        if (nextContent.startsWith('- ')) break

        const nextColonIdx = nextContent.indexOf(':')
        if (nextColonIdx === -1) { i++; continue }

        const nextKey = nextContent.slice(0, nextColonIdx)
        const nextAfterColon = nextContent.slice(nextColonIdx + 1)

        if (nextAfterColon === '' || nextAfterColon === '\n') {
          // Nested block under this key
          i++
          if (i < lines.length) {
            const deepIndent = findIndent(lines[i])
            const deepContent = lines[i].slice(deepIndent).trimStart()
            if (deepIndent > itemIndent && deepContent.startsWith('- ')) {
              const result = parseArrayLines(lines, i, deepIndent)
              itemObj[nextKey] = result.value
              i = result.nextLine
            } else if (deepIndent > itemIndent) {
              const result = parseObjectLines(lines, i, deepIndent)
              itemObj[nextKey] = result.value
              i = result.nextLine
            }
          }
        } else {
          const valueStr = nextAfterColon.startsWith(' ') ? nextAfterColon.slice(1) : nextAfterColon
          itemObj[nextKey] = parseInlineValue(valueStr)
          i++
        }
      } else {
        // Deeper indent — part of a nested structure, break and let parent handle
        break
      }
    }

    arr.push(itemObj)
  }

  return { value: arr, nextLine: i }
}

/**
 * Parse an inline value (the part after `key: `).
 * Can be: inline array, quoted string, number, boolean, null, or plain string.
 */
function parseInlineValue(s: string): unknown {
  const trimmed = s.trim()

  if (trimmed === '') return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (trimmed === '{}') return {}
  if (trimmed === '[]') return []

  // Inline array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseInlineArray(trimmed)
  }

  // Quoted string
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return parseQuotedString(trimmed)
  }

  // Number
  const num = parseNumberStrict(trimmed)
  if (num !== null) return num

  // Plain string
  return trimmed
}
