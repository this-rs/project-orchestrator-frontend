/**
 * ReadToolRenderer — specialized view for Read tool calls.
 *
 * Collapsed header: file icon + basename + line range if offset/limit provided
 * Expanded: full file path, content preview with line numbers
 */

import type { ToolRendererProps } from './types'

/** Max lines to preview in expanded view */
const MAX_PREVIEW_LINES = 25

export function ReadToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const filePath = (toolInput.file_path as string) ?? ''
  const offset = toolInput.offset as number | undefined
  const limit = toolInput.limit as number | undefined

  // Build line range label
  let rangeLabel = ''
  if (offset != null && limit != null) {
    rangeLabel = `:${offset}-${offset + limit}`
  } else if (offset != null) {
    rangeLabel = `:${offset}+`
  } else if (limit != null) {
    rangeLabel = `:1-${limit}`
  }

  // Preview the result content
  const lines = resultContent?.split('\n') ?? []
  const truncated = lines.length > MAX_PREVIEW_LINES ? lines.length - MAX_PREVIEW_LINES : 0
  const previewLines = truncated > 0 ? lines.slice(0, MAX_PREVIEW_LINES) : lines

  return (
    <div className="space-y-0">
      {/* File path header */}
      <div className="px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs text-gray-500 truncate">
        {filePath}
        {rangeLabel && <span className="text-gray-600">{rangeLabel}</span>}
      </div>

      {/* Content preview */}
      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20 text-gray-500'
        }`}>
          <pre className="px-3 py-1.5 whitespace-pre-wrap break-all">
            {previewLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {truncated > 0 && (
              <div className="text-gray-600 italic select-none">
                ... {truncated} more line{truncated > 1 ? 's' : ''}
              </div>
            )}
          </pre>
        </div>
      )}

      {/* Empty result */}
      {!isLoading && resultContent != null && resultContent.length === 0 && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 italic">empty file</span>
        </div>
      )}

      {isLoading && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 animate-pulse">reading...</span>
        </div>
      )}
    </div>
  )
}
