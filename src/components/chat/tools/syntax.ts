/**
 * syntax.ts — lightweight regex-based syntax tokenizer for tool renderers.
 *
 * No external libraries. Uses Tailwind text-color classes for styling.
 * Supports Rust, TypeScript/JavaScript, Python, Go, JSON, and Markdown.
 */

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXT_LANGUAGE_MAP: Record<string, string> = {
  rs: 'rust',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  toml: 'toml',
  yaml: 'yaml',
  yml: 'yaml',
  css: 'css',
  html: 'html',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANGUAGE_MAP[ext] ?? 'plain'
}

// ---------------------------------------------------------------------------
// Extension badge color
// ---------------------------------------------------------------------------

const EXT_BADGE_COLORS: Record<string, string> = {
  rs: 'bg-orange-900/40 text-orange-400 border-orange-800/30',
  ts: 'bg-blue-900/40 text-blue-400 border-blue-800/30',
  tsx: 'bg-blue-900/40 text-blue-400 border-blue-800/30',
  js: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/30',
  jsx: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/30',
  py: 'bg-green-900/40 text-green-400 border-green-800/30',
  go: 'bg-cyan-900/40 text-cyan-400 border-cyan-800/30',
  json: 'bg-gray-800/40 text-gray-400 border-gray-700/30',
  md: 'bg-gray-800/40 text-gray-400 border-gray-700/30',
  toml: 'bg-gray-800/40 text-gray-400 border-gray-700/30',
  yaml: 'bg-red-900/40 text-red-400 border-red-800/30',
  yml: 'bg-red-900/40 text-red-400 border-red-800/30',
  css: 'bg-purple-900/40 text-purple-400 border-purple-800/30',
  html: 'bg-orange-900/40 text-orange-400 border-orange-800/30',
  sql: 'bg-blue-900/40 text-blue-300 border-blue-800/30',
  sh: 'bg-green-900/40 text-green-400 border-green-800/30',
}

export function getExtBadgeColor(ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase()
  return EXT_BADGE_COLORS[clean] ?? 'bg-gray-800/40 text-gray-500 border-gray-700/30'
}

/** Extract the extension string (e.g. ".tsx") from a file path */
export function getFileExtension(filePath: string): string {
  const base = filePath.split('/').pop() ?? ''
  const dotIdx = base.lastIndexOf('.')
  if (dotIdx < 0) return ''
  return base.slice(dotIdx)
}

// ---------------------------------------------------------------------------
// Token types and classes
// ---------------------------------------------------------------------------

export interface Token {
  text: string
  className: string
}

const CLS = {
  keyword: 'text-purple-400',
  string: 'text-green-400',
  comment: 'text-gray-600 italic',
  number: 'text-amber-400',
  type: 'text-cyan-400',
  function: 'text-blue-400',
  jsonKey: 'text-blue-400',
  jsonValueStr: 'text-green-400',
  punctuation: 'text-gray-500',
  default: 'text-gray-400',
  mdHeader: 'text-purple-400 font-bold',
  mdBold: 'text-gray-200 font-bold',
  mdLink: 'text-blue-400 underline',
  mdCode: 'text-green-400',
} as const

// ---------------------------------------------------------------------------
// Keyword sets
// ---------------------------------------------------------------------------

const RUST_KEYWORDS = new Set([
  'fn', 'let', 'mut', 'pub', 'use', 'impl', 'struct', 'enum', 'trait',
  'async', 'await', 'match', 'if', 'else', 'for', 'while', 'return',
  'self', 'Self', 'true', 'false', 'mod', 'crate', 'super', 'where',
  'type', 'const', 'static', 'ref', 'move', 'loop', 'break', 'continue',
  'in', 'as', 'unsafe', 'extern', 'dyn', 'Box', 'Vec', 'Option',
  'Result', 'Some', 'None', 'Ok', 'Err', 'String',
])

const RUST_TYPES = new Set([
  'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
  'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
  'f32', 'f64', 'bool', 'char', 'str',
])

const TS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for',
  'while', 'class', 'interface', 'type', 'import', 'export', 'from',
  'async', 'await', 'new', 'true', 'false', 'null', 'undefined',
  'switch', 'case', 'break', 'continue', 'default', 'throw', 'try',
  'catch', 'finally', 'typeof', 'instanceof', 'in', 'of', 'yield',
  'void', 'delete', 'this', 'super', 'extends', 'implements',
  'static', 'get', 'set', 'as', 'satisfies',
])

const PY_KEYWORDS = new Set([
  'def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else',
  'for', 'while', 'with', 'as', 'try', 'except', 'finally', 'raise',
  'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'lambda',
  'yield', 'pass', 'break', 'continue', 'global', 'nonlocal', 'del',
  'assert', 'async', 'await',
])

const GO_KEYWORDS = new Set([
  'func', 'var', 'const', 'type', 'struct', 'interface', 'return',
  'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break',
  'continue', 'go', 'defer', 'select', 'chan', 'map', 'package',
  'import', 'true', 'false', 'nil', 'make', 'new', 'len', 'cap',
  'append', 'error',
])

// ---------------------------------------------------------------------------
// Tokenizers by language
// ---------------------------------------------------------------------------

