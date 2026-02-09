/**
 * EditToolRenderer — specialized view for Edit tool calls.
 *
 * Collapsed header: pencil icon + file basename + optional "replace all" badge
 * Expanded: full file path, diff-style view with red (removed) / green (added)
 */

import type { ToolRendererProps } from './types'

/** Max lines to show before truncating */
const MAX_DIFF_LINES = 30

/** Split text into lines and optionally truncate */
function splitAndTruncate(text: string, maxLines: number): { lines: string[]; truncated: number } {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { lines, truncated: 0 }
  return { lines: lines.slice(0, maxLines), truncated: lines.length - maxLines }
}

export function EditToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const filePath = (toolInput.file_path as string) ?? ''
  const oldString = (toolInput.old_string as string) ?? ''
  const newString = (toolInput.new_string as string) ?? ''
  const replaceAll = (toolInput.replace_all as boolean) ?? false

  const oldResult = splitAndTruncate(oldString, MAX_DIFF_LINES)
  const newResult = splitAndTruncate(newString, MAX_DIFF_LINES)

  return (
    <div className="space-y-0">
      {/* File path header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs text-gray-500">
        <span className="truncate">{filePath}</span>
        {replaceAll && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800/30">
            replace all
          </span>
        )}
      </div>

      {/* Diff view */}
      <div className="font-mono text-xs overflow-x-auto max-h-80 overflow-y-auto">
        {/* Removed lines */}
        {oldString.length > 0 && (
          <div className="bg-red-950/20 border-l-2 border-red-800/40">
            <pre className="px-3 py-1.5 whitespace-pre-wrap break-all text-red-400/80">
              {oldResult.lines.map((line, i) => (
                <div key={i}>
                  <span className="text-red-600/60 select-none">- </span>
                  {line}
                </div>
              ))}
              {oldResult.truncated > 0 && (
                <div className="text-red-600/40 italic select-none">
                  ... {oldResult.truncated} more line{oldResult.truncated > 1 ? 's' : ''}
                </div>
              )}
            </pre>
          </div>
        )}

        {/* Added lines */}
        {newString.length > 0 && (
          <div className="bg-green-950/20 border-l-2 border-green-800/40">
            <pre className="px-3 py-1.5 whitespace-pre-wrap break-all text-green-400/80">
              {newResult.lines.map((line, i) => (
                <div key={i}>
                  <span className="text-green-600/60 select-none">+ </span>
                  {line}
                </div>
              ))}
              {newResult.truncated > 0 && (
                <div className="text-green-600/40 italic select-none">
                  ... {newResult.truncated} more line{newResult.truncated > 1 ? 's' : ''}
                </div>
              )}
            </pre>
          </div>
        )}
      </div>

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
          <span className="text-xs text-gray-600 animate-pulse">editing...</span>
        </div>
      )}
    </div>
  )
}
