/**
 * Tool Renderer Registry
 *
 * Maps a (provider kind, tool name) pair to a specialized React component.
 * Falls back to DefaultToolRenderer for any tool without a custom renderer.
 *
 * The tables below are keyed by Claude Code tool names: they are both the
 * table of the `claude_code` kind and the CANONICAL vocabulary other providers
 * are mapped onto (`shell` of Codex → `Bash`). A session without a provider is
 * a Claude Code session and resolves exactly as it always did.
 *
 * To add a new renderer:
 * 1. Create a new component implementing ToolRendererProps
 * 2. Import it here
 * 3. Add entries to TOOL_REGISTRY (and optionally SUMMARY_REGISTRY / ICON_REGISTRY)
 */

/* eslint-disable react-refresh/only-export-components */

import { createElement, type ComponentType } from 'react'
import type { ToolRendererProps } from './types'
import { toToolCategory, type ProviderKind, type ToolCategory } from '@/types/provider'
import { DefaultToolRenderer } from './DefaultToolRenderer'
import { BashToolRenderer } from './BashToolRenderer'
import { EditToolRenderer } from './EditToolRenderer'
import { ReadToolRenderer } from './ReadToolRenderer'
import { WriteToolRenderer } from './WriteToolRenderer'
import { SearchToolRenderer } from './SearchToolRenderer'
import { WebToolRenderer } from './WebToolRenderer'
import { McpToolRenderer } from './McpToolRenderer'
import { TodoWriteRenderer } from './TodoWriteRenderer'
import {
  getBashSummary, getEditSummary, getReadSummary, getWriteSummary,
  getGlobSummary, getGrepSummary, getWebFetchSummary, getWebSearchSummary,
  getTodoWriteSummary, getMcpSummary,
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
  TodoWrite: TodoWriteRenderer,
  __mcp__: McpToolRenderer,
}

// ---------------------------------------------------------------------------
// Resolution: (provider kind, tool) → renderer
// ---------------------------------------------------------------------------

/** What the provider adapter (or the session) says about a tool call. All optional. */
export interface ToolProviderContext {
  /** Kind of the session's provider. Absent = `claude_code` (a session created before providers). */
  providerKind?: ProviderKind | null
  /** Canonical alias stamped on the event by the provider adapter (`Bash`, `Read`, `Edit`…). */
  canonical?: string | null
}

export interface ToolRendererQuery extends ToolProviderContext {
  toolName: string
  toolInput?: Record<string, unknown>
}

export interface ResolvedToolRenderer {
  Renderer: ComponentType<ToolRendererProps>
  /**
   * Claude tool name whose renderer / summary / icon apply, `__mcp__` for an
   * MCP tool, `null` for the default renderer.
   */
  key: string | null
  /** Which step of the lookup answered. */
  via: 'provider' | 'canonical' | 'alias' | 'mcp' | 'default'
  /** The input in the shape the renderer reads (see `toCanonicalInput`). */
  toolInput: Record<string, unknown>
  /**
   * The name the renderer should read. The provider's own name, except for an
   * MCP tool the adapter normalised (`server_tool` of opencode →
   * `mcp__server__tool`): the MCP renderer parses the canonical form.
   */
  toolName: string
}

const CLAUDE_CODE_KIND = 'claude_code'

/** Renderer tables by provider kind, keyed by the provider's own tool names. */
const PROVIDER_TOOL_TABLES: Record<string, Record<string, ComponentType<ToolRendererProps>>> = {
  [CLAUDE_CODE_KIND]: TOOL_REGISTRY,
}

/**
 * Static aliases, unverified against real traffic (provider tool name → canonical Claude name)
 * for adapters that do not stamp `canonical` on their events yet. Guessed from
 * public documentation, not from real traffic: the real tables will be derived
 * from the Nexus transcripts, and an alias sent by the adapter always wins
 * over this one.
 */
const STATIC_TOOL_ALIASES: Record<string, Record<string, string>> = {
  codex: {
    shell: 'Bash',
    apply_patch: 'Edit',
  },
}

function kindOf(providerKind: ProviderKind | null | undefined): string {
  return providerKind || CLAUDE_CODE_KIND
}

