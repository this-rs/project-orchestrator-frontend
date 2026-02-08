/**
 * WebToolRenderer — specialized view for WebFetch and WebSearch tool calls.
 *
 * WebFetch: globe icon + hostname, expanded with full URL + prompt + result
 * WebSearch: search icon + query, expanded with query + results
 */

import type { ToolRendererProps } from './types'

/** Max lines for result preview */
const MAX_RESULT_LINES = 25

export function WebToolRenderer({ toolName, toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const isWebSearch = toolName === 'WebSearch'

  // WebFetch fields
  const url = (toolInput.url as string) ?? ''
  const prompt = (toolInput.prompt as string) ?? ''

  // WebSearch fields
  const query = (toolInput.query as string) ?? ''

  // Result preview
  const lines = resultContent?.split('\n') ?? []
  const truncated = lines.length > MAX_RESULT_LINES ? lines.length - MAX_RESULT_LINES : 0
  const displayLines = truncated > 0 ? lines.slice(0, MAX_RESULT_LINES) : lines

  return (
    <div className="space-y-0">
      {/* Header with params */}
      <div className="px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs overflow-hidden">
        {isWebSearch ? (
          <>
            <div className="text-gray-400">
              <span className="text-gray-600 select-none">query: </span>
              <span className="text-blue-400/80">{query}</span>
            </div>
            {toolInput.allowed_domains && (
              <div className="text-[10px] text-gray-600 mt-0.5">
                domains: {String(toolInput.allowed_domains)}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-blue-400/80 truncate">
              {url}
            </div>
            {prompt && (
              <div className="text-gray-600 mt-1 text-[10px] truncate">
                {prompt}
              </div>
            )}
          </>
        )}
      </div>

      {/* Result */}
      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t font-mono text-xs overflow-x-auto max-h-72 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20 text-gray-500'
        }`}>
          <pre className="px-3 py-1.5 whitespace-pre-wrap break-all">
            {displayLines.map((line, i) => (
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

      {isLoading && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 animate-pulse">
            {isWebSearch ? 'searching...' : 'fetching...'}
          </span>
        </div>
      )}
    </div>
  )
}
