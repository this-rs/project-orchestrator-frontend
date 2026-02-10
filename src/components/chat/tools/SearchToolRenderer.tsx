/**
 * SearchToolRenderer — specialized view for Glob and Grep tool calls.
 *
 * Features:
 * - Action badges (SEARCH for Grep, GLOB for Glob) in the header
 * - Pattern highlighting in Grep results via regex matching
 * - Grouped-by-file display for Grep content mode with syntax highlighting
 * - Output mode distinction: content, files_with_matches, count
 * - Directory grouping with tree display for Glob results
 * - Result count badge in header
 */

import React from 'react'
import type { ToolRendererProps } from './types'
import { detectLanguage, tokenizeLine } from './syntax'
import type { Token } from './syntax'

/** Max result items to display before truncating */
const MAX_RESULTS = 50

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract basename from a file path */
function basename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

/** Extract parent directory from a file path */
function dirname(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  if (idx < 0) return ''
  return filePath.slice(0, idx + 1)
}

/**
 * Highlight regex pattern matches in a string.
 * Wraps matches in <mark> elements. Falls back to plain text on invalid regex.
 */
function highlightPattern(line: string, pattern: string): React.ReactNode[] {
  if (!pattern) return [line]

  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'gi')
  } catch {
    return [line]
  }

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset to avoid stale state
  regex.lastIndex = 0
  while ((match = regex.exec(line)) !== null) {
    if (match[0].length === 0) {
      // Prevent infinite loop on zero-length matches
      regex.lastIndex++
      continue
    }
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index))
    }
    parts.push(
      <mark
        key={`m-${match.index}`}
        className="bg-amber-500/30 text-amber-300 rounded px-0.5"
      >
        {match[0]}
      </mark>
    )
    lastIndex = regex.lastIndex
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [line]
}

// ---------------------------------------------------------------------------
// Grep result parsers
// ---------------------------------------------------------------------------

interface GrepFileGroup {
  file: string
  lines: { lineNum: string; content: string }[]
}

/** Parse Grep content-mode lines (filepath:linenum:content or filepath:linenum-content) */
function parseGrepContentLines(lines: string[]): { groups: GrepFileGroup[]; unparsed: string[] } {
  const groups: GrepFileGroup[] = []
  const unparsed: string[] = []
  const groupMap = new Map<string, GrepFileGroup>()

  for (const line of lines) {
    // Match filepath:linenum:content or filepath:linenum-content
    const match = line.match(/^(.+?):(\d+)([:-])(.*)$/)
    if (match) {
      const [, file, lineNum, , content] = match
      let group = groupMap.get(file)
      if (!group) {
        group = { file, lines: [] }
        groupMap.set(file, group)
        groups.push(group)
      }
      group.lines.push({ lineNum, content })
    } else {
      unparsed.push(line)
    }
  }

  return { groups, unparsed }
}

/** Parse Grep count-mode lines (filepath:count) */
function parseGrepCountLines(lines: string[]): { file: string; count: string }[] {
  const entries: { file: string; count: string }[] = []
  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+)$/)
    if (match) {
      entries.push({ file: match[1], count: match[2] })
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// Glob result parser
// ---------------------------------------------------------------------------

interface GlobDirectoryGroup {
  dir: string
  files: string[]
}

/** Group file paths by parent directory */
function groupByDirectory(filePaths: string[]): GlobDirectoryGroup[] {
  const groupMap = new Map<string, string[]>()
  const order: string[] = []

  for (const fp of filePaths) {
    const dir = dirname(fp)
    const file = basename(fp)
    if (!groupMap.has(dir)) {
      groupMap.set(dir, [])
      order.push(dir)
    }
    groupMap.get(dir)!.push(file)
  }

  return order.map(dir => ({ dir, files: groupMap.get(dir)! }))
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Render syntax-highlighted tokens for a single line */
function TokenizedLine({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, j) => (
        <span key={j} className={t.className}>{t.text}</span>
      ))}
    </>
  )
}