function own<T>(table: Record<string, T> | undefined, key: string | null | undefined): T | undefined {
  return table && key && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

/**
 * The command of a shell-like tool as one string. Claude's Bash sends a
 * string; Codex's `shell` sends an argv array (`["bash", "-lc", "ls"]`).
 * `null` when the input carries no readable command.
 */
export function commandText(input: Record<string, unknown> | undefined): string | null {
  const command = input?.command ?? input?.cmd
  if (typeof command === 'string') return command
  if (Array.isArray(command) && command.every((part) => typeof part === 'string')) return command.join(' ')
  return null
}

/**
 * Adapt another provider's input to what the canonical renderer reads, or
 * `null` when it does not fit. A renderer borrowed through an alias must not
 * be handed an input it would render as an empty shell: `apply_patch` carries
 * one patch string, not Edit's `old_string`/`new_string`, and is better shown
 * raw by the default renderer than as an empty diff.
 */
function toCanonicalInput(key: string, input: Record<string, unknown>): Record<string, unknown> | null {
  switch (key) {
    case 'Bash': {
      const command = commandText(input)
      if (command === null) return null
      return typeof input.command === 'string' ? input : { ...input, command }
    }
    case 'Edit':
      return typeof input.file_path === 'string' && typeof input.old_string === 'string' ? input : null
    case 'Read':
    case 'Write':
      return typeof input.file_path === 'string' ? input : null
    default:
      return input
  }
}

function isMcpCall(toolName: string, toolInput: Record<string, unknown> | undefined): boolean {
  return toolName.startsWith(MCP_PREFIX) || typeof toolInput?.action === 'string'
}

/**
 * Find the renderer of a tool call. In order:
 *  (a) the table of the provider's kind, by exact tool name;
 *  (b) the canonical alias the event carries;
 *  (c) the static alias table of the kind (provisional);
 *  (d) MCP (project-orchestrator prefix, or a mega-tool `action`);
 *  (e) the default renderer.
 *
 * Never throws: an unknown kind or tool ends at (e).
 */
export function resolveToolRenderer({ providerKind, toolName, canonical, toolInput }: ToolRendererQuery): ResolvedToolRenderer {
  const kind = kindOf(providerKind)
  const input = toolInput ?? {}

  const exact = own(PROVIDER_TOOL_TABLES[kind], toolName)
  if (exact) return { Renderer: exact, key: toolName, via: 'provider', toolInput: input, toolName }

  const borrowed: Array<[string | null | undefined, 'canonical' | 'alias']> = [
    [canonical, 'canonical'],
    [own(STATIC_TOOL_ALIASES[kind], toolName), 'alias'],
  ]
  for (const [key, via] of borrowed) {
    const Renderer = key && key !== '__mcp__' ? own(TOOL_REGISTRY, key) : undefined
    if (!key || !Renderer) continue
    const adapted = toCanonicalInput(key, input)
    if (adapted) return { Renderer, key, via, toolInput: adapted, toolName }
  }

  // Every MCP tool has the canonical alias `mcp__<server>__<tool>`, whatever
  // the provider's own naming.
  const mcpName = canonical && canonical.startsWith('mcp__') ? canonical : toolName
  if (isMcpCall(mcpName, toolInput) && TOOL_REGISTRY['__mcp__']) {
    return { Renderer: TOOL_REGISTRY['__mcp__'], key: '__mcp__', via: 'mcp', toolInput: input, toolName: mcpName }
  }

  return { Renderer: DefaultToolRenderer, key: null, via: 'default', toolInput: input, toolName }
}

// ---------------------------------------------------------------------------
// Category: what KIND of action a tool call is (permission prompts)
// ---------------------------------------------------------------------------

/**
 * Category of the Claude Code tools, by lower-cased name. Used only when the
 * provider adapter did not stamp a category on the event — which is the case
 * of every Claude Code event so far.
 */
const CLAUDE_TOOL_CATEGORIES: Record<string, ToolCategory> = {
  bash: 'command',
  read: 'read',
  glob: 'search',
  grep: 'search',
  edit: 'edit',
  write: 'edit',
  notebookedit: 'edit',
  webfetch: 'web',
  websearch: 'web',
}

/**
 * Category of a tool call: the one the adapter supplied when there is one
 * (never second-guessed from the name), else the category of its canonical
 * alias, else the Claude table by name, else MCP by prefix, else `other`.
 */
export function getToolCategory(
  toolName: string,
  hints: ToolProviderContext & { category?: unknown } = {},
): ToolCategory {
  const supplied = toToolCategory(hints.category)
  if (supplied) return supplied
  const alias = hints.canonical ?? own(STATIC_TOOL_ALIASES[kindOf(hints.providerKind)], toolName)
  const lower = toolName.toLowerCase()
  const known = own(CLAUDE_TOOL_CATEGORIES, alias?.toLowerCase()) ?? own(CLAUDE_TOOL_CATEGORIES, lower)
  if (known) return known
  if (lower.startsWith('mcp__') || lower.startsWith('mcp_')) return 'mcp'
  return 'other'
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
  TodoWrite: getTodoWriteSummary,
}

/**
 * Get a human-readable summary for a tool call's collapsed header.
 * Returns undefined if no custom summary is registered (caller shows toolName).
 */
export function getToolSummary(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolProviderContext = {},
): string | undefined {
  const resolved = resolveToolRenderer({ ...context, toolName, toolInput })
  const fn = own(SUMMARY_REGISTRY, resolved.key)
  if (fn) return fn(resolved.toolInput)
  // MCP tools (with prefix) or mega-tools (with toolInput.action)
  if (resolved.via === 'mcp') {
    return getMcpSummary(resolved.toolName, toolInput)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Icons: per-tool icon character for collapsed header
// ---------------------------------------------------------------------------

const ICON_REGISTRY: Record<string, string> = {
  Bash: '$',
  Edit: '✏',
  Read: '📄',
  Write: '📝',
  Glob: '📂',
  Grep: '🔍',
  WebFetch: '↓',
  WebSearch: '🔎',
  TodoWrite: '☑',
}

/**
 * Detect the action verb from an MCP tool name (or mega-tool action) and return an icon.
 */
export function getMcpIcon(toolName: string, toolInput?: Record<string, unknown>): string {
  // Use toolInput.action (mega-tool sub-action) if available, otherwise strip prefix
  const subAction = typeof toolInput?.action === 'string' ? toolInput.action : undefined
  const action = subAction ?? (toolName.startsWith(MCP_PREFIX)
    ? toolName.slice(MCP_PREFIX.length)
    : toolName)
  if (/^(create|add)/.test(action)) return '+'
  if (/^update/.test(action)) return '↻'
  if (/^delete/.test(action)) return '✕'
  if (/^get/.test(action)) return '◇'
  if (/^list/.test(action)) return '≡'
  if (/^(search|find)/.test(action)) return '⌕'
  if (/^link/.test(action)) return '⇄'
  if (/^sync/.test(action)) return '↻'
  return '⚙'
}

/**
 * Get a short icon/symbol for a tool. Returns undefined for unknown tools.
 */
export function getToolIcon(
  toolName: string,
  toolInput?: Record<string, unknown>,
  context: ToolProviderContext = {},
): string | undefined {
  const resolved = resolveToolRenderer({ ...context, toolName, toolInput })
  const icon = own(ICON_REGISTRY, resolved.key)
  if (icon) return icon
  if (resolved.via === 'mcp') {
    return getMcpIcon(resolved.toolName, toolInput)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// ToolContent — renders the right component for a given tool
// ---------------------------------------------------------------------------

/**
 * Renders the appropriate tool content for a tool call of a given provider.
 * Uses `resolveToolRenderer`, or falls back to the default renderer.
 *
 * `providerKind` and `canonical` are optional: without them this is a Claude
 * Code tool call, resolved by name as before.
 */
export function ToolContent({ providerKind, canonical, ...props }: ToolRendererProps & ToolProviderContext) {
  const { Renderer, toolInput, toolName } = resolveToolRenderer({
    providerKind,
    canonical,
    toolName: props.toolName,
    toolInput: props.toolInput,
  })
  // createElement, not <Renderer />: the component is looked up, not declared,
  // during render (react-hooks/static-components).
  return createElement(Renderer, { ...props, toolName, toolInput })
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
