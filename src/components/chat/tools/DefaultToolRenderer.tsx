/**
 * DefaultToolRenderer — fallback renderer for unrecognized tools.
 *
 * Displays the raw JSON input and result, exactly like the original
 * ToolCallBlock inline rendering. Used as the fallback when no
 * specialized renderer is registered for a tool name.
 */

import type { ToolRendererProps } from './types'

export function DefaultToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  return (
    <div className="space-y-2">
      {Object.keys(toolInput).length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Input</div>
          <pre className="text-xs text-gray-500 bg-black/20 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        </div>
      )}
      {!isLoading && resultContent != null && (
        <div>
          <div className={`text-[10px] uppercase tracking-wider mb-1 ${isError ? 'text-red-400' : 'text-gray-600'}`}>
            {isError ? 'Error' : 'Result'}
          </div>
          <pre className={`text-xs rounded p-2 overflow-x-auto max-h-40 overflow-y-auto ${isError ? 'text-red-400 bg-red-900/10' : 'text-gray-500 bg-black/20'}`}>
            {resultContent.length > 2000
              ? resultContent.slice(0, 2000) + '\n... (truncated)'
              : resultContent}
          </pre>
        </div>
      )}
    </div>
  )
}
