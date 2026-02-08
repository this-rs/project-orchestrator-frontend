/**
 * BashToolRenderer — specialized view for Bash tool calls.
 *
 * Collapsed header: terminal icon + description (or truncated command)
 * Expanded: terminal-style block with command, separator, and output
 */

import type { ToolRendererProps } from './types'

export function BashToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const command = (toolInput.command as string) ?? ''
  const description = (toolInput.description as string) ?? ''

  return (
    <div className="space-y-0">
      {/* Terminal-style command block */}
      <div className={`rounded-t-md font-mono text-xs ${isError ? 'bg-red-950/30' : 'bg-black/30'} overflow-hidden`}>
        {description && (
          <div className="px-3 pt-2 text-gray-600 select-none">
            # {description}
          </div>
        )}
        <div className="px-3 py-2 text-gray-300 whitespace-pre-wrap break-all">
          <span className="text-gray-600 select-none">$ </span>
          {command}
        </div>
      </div>

      {/* Output */}
      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t rounded-b-md font-mono text-xs overflow-x-auto max-h-60 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20 text-gray-500'
        }`}>
          <pre className="px-3 py-2 whitespace-pre-wrap break-all">
            {resultContent.length > 3000
              ? resultContent.slice(0, 3000) + '\n... (truncated)'
              : resultContent}
          </pre>
        </div>
      )}

      {isLoading && (
        <div className="border-t border-white/[0.04] rounded-b-md bg-black/20 px-3 py-2">
          <span className="text-xs text-gray-600 animate-pulse">running...</span>
        </div>
      )}
    </div>
  )
}

