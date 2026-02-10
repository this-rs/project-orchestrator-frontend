/**
 * ReadToolRenderer — specialized view for Read tool calls.
 *
 * Header: file path + extension badge + line range
 * Body: line-numbered, syntax-highlighted content preview
 */

import type { ToolRendererProps } from './types'
import { detectLanguage, tokenizeLine, getExtBadgeColor, getFileExtension } from './syntax'

/** Max lines to preview in expanded view */
const MAX_PREVIEW_LINES = 25

export function ReadToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const filePath = (toolInput.file_path as string) ?? ''
  const offset = toolInput.offset as number | undefined
  const limit = toolInput.limit as number | undefined

  const ext = getFileExtension(filePath)
  const language = detectLanguage(filePath)
  const badgeColor = getExtBadgeColor(ext)

  // Starting line number (offset is 1-based if provided)
  const startLine = offset ?? 1

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

  // Width of the line-number gutter (based on the largest number)
  const maxLineNum = startLine + previewLines.length - 1
  const gutterWidth = Math.max(3, String(maxLineNum).length + 1)

  return (
    <div className="space-y-0">
      {/* File path header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs text-gray-500">
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-900/40 text-blue-400 border border-blue-800/30">
          READ
        </span>
        {ext && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badgeColor}`}>
            {ext}
          </span>
        )}
        <span className="truncate">{filePath}</span>
        {rangeLabel && <span className="shrink-0 text-gray-600">{rangeLabel}</span>}
      </div>

      {/* Content preview with line numbers + syntax highlighting */}
      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20'
            : 'border-white/[0.04] bg-black/20'
        }`}>
          <pre className="py-1.5 whitespace-pre-wrap break-all">
            {previewLines.map((line, i) => {
              const lineNum = startLine + i
              const tokens = isError
                ? [{ text: line, className: 'text-red-400' }]
                : tokenizeLine(line, language)
              return (
                <div key={i} className="flex hover:bg-white/[0.02]">
                  <span
                    className="select-none text-gray-700 text-right pr-3 pl-2 shrink-0"
                    style={{ width: `${gutterWidth + 1}ch` }}
                  >
                    {lineNum}
                  </span>
                  <span className="flex-1">
                    {tokens.map((t, j) => (
                      <span key={j} className={t.className}>{t.text}</span>
                    ))}
                  </span>
                </div>
              )
            })}
            {truncated > 0 && (
              <div className="text-gray-600 italic select-none pl-2 py-0.5">
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
