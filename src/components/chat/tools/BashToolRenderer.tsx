/**
 * BashToolRenderer — specialized view for Bash tool calls.
 *
 * Terminal-style block with command prompt, description comment,
 * status indicator, and collapsible output.
 */

import { useState } from 'react'
import type { ToolRendererProps } from './types'

/** Max characters to show before offering "show more" */
const OUTPUT_PREVIEW_LIMIT = 2000

/**
 * Split a compound shell command (using &&, ||, or ;) into
 * separate lines for readability. Only splits on top-level
 * operators — ignores operators inside quotes or subshells.
 */
function formatMultilineCommand(cmd: string): string[] {
  // Simple heuristic: split on && / || / ; that are preceded by a space
  // and not inside quotes. Good enough for display purposes.
  const lines: string[] = []
  let current = ''
  const tokens = cmd.split(/(\s+&&\s+|\s+\|\|\s+|\s*;\s+)/)
  for (const token of tokens) {
    const trimmed = token.trim()
    if (trimmed === '&&' || trimmed === '||' || trimmed === ';') {
      if (current) lines.push(current.trim() + ' ' + trimmed)
      current = ''
    } else {
      current += token
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines.length > 1 ? lines : [cmd]
}

/** Check if a command looks like it has multiple chained parts */
function isMultiline(cmd: string): boolean {
  return /\s+&&\s+|\s+\|\|\s+|;\s+/.test(cmd)
}

/** Strip ANSI escape sequences from terminal output */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

/** Try to extract an exit code from the result text (e.g. "Exit code: 1") */
function parseExitCode(text: string | undefined, isError: boolean | undefined): number | null {
  if (text == null) return null
  // Match lines like "Exit code: N" at start or end of output
  const match = text.match(/(?:^|\n)\s*(?:exit code|Exit code|EXIT CODE)[:\s]+(\d+)\s*(?:\n|$)/i)
  if (match) return parseInt(match[1], 10)
  // If no explicit exit code found, infer from error status when result exists
  if (isError) return 1
  return 0
}

export function BashToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const command = ((toolInput.command as string) ?? '').trim()
  const description = ((toolInput.description as string) ?? '').trim()
  const timeout = toolInput.timeout as number | undefined
  const runInBackground = toolInput.run_in_background as boolean | undefined

  const [expanded, setExpanded] = useState(false)

  // Parse exit code from result (only when finished)
  const exitCode = !isLoading && resultContent != null
    ? parseExitCode(resultContent, isError)
    : null

  // Determine what to display as the primary command text
  const displayCommand = command || (description ? '' : '(empty command)')
  const commandLines = displayCommand && isMultiline(displayCommand)
    ? formatMultilineCommand(displayCommand)
    : null

  // Determine if the result has been finished (not loading, has content)
  const hasResult = !isLoading && resultContent != null && resultContent.length > 0
  const hasEmptyResult = !isLoading && resultContent != null && resultContent.length === 0 && !isError

  // Strip ANSI codes from output for clean display
  const cleanResult = resultContent != null ? stripAnsi(resultContent) : undefined

  // Output truncation
  const outputLength = cleanResult?.length ?? 0
  const isOutputTruncated = outputLength > OUTPUT_PREVIEW_LIMIT && !expanded
  const visibleOutput = isOutputTruncated
    ? cleanResult!.slice(0, OUTPUT_PREVIEW_LIMIT)
    : cleanResult ?? ''
  const hiddenChars = outputLength - OUTPUT_PREVIEW_LIMIT

  // Bottom rounding: round bottom corners if this is the last visible section
  const hasBottom = hasResult || hasEmptyResult || isLoading
  const topRounding = hasBottom ? 'rounded-t-md' : 'rounded-md'

  return (
    <div className="space-y-0">
      {/* ── Command block ── */}
      <div className={`${topRounding} font-mono text-xs ${isError ? 'bg-red-950/30' : 'bg-black/30'} overflow-hidden`}>
        {/* Description as comment */}
        {description && (
          <div className="px-3 pt-2 text-gray-600 select-none text-[11px] leading-tight">
            # {description}
          </div>
        )}

        {/* Badges row (timeout, background) */}
        {(timeout != null || runInBackground) && (
          <div className="px-3 pt-1.5 flex items-center gap-1.5">
            {timeout != null && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-amber-900/25 text-amber-500/80 border border-amber-800/20 select-none">
                timeout {timeout >= 1000 ? `${(timeout / 1000).toFixed(0)}s` : `${timeout}ms`}
              </span>
            )}
            {runInBackground && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-400 border border-purple-800/30 select-none">
                BG
              </span>
            )}
          </div>
        )}

        {/* Command prompt */}
        <div className="px-3 py-2 text-gray-300 whitespace-pre-wrap break-all select-text">
          {commandLines ? (
            // Multi-line formatted command
            commandLines.map((line, i) => (
              <div key={i} className={i > 0 ? 'pl-4' : ''}>
                {i === 0 && <span className="text-green-500/70 select-none">$ </span>}
                {i > 0 && <span className="text-gray-700 select-none">  </span>}
                {line}
              </div>
            ))
          ) : (
            // Single-line command (or fallback to description)
            <div>
              <span className="text-green-500/70 select-none">$ </span>
              {displayCommand || (
                <span className="text-gray-600 italic">{description || '(empty command)'}</span>
              )}
            </div>
          )}
        </div>

        {/* Status indicator row (only after completion) */}
        {!isLoading && resultContent != null && (
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                isError ? 'bg-red-500' : 'bg-green-500/80'
              }`}
            />
            {exitCode != null && exitCode !== 0 ? (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-900/40 text-red-400 border border-red-800/30 select-none">
                exit {exitCode}
              </span>
            ) : exitCode != null ? (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-900/40 text-green-400 border border-green-800/30 select-none">
                exit 0
              </span>
            ) : (
              <span className={`text-[10px] select-none ${isError ? 'text-red-500/60' : 'text-gray-600'}`}>
                {isError ? 'exited with error' : 'exited 0'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Output ── */}
      {hasResult && (
        <div className={`border-t font-mono text-xs overflow-x-auto ${
          expanded ? '' : 'max-h-64'
        } overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20 text-gray-500'
        } ${!isOutputTruncated ? 'rounded-b-md' : ''}`}>
          <pre className="px-3 py-2 whitespace-pre-wrap break-all select-text">
            {visibleOutput}
          </pre>
        </div>
      )}

      {/* Show more / less toggle */}
      {hasResult && outputLength > OUTPUT_PREVIEW_LIMIT && (
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
            : `show ${hiddenChars.toLocaleString()} more characters`}
        </button>
      )}

      {/* Empty result */}
      {hasEmptyResult && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 italic select-none">no output</span>
        </div>
      )}

      {/* Loading spinner */}
      {isLoading && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-2 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-pulse" />
          <span className="text-xs text-gray-600 animate-pulse">running...</span>
        </div>
      )}
    </div>
  )
}
