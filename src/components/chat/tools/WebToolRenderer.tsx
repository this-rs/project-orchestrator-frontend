/**
 * WebToolRenderer — specialized view for WebFetch and WebSearch tool calls.
 *
 * WebFetch: blue FETCH badge + hostname + URL + prompt, with basic markdown rendering for result
 * WebSearch: green SEARCH badge + query + domain badges, with structured parsed results
 */

import { useState, type ReactNode } from 'react'
import type { ToolRendererProps } from './types'

/** Max lines for result preview before offering "show more" */
const MAX_RESULT_LINES = 40

// ---------------------------------------------------------------------------
// Simple inline markdown renderer (no external deps)
// ---------------------------------------------------------------------------

/** Render inline markdown spans: bold, italic, code, links */
function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Regex matches (in priority order): inline code, bold, italic, links
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const full = match[0]

    if (match[1]) {
      // inline `code`
      const code = full.slice(1, -1)
      nodes.push(
        <code key={match.index} className="px-1 py-0.5 bg-white/[0.06] rounded text-[10px]">{code}</code>
      )
    } else if (match[2]) {
      // **bold**
      const bold = full.slice(2, -2)
      nodes.push(
        <strong key={match.index} className="text-gray-300">{bold}</strong>
      )
    } else if (match[3]) {
      // *italic*
      const italic = full.slice(1, -1)
      nodes.push(
        <em key={match.index}>{italic}</em>
      )
    } else if (match[4]) {
      // [text](url)
      const linkMatch = full.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (linkMatch) {
        nodes.push(
          <a
            key={match.index}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline"
          >
            {linkMatch[1]}
          </a>
        )
      } else {
        nodes.push(full)
      }
    }

    lastIndex = match.index + full.length
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

/**
 * Process a block of text into React nodes with basic markdown:
 * headers, code blocks, bullet lists, inline formatting.
 */
function renderSimpleMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block: ```...```
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++ // skip opening fence
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing fence
      nodes.push(
        <pre
          key={`code-${i}`}
          className="bg-black/30 rounded p-2 text-[10px] font-mono overflow-x-auto my-1"
        >
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // ## H2
    if (line.startsWith('## ')) {
      nodes.push(
        <div key={`h2-${i}`} className="text-gray-400 font-medium text-xs mt-1.5">
          {renderInlineMarkdown(line.slice(3))}
        </div>
      )
      i++
      continue
    }

    // # H1
    if (line.startsWith('# ')) {
      nodes.push(
        <div key={`h1-${i}`} className="text-gray-300 font-semibold text-sm mt-2">
          {renderInlineMarkdown(line.slice(2))}
        </div>
      )
      i++
      continue
    }

    // Bullet list: - item or * item (but not ** which is bold)
    if (/^[\s]*[-*]\s/.test(line) && !line.trimStart().startsWith('**')) {
      const bulletContent = line.replace(/^[\s]*[-*]\s/, '')
      nodes.push(
        <div key={`li-${i}`} className="flex gap-1.5 ml-1">
          <span className="text-gray-600 select-none shrink-0">&#x2022;</span>
          <span>{renderInlineMarkdown(bulletContent)}</span>
        </div>
      )
      i++
      continue
    }

    // Empty line
    if (line.trim() === '') {
      nodes.push(<div key={`br-${i}`} className="h-1" />)
      i++
      continue
    }

    // Regular paragraph line with inline markdown
    nodes.push(
      <div key={`p-${i}`}>{renderInlineMarkdown(line)}</div>
    )
    i++
  }

  return nodes
}

// ---------------------------------------------------------------------------
// WebSearch structured result parser
// ---------------------------------------------------------------------------

interface SearchLink {
  title: string
  url: string
  snippet?: string
}

/**
 * Try to parse structured search results from WebSearch output.
 * Expected format contains a "Links:" line followed by a JSON array.
 * Returns null if parsing fails.
 */
