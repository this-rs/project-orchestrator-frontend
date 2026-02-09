/**
 * SearchToolRenderer — specialized view for Glob and Grep tool calls.
 *
 * Both tools share a similar visual structure:
 * - Header: icon + search pattern + result count
 * - Expanded: search params + formatted results
 *
 * Grep has additional complexity with output_mode (content, files_with_matches, count).
 */

import type { ToolRendererProps } from './types'

/** Max result lines to show before truncating */
const MAX_RESULT_LINES = 30

export function SearchToolRenderer({ toolName, toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const isGrep = toolName === 'Grep'
  const pattern = (toolInput.pattern as string) ?? ''
  const path = (toolInput.path as string) ?? ''
  const outputMode = (toolInput.output_mode as string) ?? (isGrep ? 'files_with_matches' : '')
  const glob = (toolInput.glob as string) ?? ''
  const fileType = (toolInput.type as string) ?? ''

  // Count results from output
  const resultLines = resultContent?.split('\n').filter(l => l.trim().length > 0) ?? []
  const resultCount = resultLines.length

  // Truncate results
  const truncated = resultLines.length > MAX_RESULT_LINES ? resultLines.length - MAX_RESULT_LINES : 0
  const displayLines = truncated > 0 ? resultLines.slice(0, MAX_RESULT_LINES) : resultLines

  return (
    <div className="space-y-0">
      {/* Search params header */}
      <div className="px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs overflow-hidden">
        {/* Pattern */}
        <div className="text-gray-400">
          <span className="text-gray-600 select-none">{isGrep ? '/' : ''}</span>
          <span className="text-amber-400/80">{pattern}</span>
          <span className="text-gray-600 select-none">{isGrep ? '/' : ''}</span>
        </div>

        {/* Search filters on second line */}
        <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-600">
          {path && <span>in {path}</span>}
          {outputMode && isGrep && <span className="px-1 rounded bg-white/[0.04]">{outputMode}</span>}
          {glob && <span>glob: {glob}</span>}
          {fileType && <span>type: {fileType}</span>}
        </div>
      </div>

      {/* Results */}
      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20 text-gray-500'
        }`}>
          {/* Result count badge */}
          {!isError && resultCount > 0 && (
            <div className="px-3 pt-1.5 text-[10px] text-gray-600 select-none">
              {resultCount} result{resultCount !== 1 ? 's' : ''}
            </div>
          )}

          <pre className="px-3 py-1.5 whitespace-pre-wrap break-all">
            {displayLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {truncated > 0 && (
              <div className="text-gray-600 italic select-none">
                ... {truncated} more result{truncated > 1 ? 's' : ''}
              </div>
            )}
          </pre>
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