function tokenizeCode(
  line: string,
  keywords: Set<string>,
  types: Set<string> | null,
  commentPrefix: string,
): Token[] {
  const tokens: Token[] = []

  // Check for line-level comment first
  const commentIdx = line.indexOf(commentPrefix)
  let codePart = line
  let commentPart = ''
  if (commentIdx >= 0) {
    // Make sure the comment prefix is not inside a string
    const beforeComment = line.slice(0, commentIdx)
    const singleQuotes = (beforeComment.match(/'/g) || []).length
    const doubleQuotes = (beforeComment.match(/"/g) || []).length
    if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
      codePart = line.slice(0, commentIdx)
      commentPart = line.slice(commentIdx)
    }
  }

  // Tokenize the code portion
  // Regex: strings, numbers, identifiers, or single characters
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|[a-zA-Z_]\w*|\S)/g
  let match: RegExpExecArray | null

  let lastIndex = 0
  while ((match = pattern.exec(codePart)) !== null) {
    // Add any whitespace/gap before this match
    if (match.index > lastIndex) {
      tokens.push({ text: codePart.slice(lastIndex, match.index), className: CLS.default })
    }
    lastIndex = pattern.lastIndex

    const word = match[0]

    if (word.startsWith('"') || word.startsWith("'") || word.startsWith('`')) {
      tokens.push({ text: word, className: CLS.string })
    } else if (/^\d/.test(word)) {
      tokens.push({ text: word, className: CLS.number })
    } else if (keywords.has(word)) {
      tokens.push({ text: word, className: CLS.keyword })
    } else if (types?.has(word)) {
      tokens.push({ text: word, className: CLS.type })
    } else if (/^[A-Z]/.test(word) && word.length > 1) {
      // Capitalized identifier — treat as type
      tokens.push({ text: word, className: CLS.type })
    } else {
      // Check if followed by '(' to detect function calls
      const nextChar = codePart[pattern.lastIndex]
      if (nextChar === '(') {
        tokens.push({ text: word, className: CLS.function })
      } else {
        tokens.push({ text: word, className: CLS.default })
      }
    }
  }

  // Remaining code text
  if (lastIndex < codePart.length) {
    tokens.push({ text: codePart.slice(lastIndex), className: CLS.default })
  }

  // Append comment
  if (commentPart) {
    tokens.push({ text: commentPart, className: CLS.comment })
  }

  return tokens
}

function tokenizeJson(line: string): Token[] {
  const tokens: Token[] = []

  // JSON regex: key-value pattern or standalone values
  const pattern = /("(?:[^"\\]|\\.)*")\s*(:)|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|([{}[\],])|(\S)/g
  let match: RegExpExecArray | null
  let lastIndex = 0

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), className: CLS.default })
    }
    lastIndex = pattern.lastIndex

    if (match[1] && match[2]) {
      // Key: "key":
      tokens.push({ text: match[1], className: CLS.jsonKey })
      tokens.push({ text: match[2], className: CLS.punctuation })
    } else if (match[3]) {
      // String value
      tokens.push({ text: match[3], className: CLS.jsonValueStr })
    } else if (match[4]) {
      // Boolean / null
      tokens.push({ text: match[4], className: CLS.keyword })
    } else if (match[5]) {
      // Number
      tokens.push({ text: match[5], className: CLS.number })
    } else if (match[6]) {
      // Brackets/punctuation
      tokens.push({ text: match[6], className: CLS.punctuation })
    } else if (match[7]) {
      tokens.push({ text: match[7], className: CLS.default })
    }
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), className: CLS.default })
  }

  return tokens
}

function tokenizeMarkdown(line: string): Token[] {
  // Headers
  if (/^#{1,6}\s/.test(line)) {
    return [{ text: line, className: CLS.mdHeader }]
  }

  const tokens: Token[] = []
  // Process inline patterns: bold, inline code, links
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__)|(`[^`]+`)|(\[([^\]]+)\]\([^)]+\))/g
  let match: RegExpExecArray | null
  let lastIndex = 0

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), className: CLS.default })
    }
    lastIndex = pattern.lastIndex

    if (match[1]) {
      tokens.push({ text: match[1], className: CLS.mdBold })
    } else if (match[2]) {
      tokens.push({ text: match[2], className: CLS.mdCode })
    } else if (match[3]) {
      tokens.push({ text: match[3], className: CLS.mdLink })
    }
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), className: CLS.default })
  }

  return tokens.length > 0 ? tokens : [{ text: line, className: CLS.default }]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function tokenizeLine(line: string, language: string): Token[] {
  if (line.length === 0) return [{ text: '', className: CLS.default }]

  switch (language) {
    case 'rust':
      return tokenizeCode(line, RUST_KEYWORDS, RUST_TYPES, '//')
    case 'typescript':
    case 'javascript':
      return tokenizeCode(line, TS_KEYWORDS, null, '//')
    case 'python':
      return tokenizeCode(line, PY_KEYWORDS, null, '#')
    case 'go':
      return tokenizeCode(line, GO_KEYWORDS, null, '//')
    case 'json':
      return tokenizeJson(line)
    case 'markdown':
      return tokenizeMarkdown(line)
    default:
      return [{ text: line, className: CLS.default }]
  }
}
