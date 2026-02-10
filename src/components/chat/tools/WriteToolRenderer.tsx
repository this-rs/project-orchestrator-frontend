/**
 * WriteToolRenderer — specialized view for Write tool calls.
 *
 * Header: file path + extension badge + stats + optional NEW FILE badge
 * Body: green gutter indicators, line numbers, syntax-highlighted content
 */

import type { ToolRendererProps } from './types'
import { detectLanguage, tokenizeLine, getExtBadgeColor, getFileExtension } from './syntax'

/** Max lines to preview in expanded view */
const MAX_PREVIEW_LINES = 25

export function WriteToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const filePath = (toolInput.file_path as string) ?? ''
  const content = (toolInput.content as string) ?? ''

  const ext = getFileExtension(filePath)
  const language = detectLanguage(filePath)
  const badgeColor = getExtBadgeColor(ext)

  // Detect if the result says the file was created (vs overwritten)
  const isNewFile = resultContent != null && /creat/i.test(resultContent)

  // Content stats
  const allLines = content.split('\n')
  const totalLines = allLines.length
  const totalChars = content.length
  const previewLines = allLines.slice(0, MAX_PREVIEW_LINES)
  const truncated = totalLines > MAX_PREVIEW_LINES ? totalLines - MAX_PREVIEW_LINES : 0

  // Gutter width
  const maxLineNum = previewLines.length
  const gutterWidth = Math.max(3, String(maxLineNum).length + 1)

  return (
    <div className="space-y-0">
      {/* File path header + stats */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs text-gray-500">
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-900/40 text-green-400 border border-green-800/30">
          {isNewFile ? 'CREATE' : 'WRITE'}
        </span>
        {ext && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badgeColor}`}>
            {ext}
          </span>
        )}
        <span className="truncate">{filePath}</span>
        <span className="shrink-0 text-gray-600 text-[10px]">
          {totalLines} line{totalLines !== 1 ? 's' : ''}, {totalChars.toLocaleString()} chars
        </span>
      </div>

      {/* Content preview with green gutter + line numbers + syntax */}
      {content.length > 0 && (
        <div className="border-t border-white/[0.04] bg-green-950/10 font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto">
          <pre className="py-1.5 whitespace-pre-wrap break-all">
            {previewLines.map((line, i) => {
              const lineNum = i + 1
              const tokens = tokenizeLine(line, language)
              return (
                <div key={i} className="flex hover:bg-white/[0.02]">
                  {/* Green "+" gutter indicator */}
                  <span className="select-none text-green-600/70 shrink-0 w-4 text-center">+</span>
                  {/* Line number */}
                  <span
                    className="select-none text-gray-700 text-right pr-3 shrink-0"
                    style={{ width: `${gutterWidth}ch` }}
                  >
                    {lineNum}
                  </span>
                  {/* Syntax-highlighted content */}
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
