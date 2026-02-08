/**
 * WriteToolRenderer — specialized view for Write tool calls.
 *
 * Collapsed header: write icon + basename
 * Expanded: full file path, content preview, size indicator
 */

import type { ToolRendererProps } from './types'

/** Max lines to preview in expanded view */
const MAX_PREVIEW_LINES = 25

export function WriteToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const filePath = (toolInput.file_path as string) ?? ''
  const content = (toolInput.content as string) ?? ''

  // Content stats
  const totalLines = content.split('\n').length
  const totalChars = content.length
  const previewLines = content.split('\n').slice(0, MAX_PREVIEW_LINES)
  const truncated = totalLines > MAX_PREVIEW_LINES ? totalLines - MAX_PREVIEW_LINES : 0

  return (
    <div className="space-y-0">
      {/* File path header + stats */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs text-gray-500">
        <span className="truncate">{filePath}</span>
        <span className="shrink-0 text-gray-600 text-[10px]">
          {totalLines} line{totalLines !== 1 ? 's' : ''}, {totalChars.toLocaleString()} chars
        </span>
      </div>

      {/* Content preview */}
      {content.length > 0 && (
        <div className="border-t border-white/[0.04] bg-green-950/10 border-l-2 border-l-green-800/30 font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto">
          <pre className="px-3 py-1.5 whitespace-pre-wrap break-all text-gray-500">
            {previewLines.map((line, i) => (
              <div key={i}>
                <span className="text-gray-700 select-none inline-block w-8 text-right mr-2">{i + 1}</span>
                {line}
              </div>
            ))}
            {truncated > 0 && (
              <div className="text-gray-600 italic select-none pl-10">
                ... {truncated} more line{truncated > 1 ? 's' : ''}
              </div>
            )}
          </pre>
        </div>
      )}

      {/* Result / error / loading */}
      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t rounded-b-md text-xs px-3 py-1.5 ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20 text-gray-600'
        }`}>
          {resultContent.length > 500
            ? resultContent.slice(0, 500) + '... (truncated)'
            : resultContent}
        </div>
      )}

      {isLoading && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 animate-pulse">writing...</span>
        </div>
      )}
    </div>
  )
}