function parseSearchResults(text: string): { query: string | null; links: SearchLink[]; preamble: string; epilogue: string } | null {
  // Look for a JSON array on a line after "Links:"
  const linksIdx = text.indexOf('Links:')
  if (linksIdx === -1) return null

  const afterLinks = text.slice(linksIdx + 'Links:'.length).trimStart()

  // Find the JSON array boundaries
  const arrayStart = afterLinks.indexOf('[')
  if (arrayStart === -1) return null

  // Find matching closing bracket
  let depth = 0
  let arrayEnd = -1
  for (let i = arrayStart; i < afterLinks.length; i++) {
    if (afterLinks[i] === '[') depth++
    else if (afterLinks[i] === ']') {
      depth--
      if (depth === 0) {
        arrayEnd = i
        break
      }
    }
  }

  if (arrayEnd === -1) return null

  const jsonStr = afterLinks.slice(arrayStart, arrayEnd + 1)

  try {
    const parsed = JSON.parse(jsonStr) as unknown
    if (!Array.isArray(parsed)) return null

    const links: SearchLink[] = parsed
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).url === 'string'
      )
      .map(item => ({
        title: String(item.title ?? item.url),
        url: String(item.url),
        snippet: item.snippet ? String(item.snippet) : undefined,
      }))

    if (links.length === 0) return null

    // Extract preamble (before "Links:") and epilogue (after the JSON array)
    const preamble = text.slice(0, linksIdx).trim()
    const epilogueStart = linksIdx + 'Links:'.length + arrayEnd + 1
    const epilogue = text.slice(epilogueStart).trim()

    // Try to extract query from preamble like: Web search results for query: "..."
    let query: string | null = null
    const queryMatch = preamble.match(/query:\s*"([^"]+)"/)
    if (queryMatch) query = queryMatch[1]

    return { query, links, preamble, epilogue }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebToolRenderer({ toolName, toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const isWebSearch = toolName === 'WebSearch'
  const [expanded, setExpanded] = useState(false)

  // WebFetch fields
  const url = (toolInput.url as string) ?? ''
  const prompt = (toolInput.prompt as string) ?? ''

  // WebSearch fields
  const query = (toolInput.query as string) ?? ''
  const allowedDomains = toolInput.allowed_domains as string[] | undefined
  const blockedDomains = toolInput.blocked_domains as string[] | undefined

  // Result preview (line-based truncation)
  const lines = resultContent?.split('\n') ?? []
  const truncated = lines.length > MAX_RESULT_LINES ? lines.length - MAX_RESULT_LINES : 0
  const displayLines = truncated > 0 && !expanded ? lines.slice(0, MAX_RESULT_LINES) : lines

  // Structured search results parsing
  const parsedSearch = isWebSearch && resultContent ? parseSearchResults(resultContent) : null

  // Bottom rounding logic
  const hasResult = !isLoading && resultContent != null && resultContent.length > 0
  const hasBottom = hasResult || isLoading
  const topRounding = hasBottom ? 'rounded-t-md' : 'rounded-md'

  return (
    <div className="space-y-0">
      {/* ── Header with params ── */}
      <div className={`px-3 py-1.5 bg-black/30 ${topRounding} font-mono text-xs overflow-hidden`}>
        {isWebSearch ? (
          <>
            {/* Badge row */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-900/40 text-green-400 border border-green-800/30">SEARCH</span>
              {allowedDomains && Array.isArray(allowedDomains) && allowedDomains.map((d, i) => (
                <span key={`a-${i}`} className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-emerald-900/25 text-emerald-500/80 border border-emerald-800/20 select-none">
                  +{String(d)}
                </span>
              ))}
              {blockedDomains && Array.isArray(blockedDomains) && blockedDomains.map((d, i) => (
                <span key={`b-${i}`} className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-red-900/25 text-red-500/80 border border-red-800/20 select-none">
                  -{String(d)}
                </span>
              ))}
            </div>
            <div className="text-gray-400">
              <span className="text-gray-600 select-none">query: </span>
              <span className="text-blue-400/80">{query}</span>
            </div>
          </>
        ) : (
          <>
            {/* Badge row */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-900/40 text-blue-400 border border-blue-800/30">FETCH</span>
            </div>
            <div className="text-blue-400/80 truncate">
              {url}
            </div>
            {prompt && (
              <div className="text-gray-600 mt-1 text-[10px] truncate">
                {prompt}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Result content ── */}
      {hasResult && !isError && (
        <div className="border-t border-white/[0.04] bg-black/20 text-gray-500 font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto">
          <div className="px-3 py-1.5">
            {isWebSearch && parsedSearch ? (
              /* Structured search results */
              <div className="space-y-2">
                {parsedSearch.links.map((link, i) => (
                  <div key={i} className="space-y-0.5">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline text-xs"
                    >
                      {link.title}
                    </a>
                    <div className="text-[10px] text-gray-600 font-mono truncate">
                      {link.url}
                    </div>
                    {link.snippet && (
                      <div className="text-[11px] text-gray-500 leading-snug">
                        {link.snippet}
                      </div>
                    )}
                  </div>
                ))}
                {parsedSearch.epilogue && (
                  <div className="text-[11px] text-gray-500 mt-2 border-t border-white/[0.04] pt-2 whitespace-pre-wrap">
                    {parsedSearch.epilogue}
                  </div>
                )}
              </div>
            ) : !isWebSearch ? (
              /* WebFetch: markdown rendered result */
              <div className="space-y-0.5 whitespace-pre-wrap break-words">
                {renderSimpleMarkdown(displayLines.join('\n'))}
              </div>
            ) : (
              /* WebSearch fallback: plain text */
              <pre className="whitespace-pre-wrap break-all">
                {displayLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </pre>
            )}

            {/* Truncation notice (only for non-parsed views) */}
            {!parsedSearch && truncated > 0 && !expanded && (
              <div className="text-gray-600 italic select-none mt-1">
                ... {truncated} more line{truncated > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Error result ── */}
      {hasResult && isError && (
        <div className="border-t border-red-800/30 bg-red-950/20 text-red-400 font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto">
          <pre className="px-3 py-1.5 whitespace-pre-wrap break-all">
            {displayLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {truncated > 0 && !expanded && (
              <div className="text-gray-600 italic select-none">
                ... {truncated} more line{truncated > 1 ? 's' : ''}
              </div>
            )}
          </pre>
        </div>
      )}

      {/* ── Show more / less toggle ── */}
      {hasResult && truncated > 0 && !parsedSearch && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className={`w-full border-t rounded-b-md text-[11px] px-3 py-1.5 text-center cursor-pointer select-none transition-colors ${
            isError
              ? 'border-red-800/30 bg-red-950/15 text-red-400/60 hover:text-red-400/90 hover:bg-red-950/25'
              : 'border-white/[0.04] bg-black/15 text-gray-600 hover:text-gray-400 hover:bg-black/25'
          }`}
        >
          {expanded
            ? 'show less'
            : `show ${truncated} more line${truncated > 1 ? 's' : ''}`}
        </button>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-pulse" />
          <span className="text-xs text-gray-600 animate-pulse">
            {isWebSearch ? 'searching...' : 'fetching...'}
          </span>
        </div>
      )}
    </div>
  )
}
