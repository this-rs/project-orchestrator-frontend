/**
 * McpToolRenderer — dispatcher for MCP project-orchestrator tools.
 *
 * Extracts the action name from the full tool name, classifies it into
 * a category (list, entity, chat, code, progress), and delegates rendering
 * to the appropriate sub-renderer.
 *
 * Falls back to GenericMcpView for unrecognized actions.
 */

import type { ToolRendererProps } from './types'
import {
  classifyAction,
  ListRenderer,
  EntityRenderer,
  ChatRenderer,
  CodeRenderer,
  ProgressRenderer,
  parseResult,
  ErrorDisplay,
} from './mcp'

const MCP_PREFIX = 'mcp__project-orchestrator__'

/** Fields to skip in generic param display */
const SKIP_PARAMS = new Set([
  'description', 'content', 'acceptance_criteria', 'affected_files',
  'alternatives', 'anchors', 'scope', 'metadata', 'config',
])

const MAX_VALUE_LEN = 120

function truncateValue(val: string): string {
  if (val.length <= MAX_VALUE_LEN) return val
  return val.slice(0, MAX_VALUE_LEN) + '...'
}

function formatValue(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return truncateValue(val)
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    if (val.every(v => typeof v === 'string')) return val.join(', ')
    return truncateValue(JSON.stringify(val))
  }
  return truncateValue(JSON.stringify(val))
}

// ---------------------------------------------------------------------------
// Generic fallback (original McpToolRenderer behavior)
// ---------------------------------------------------------------------------

function GenericMcpView({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const desc = typeof toolInput.description === 'string' ? toolInput.description : ''
  const params = Object.entries(toolInput).filter(
    ([key, val]) => val != null && val !== '' && !SKIP_PARAMS.has(key),
  )

  return (
    <div className="space-y-0">
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

      {desc.length > 0 && (
        <div className="border-t border-white/[0.04] px-3 py-1.5 bg-black/20 text-xs text-gray-600">
          {desc.length > 200 ? desc.slice(0, 200) + '...' : desc}
        </div>
      )}

      {!isLoading && resultContent != null && resultContent.length > 0 && (
        <div className={`border-t text-xs overflow-x-auto max-h-60 overflow-y-auto ${
          isError
            ? 'border-red-800/30 bg-red-950/20 text-red-400'
            : 'border-white/[0.04] bg-black/20'
        }`}>
          <pre className="px-3 py-1.5 font-mono text-gray-500 whitespace-pre-wrap break-all">
            {resultContent.length > 2000
              ? resultContent.slice(0, 2000) + '\n... (truncated)'
              : resultContent}
          </pre>
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

// ---------------------------------------------------------------------------
// McpToolRenderer — the main dispatcher
// ---------------------------------------------------------------------------

export function McpToolRenderer(props: ToolRendererProps) {
  const { toolName, toolInput, resultContent, isError, isLoading } = props

  // Extract action name from "mcp__project-orchestrator__<action>"
  const action = toolName.startsWith(MCP_PREFIX)
    ? toolName.slice(MCP_PREFIX.length)
    : toolName

  // If error, show error display with generic params
  if (isError && resultContent) {
    return (
      <div className="space-y-1">
        <ParamsHeader toolInput={toolInput} />
        <ErrorDisplay content={resultContent} />
      </div>
    )
  }

  // If still loading, show params + loading indicator
  if (isLoading) {
    return (
      <div className="space-y-0">
        <ParamsHeader toolInput={toolInput} />
        <div className="rounded-b-md bg-black/20 px-3 py-1.5">
          <span className="text-xs text-gray-600 animate-pulse">processing...</span>
        </div>
      </div>
    )
  }

  // Parse the result
  const parsed = parseResult(resultContent)

  // If we couldn't parse, fall back to generic
  if (parsed == null && resultContent) {
    return <GenericMcpView {...props} />
  }

  // Classify and dispatch
  const category = classifyAction(action)

  let rendered: React.ReactNode = null

  switch (category) {
    case 'list':
      rendered = <ListRenderer action={action} parsed={parsed} toolInput={toolInput} />
      break
    case 'chat':
      rendered = <ChatRenderer action={action} parsed={parsed} toolInput={toolInput} />
      break
    case 'code':
      rendered = <CodeRenderer action={action} parsed={parsed} toolInput={toolInput} />
      break
    case 'progress':
      rendered = <ProgressRenderer action={action} parsed={parsed} toolInput={toolInput} />
      break
    case 'entity':
      rendered = <EntityRenderer action={action} parsed={parsed} toolInput={toolInput} />
      break
    default:
      return <GenericMcpView {...props} />
  }

  // If the sub-renderer returned null, fall back to generic
  if (rendered == null) {
    return <GenericMcpView {...props} />
  }

  return (
    <div className="space-y-1">
      <ParamsHeader toolInput={toolInput} />
      {rendered}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Params header — compact display of the input params
// ---------------------------------------------------------------------------

function ParamsHeader({ toolInput }: { toolInput: Record<string, unknown> }) {
  const params = Object.entries(toolInput).filter(
    ([key, val]) => val != null && val !== '' && !SKIP_PARAMS.has(key),
  )

  if (params.length === 0) return null

  return (
    <div className="px-3 py-1.5 bg-black/30 rounded-t-md font-mono text-xs space-y-0.5">
      {params.map(([key, val]) => (
        <div key={key} className="flex gap-2">
          <span className="text-gray-600 shrink-0 select-none">{key}:</span>
          <span className="text-gray-400 break-all">{formatValue(val)}</span>
        </div>
      ))}
    </div>
  )
}
