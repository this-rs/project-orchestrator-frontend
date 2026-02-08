/**
 * Tool Renderer Registry
 *
 * Maps tool names to specialized React components. Falls back to
 * DefaultToolRenderer for any tool without a custom renderer.
 *
 * To add a new renderer:
 * 1. Create a new component implementing ToolRendererProps
 * 2. Import it here
 * 3. Add entries to TOOL_REGISTRY (and optionally SUMMARY_REGISTRY / ICON_REGISTRY)
 */

import type { ComponentType } from 'react'
import type { ToolRendererProps } from './types'
import { DefaultToolRenderer } from './DefaultToolRenderer'
import { BashToolRenderer } from './BashToolRenderer'
import { EditToolRenderer } from './EditToolRenderer'
import { ReadToolRenderer } from './ReadToolRenderer'
import { WriteToolRenderer } from './WriteToolRenderer'
import { SearchToolRenderer } from './SearchToolRenderer'
import { WebToolRenderer } from './WebToolRenderer'
import { McpToolRenderer } from './McpToolRenderer'
import {
  getBashSummary, getEditSummary, getReadSummary, getWriteSummary,
  getGlobSummary, getGrepSummary, getWebFetchSummary, getWebSearchSummary,
  getMcpSummary,
} from './summaries'

export type { ToolRendererProps } from './types'

// ---------------------------------------------------------------------------
// MCP tool prefix
// ---------------------------------------------------------------------------

const MCP_PREFIX = 'mcp__project-orchestrator__'

// ---------------------------------------------------------------------------
// Registry: tool name → renderer component
// ---------------------------------------------------------------------------

const TOOL_REGISTRY: Record<string, ComponentType<ToolRendererProps>> = {
  Bash: BashToolRenderer,
  Edit: EditToolRenderer,
  Read: ReadToolRenderer,
  Write: WriteToolRenderer,
  Glob: SearchToolRenderer,
  Grep: SearchToolRenderer,
  WebFetch: WebToolRenderer,
  WebSearch: WebToolRenderer,
  __mcp__: McpToolRenderer,
}

// ---------------------------------------------------------------------------
// Summary: per-tool header text for collapsed state
// ---------------------------------------------------------------------------

type SummaryFn = (toolInput: Record<string, unknown>) => string

const SUMMARY_REGISTRY: Record<string, SummaryFn> = {
  Bash: getBashSummary,
  Edit: getEditSummary,
  Read: getReadSummary,
  Write: getWriteSummary,
  Glob: getGlobSummary,
  Grep: getGrepSummary,
  WebFetch: getWebFetchSummary,
  WebSearch: getWebSearchSummary,
}

/**
 * Get a human-readable summary for a tool call's collapsed header.
 * Returns undefined if no custom summary is registered (caller shows toolName).
 */
export function getToolSummary(
  toolName: string,
  toolInput: Record<string, unknown>,
): string | undefined {
  const fn = SUMMARY_REGISTRY[toolName]
  if (fn) return fn(toolInput)
  // MCP tools: contextual summary via getMcpSummary
  if (toolName.startsWith(MCP_PREFIX)) {
    return getMcpSummary(toolName, toolInput)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Icons: per-tool icon character for collapsed header
// ---------------------------------------------------------------------------

const ICON_REGISTRY: Record<string, string> = {
  Bash: '›_',
  Edit: '~',
  Read: '{}',
  Write: '+',
  Glob: '**',
  Grep: '/?',
  WebFetch: '↓',
  WebSearch: '🔍',
}

/**
 * Get a short icon/symbol for a tool. Returns undefined for unknown tools.
 */
export function getToolIcon(toolName: string): string | undefined {
  if (ICON_REGISTRY[toolName]) return ICON_REGISTRY[toolName]
  if (toolName.startsWith(MCP_PREFIX)) return '⚙'
  return undefined
}

// ---------------------------------------------------------------------------
// ToolContent — renders the right component for a given tool
// ---------------------------------------------------------------------------

/**
 * Renders the appropriate tool content based on the tool name.
 * Uses the registry to find a specialized renderer, or falls back to default.
 *
 * This is a proper React component (not a dynamic lookup), so it avoids
 * the react-hooks/static-components ESLint rule.
 */
export function ToolContent(props: ToolRendererProps) {
  const { toolName } = props

  // 1. Exact match
  if (TOOL_REGISTRY[toolName]) {
    const Matched = TOOL_REGISTRY[toolName]
    return <Matched {...props} />
  }

  // 2. MCP prefix match
  if (toolName.startsWith(MCP_PREFIX) && TOOL_REGISTRY['__mcp__']) {
    const McpRenderer = TOOL_REGISTRY['__mcp__']
    return <McpRenderer {...props} />
  }

  // 3. Fallback
  return <DefaultToolRenderer {...props} />
}

// ---------------------------------------------------------------------------
// Dynamic registration (for plugins / future use)
// ---------------------------------------------------------------------------

/**
 * Register a renderer for one or more tool names.
 * Useful for dynamic registration or plugins.
 */
export function registerToolRenderer(
  toolNames: string | string[],
  renderer: ComponentType<ToolRendererProps>,
) {
  const names = Array.isArray(toolNames) ? toolNames : [toolNames]
  for (const name of names) {
    TOOL_REGISTRY[name] = renderer
  }
}
