/**
 * McpToolRenderer — specialized view for MCP project-orchestrator tools.
 *
 * Displays params as key-value pairs instead of raw JSON.
 * Extracts relevant fields from results for structured display.
 */

import type { ToolRendererProps } from './types'

/** Fields to skip in param display (too verbose or redundant) */
const SKIP_PARAMS = new Set(['description', 'content', 'acceptance_criteria', 'affected_files', 'alternatives'])

/** Max value length before truncating inline */
const MAX_VALUE_LEN = 120

function truncateValue(val: string): string {
  if (val.length <= MAX_VALUE_LEN) return val
  return val.slice(0, MAX_VALUE_LEN) + '...'
}

/** Format a param value for display */
function formatValue(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return truncateValue(val)
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    if (val.every(v => typeof v === 'string')) return val.join(', ')
    return JSON.stringify(val)
  }
  return truncateValue(JSON.stringify(val))
}

/** Try to extract key fields from a JSON result string */
function extractResultFields(content: string): { fields: [string, string][]; raw?: string } | null {
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null) return null

    const fields: [string, string][] = []
    const priority = ['id', 'title', 'name', 'status', 'version', 'slug', 'message', 'updated', 'created']

    for (const key of priority) {
      if (key in parsed && parsed[key] != null) {
        fields.push([key, formatValue(parsed[key])])
      }
    }

    // Add remaining simple fields
    for (const [key, val] of Object.entries(parsed)) {
      if (priority.includes(key)) continue
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        fields.push([key, formatValue(val)])
      }
    }

    if (fields.length === 0) return null
    return { fields }
  } catch {
    // Not JSON — show as raw
    return null
  }
}

export function McpToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const desc = typeof toolInput.description === 'string' ? toolInput.description : ''

  // Filter out empty/skipped params
  const params = Object.entries(toolInput).filter(
    ([key, val]) => val != null && val !== '' && !SKIP_PARAMS.has(key),
  )

  // Extract structured result if possible
  const structured = resultContent ? extractResultFields(resultContent) : null

  return (
    <div className="space-y-0">
      {/* Params as key-value */}
      {params.length > 0 && (
        <div className="px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs space-y-0.5">
          {params.map(([key, val]) => (
            <div key={key} className="flex gap-2">
              <span className="text-gray-600 shrink-0 select-none">{key}:</span>
              <span className="text-gray-400 break-all">{formatValue(val)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Long-form params (description, content, etc.) */}
      {typeof desc === 'string' && desc.length > 0 && (
        <div className="border-t border-white/[0.04] px-3 py-1.5 bg-black/20 text-xs text-gray-600">
          {desc.length > 200 ? desc.slice(0, 200) + '...' : desc}
        </div>
      )}

      {/* Result */}
      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t text-xs overflow-x-auto max-h-60 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20'
        }`}>
          {structured ? (
            <div className="px-3 py-1.5 font-mono space-y-0.5">
              {structured.fields.map(([key, val]) => (
                <div key={key} className="flex gap-2">
                  <span className={`shrink-0 select-none ${isError ? 'text-red-600' : 'text-gray-600'}`}>{key}:</span>
                  <span className={isError ? 'text-red-400' : 'text-gray-400'}>{val}</span>
                </div>
              ))}
            </div>
          ) : (
            <pre className="px-3 py-1.5 font-mono text-gray-500 whitespace-pre-wrap break-all">
              {resultContent.length > 2000
                ? resultContent.slice(0, 2000) + '\n... (truncated)'
                : resultContent}
            </pre>
          )}
        </div>
      )}

      {isLoading && (
        <div className={`${params.length > 0 ? 'border-t border-white/[0.04]' : ''} rounded-b-md bg-black/20 px-3 py-1.5`}>
          <span className="text-xs text-gray-600 animate-pulse">processing...</span>
        </div>
      )}
    </div>
  )
}
