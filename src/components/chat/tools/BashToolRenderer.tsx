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

/** Lines of command shown before clamping (fixed cartouche height). */
const COMMAND_CLAMP_LINES = 3

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
  const [cmdOpen, setCmdOpen] = useState(false)

  // Parse exit code from result (only when finished)
  const exitCode = !isLoading && resultContent != null
    ? parseExitCode(resultContent, isError)
    : null

  // Determine what to display as the primary command text
  const displayCommand = command || (description ? '' : '(empty command)')
  const isLong = displayCommand.length > 160 || displayCommand.split('\n').length > COMMAND_CLAMP_LINES

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
        {/* Fixed-height cartouche: the description is already the tool-call
            header's summary, so it is not repeated here (kept as tooltip).
            The command is clamped to COMMAND_CLAMP_LINES lines whatever its
            length; click to read it whole. */}
        <div className="flex items-start gap-2 px-3 py-2" title={description || undefined}>
          <div
            role={isLong ? 'button' : undefined}
            tabIndex={isLong ? 0 : undefined}
            onClick={isLong ? () => setCmdOpen(o => !o) : undefined}
            onKeyDown={isLong ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCmdOpen(o => !o) } } : undefined}
            className={`min-w-0 flex-1 text-gray-300 whitespace-pre-wrap break-all select-text ${
              cmdOpen ? 'max-h-64 overflow-y-auto' : 'max-h-[3.9rem] overflow-hidden'
            } ${isLong ? 'cursor-pointer' : ''}`}
            style={cmdOpen ? undefined : { display: '-webkit-box', WebkitLineClamp: COMMAND_CLAMP_LINES, WebkitBoxOrient: 'vertical' }}
          >
            <span className="text-green-500/70 select-none">$ </span>
            {displayCommand || (
              <span className="text-gray-600 italic">{description || '(empty command)'}</span>
            )}
          </div>

          {/* Badges + status share the row: no extra line, no reflow. */}
          <div className="shrink-0 flex items-center gap-1.5 select-none">
            {timeout != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-900/25 text-amber-500/80 border border-amber-800/20">
                {timeout >= 1000 ? `${(timeout / 1000).toFixed(0)}s` : `${timeout}ms`}
              </span>
            )}
            {runInBackground && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-400 border border-purple-800/30">
                BG
              </span>
            )}
            {!isLoading && resultContent != null && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  exitCode != null && exitCode !== 0 || isError
                    ? 'bg-red-900/40 text-red-400 border-red-800/30'
                    : 'bg-green-900/40 text-green-400 border-green-800/30'
                }`}
              >
                exit {exitCode ?? (isError ? 1 : 0)}
              </span>
            )}
          </div>
        </div>
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