/** Grep content-mode: grouped file display with line numbers + syntax highlighting + pattern highlight */
function GrepContentView({ groups, unparsed, pattern, truncatedCount }: {
  groups: GrepFileGroup[]
  unparsed: string[]
  pattern: string
  truncatedCount: number
}) {
  return (
    <div className="py-1">
      {groups.map((group, gi) => {
        const lang = detectLanguage(group.file)
        const dir = dirname(group.file)
        const file = basename(group.file)
        // Gutter width based on max line number
        const maxNum = Math.max(...group.lines.map(l => l.lineNum.length), 1)
        const gutterWidth = Math.max(3, maxNum + 1)

        return (
          <div key={gi} className={gi > 0 ? 'mt-2' : ''}>
            {/* File header */}
            <div className="px-3 py-0.5 text-[10px] text-gray-600 select-none truncate">
              {dir && <span className="text-gray-700">{dir}</span>}
              <span className="text-gray-400 font-medium">{file}</span>
            </div>
            {/* Lines */}
            <pre className="whitespace-pre-wrap break-all">
              {group.lines.map((line, li) => {
                const tokens = tokenizeLine(line.content, lang)
                return (
                  <div key={li} className="flex hover:bg-white/[0.02]">
                    <span
                      className="select-none text-gray-700 text-right pr-3 pl-2 shrink-0"
                      style={{ width: `${gutterWidth + 1}ch` }}
                    >
                      {line.lineNum}
                    </span>
                    <span className="flex-1">
                      {pattern
                        ? highlightPattern(
                            tokens.map(t => t.text).join(''),
                            pattern
                          )
                        : <TokenizedLine tokens={tokens} />
                      }
                    </span>
                  </div>
                )
              })}
            </pre>
          </div>
        )
      })}

      {/* Unparsed lines (fallback) */}
      {unparsed.length > 0 && (
        <pre className="px-3 py-1 whitespace-pre-wrap break-all text-gray-500">
          {unparsed.map((line, i) => (
            <div key={`u-${i}`}>{pattern ? highlightPattern(line, pattern) : line}</div>
          ))}
        </pre>
      )}

      {truncatedCount > 0 && (
        <div className="px-3 py-1 text-gray-600 italic select-none text-[10px]">
          ... {truncatedCount} more result{truncatedCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

/** Grep files_with_matches mode: simple file list with icons */
function GrepFilesView({ files, truncatedCount }: { files: string[]; truncatedCount: number }) {
  return (
    <div className="py-1">
      {files.map((file, i) => (
        <div key={i} className="flex items-center gap-1.5 px-3 py-0.5 hover:bg-white/[0.02]">
          <span className="text-gray-700 select-none shrink-0">{'  \u2192'}</span>
          <span className="text-gray-500 truncate">{file}</span>
        </div>
      ))}
      {truncatedCount > 0 && (
        <div className="px-3 py-1 text-gray-600 italic select-none text-[10px]">
          ... {truncatedCount} more file{truncatedCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

/** Grep count mode: file:count table */
function GrepCountView({ entries, truncatedCount }: { entries: { file: string; count: string }[]; truncatedCount: number }) {
  // Find max count width for alignment
  const maxCountWidth = Math.max(...entries.map(e => e.count.length), 1)

  return (
    <div className="py-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-0.5 hover:bg-white/[0.02]">
          <span
            className="text-amber-400/70 text-right shrink-0 select-none"
            style={{ width: `${maxCountWidth + 1}ch` }}
          >
            {entry.count}
          </span>
          <span className="text-gray-500 truncate">{entry.file}</span>
        </div>
      ))}
      {truncatedCount > 0 && (
        <div className="px-3 py-1 text-gray-600 italic select-none text-[10px]">
          ... {truncatedCount} more entr{truncatedCount > 1 ? 'ies' : 'y'}
        </div>
      )}
    </div>
  )
}

/** Glob directory-grouped tree view */
function GlobTreeView({ groups, truncatedCount }: { groups: GlobDirectoryGroup[]; truncatedCount: number }) {
  return (
    <div className="py-1">
      {groups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? 'mt-1' : ''}>
          {/* Directory header */}
          {group.dir && (
            <div className="px-3 py-0.5 text-[10px] text-gray-600 select-none truncate">
              {group.dir}
            </div>
          )}
          {/* Files in tree style */}
          {group.files.map((file, fi) => {
            const isLast = fi === group.files.length - 1
            const connector = isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500'
            return (
              <div key={fi} className="flex items-center gap-1 px-3 hover:bg-white/[0.02]">
                <span className="text-gray-700 select-none shrink-0 w-8 text-right">
                  {group.dir ? connector : '\u2192'}
                </span>
                <span className="text-gray-500">{file}</span>
              </div>
            )
          })}
        </div>
      ))}
      {truncatedCount > 0 && (
        <div className="px-3 py-1 text-gray-600 italic select-none text-[10px]">
          ... {truncatedCount} more file{truncatedCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SearchToolRenderer({ toolName, toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const isGrep = toolName === 'Grep'
  const pattern = (toolInput.pattern as string) ?? ''
  const globPattern = (toolInput.pattern as string) ?? ''
  const path = (toolInput.path as string) ?? ''
  const outputMode = (toolInput.output_mode as string) ?? (isGrep ? 'files_with_matches' : '')
  const glob = (toolInput.glob as string) ?? ''
  const fileType = (toolInput.type as string) ?? ''

  // Parse result lines
  const resultLines = resultContent?.split('\n').filter(l => l.trim().length > 0) ?? []
  const totalCount = resultLines.length

  // Truncation
  const truncatedCount = totalCount > MAX_RESULTS ? totalCount - MAX_RESULTS : 0
  const displayLines = truncatedCount > 0 ? resultLines.slice(0, MAX_RESULTS) : resultLines

  // Result count label for the header badge
  const countLabel = isGrep
    ? (outputMode === 'files_with_matches'
      ? `${totalCount} file${totalCount !== 1 ? 's' : ''}`
      : outputMode === 'count'
        ? `${totalCount} file${totalCount !== 1 ? 's' : ''}`
        : `${totalCount} result${totalCount !== 1 ? 's' : ''}`)
    : `${totalCount} file${totalCount !== 1 ? 's' : ''}`

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs text-gray-500 overflow-hidden">
        {/* Tool badge */}
        {isGrep ? (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-900/40 text-indigo-400 border border-indigo-800/30">
            SEARCH
          </span>
        ) : (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-900/40 text-cyan-400 border border-cyan-800/30">
            GLOB
          </span>
        )}

        {/* Pattern display */}
        <div className="truncate min-w-0">
          {isGrep ? (
            <>
              <span className="text-gray-600 select-none">/</span>
              <span className="text-amber-400/80">{pattern}</span>
              <span className="text-gray-600 select-none">/</span>
            </>
          ) : (
            <span className="text-cyan-400/80">{globPattern}</span>
          )}
        </div>

        {/* Result count badge */}
        {!isLoading && resultContent != null && totalCount > 0 && !isError && (
          <span className="shrink-0 ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.04] text-gray-500 select-none">
            {countLabel}
          </span>
        )}
      </div>

      {/* Search filter badges */}
      {(path || (outputMode && isGrep) || glob || fileType) && (
        <div className="flex flex-wrap gap-2 px-3 py-1 bg-black/20 border-t border-white/[0.02] text-[10px] text-gray-600 font-mono">
          {path && <span>in {path}</span>}
          {outputMode && isGrep && (
            <span className="px-1 rounded bg-white/[0.04]">{outputMode}</span>
          )}
          {glob && <span>glob: {glob}</span>}
          {fileType && <span>type: {fileType}</span>}
        </div>
      )}

      {/* Results body */}
      {!isLoading && resultContent != null && resultContent.trim().length > 0 && (
        <div className={`border-t font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20 text-gray-500'
        }`}>
          {isError ? (
            <pre className="px-3 py-1.5 whitespace-pre-wrap break-all text-red-400">
              {resultContent}
            </pre>
          ) : isGrep ? (
            // --- Grep output modes ---
            outputMode === 'count' ? (
              <GrepCountView
                entries={parseGrepCountLines(displayLines)}
                truncatedCount={truncatedCount}
              />
            ) : outputMode === 'content' ? (
              (() => {
                const { groups, unparsed } = parseGrepContentLines(displayLines)
                return (
                  <GrepContentView
                    groups={groups}
                    unparsed={unparsed}
                    pattern={pattern}
                    truncatedCount={truncatedCount}
                  />
                )
              })()
            ) : (
              // files_with_matches (default for Grep)
              <GrepFilesView
                files={displayLines}
                truncatedCount={truncatedCount}
              />
            )
          ) : (
            // --- Glob: directory-grouped tree ---
            <GlobTreeView
              groups={groupByDirectory(displayLines)}
              truncatedCount={truncatedCount}
            />
          )}
        </div>
      )}

      {/* No results */}
      {!isLoading && resultContent != null && resultContent.trim().length === 0 && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 italic">no matches</span>
        </div>
      )}

      {isLoading && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 animate-pulse">searching...</span>
        </div>
      )}
    </div>
  )
}
