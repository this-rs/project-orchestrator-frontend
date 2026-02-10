/**
 * EditToolRenderer — GitHub-style unified diff view for Edit tool calls.
 *
 * Header: file path + extension badge + replace-all badge + line count summary
 * Body: diff header (@@ ... @@), red/green line-by-line diff with line numbers
 */

import type { ToolRendererProps } from './types'
import { detectLanguage, tokenizeLine, getExtBadgeColor, getFileExtension } from './syntax'

/** Max lines to show before truncating each side */
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

  const ext = getFileExtension(filePath)
  const language = detectLanguage(filePath)
  const badgeColor = getExtBadgeColor(ext)

  const oldLines = oldString.split('\n')
  const newLines = newString.split('\n')
  const oldLineCount = oldString.length > 0 ? oldLines.length : 0
  const newLineCount = newString.length > 0 ? newLines.length : 0

  const oldResult = splitAndTruncate(oldString, MAX_DIFF_LINES)
  const newResult = splitAndTruncate(newString, MAX_DIFF_LINES)

  // Width for line number gutters
  const maxNum = Math.max(oldLineCount, newLineCount, 1)
  const gutterWidth = Math.max(3, String(maxNum).length + 1)

  return (
    <div className="space-y-0">
      {/* File path header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs text-gray-500">
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/40 text-amber-400 border border-amber-800/30">
          EDIT
        </span>
        {ext && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badgeColor}`}>
            {ext}
          </span>
        )}
        <span className="truncate">{filePath}</span>
        {replaceAll && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/40 text-amber-400 border border-amber-800/30">
            replace all
          </span>
        )}
        {/* Line count summary */}
        <span className="shrink-0 ml-auto text-[10px] text-gray-600">
          {oldLineCount > 0 && (
            <span className="text-red-500">-{oldLineCount} line{oldLineCount !== 1 ? 's' : ''}</span>
          )}
          {oldLineCount > 0 && newLineCount > 0 && ', '}
          {newLineCount > 0 && (
            <span className="text-green-500">+{newLineCount} line{newLineCount !== 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      {/* Diff header */}
      <div className="border-t border-white/[0.04] bg-black/30 px-3 py-1 font-mono text-xs text-cyan-500/70 select-none">
        @@ -{oldLineCount > 0 ? `1,${oldLineCount}` : '0,0'} +{newLineCount > 0 ? `1,${newLineCount}` : '0,0'} @@
      </div>

      {/* Unified diff view */}
      <div className="font-mono text-xs overflow-x-auto max-h-80 overflow-y-auto">
        <pre className="whitespace-pre-wrap break-all">
          {/* Removed lines (red) */}
          {oldString.length > 0 && oldResult.lines.map((line, i) => {
            const lineNum = i + 1
            const tokens = tokenizeLine(line, language)
            return (
              <div key={`old-${i}`} className="flex bg-red-950/25 hover:bg-red-950/35">
                {/* Old line number */}
                <span
                  className="select-none text-red-800/60 text-right pr-1 shrink-0 bg-red-950/30"
                  style={{ width: `${gutterWidth}ch` }}
                >
                  {lineNum}
                </span>
                {/* Empty new-side gutter */}
                <span
                  className="select-none text-right pr-1 shrink-0 bg-red-950/20"
                  style={{ width: `${gutterWidth}ch` }}
                />
                {/* Minus prefix */}
                <span className="select-none text-red-500/70 shrink-0 w-4 text-center font-bold">{'\u2212'}</span>
                {/* Content with muted syntax highlighting */}
                <span className="flex-1 text-red-400/80">
                  {tokens.map((t, j) => (
                    <span key={j} className={t.className} style={{ opacity: 0.7 }}>{t.text}</span>
                  ))}
                </span>
              </div>
            )
          })}
          {oldResult.truncated > 0 && (
            <div className="text-red-700/50 italic select-none pl-2 py-0.5 bg-red-950/15">
              ... {oldResult.truncated} more removed line{oldResult.truncated > 1 ? 's' : ''}
            </div>
          )}

          {/* Added lines (green) */}
          {newString.length > 0 && newResult.lines.map((line, i) => {
            const lineNum = i + 1
            const tokens = tokenizeLine(line, language)
            return (
              <div key={`new-${i}`} className="flex bg-green-950/25 hover:bg-green-950/35">
                {/* Empty old-side gutter */}
                <span
                  className="select-none text-right pr-1 shrink-0 bg-green-950/20"
                  style={{ width: `${gutterWidth}ch` }}
                />
                {/* New line number */}
                <span
                  className="select-none text-green-800/60 text-right pr-1 shrink-0 bg-green-950/30"
                  style={{ width: `${gutterWidth}ch` }}
                >
                  {lineNum}
                </span>
                {/* Plus prefix */}
                <span className="select-none text-green-500/70 shrink-0 w-4 text-center font-bold">+</span>
                {/* Content with syntax highlighting */}
                <span className="flex-1">
                  {tokens.map((t, j) => (
                    <span key={j} className={t.className}>{t.text}</span>
                  ))}
                </span>
              </div>
            )
          })}
          {newResult.truncated > 0 && (
            <div className="text-green-700/50 italic select-none pl-2 py-0.5 bg-green-950/15">
              ... {newResult.truncated} more added line{newResult.truncated > 1 ? 's' : ''}
            </div>
          )}
        </pre>
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
