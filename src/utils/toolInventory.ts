// ============================================================================
// TOOL INVENTORY — what a session REALLY offers, and what its policy names
// ============================================================================
//
// `system_init.tools` is the list of tools the model is actually given. The
// policy (`tool_policy.allow`) is written in Claude syntax (`Read`,
// `Bash(git *)`, `mcp__server__*`) and may name tools this session does not
// have. The interface shows the first, and marks every allow pattern that
// matches none of them, so the policy never suggests a tool that is not there.
//
// Mapping: a bare name or a name with an argument (`Read`, `Bash(git *)`)
// designates the canonical tool of the `nexus` server (`mcp__nexus__Read`,
// `mcp__nexus__Bash`) — or the built-in tool of that name on a Claude Code
// session, whose tools carry no `mcp__` prefix.

/** The server whose tools are the canonical `Read`, `Bash`, `Edit`… of the agent engine. */
export const CANONICAL_TOOL_SERVER = 'nexus'

const MCP_PREFIX = 'mcp__'

/** `mcp__server__tool` → `{ server, tool }`; anything else → `null` (a built-in tool). */
export function parseMcpTool(name: string): { server: string; tool: string } | null {
  if (!name.startsWith(MCP_PREFIX)) return null
  const rest = name.slice(MCP_PREFIX.length)
  const sep = rest.indexOf('__')
  if (sep <= 0 || sep + 2 >= rest.length) return null
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) }
}

export interface ToolGroup {
  /** MCP server name; `null` = built-in tools (no `mcp__` prefix). */
  server: string | null
  /** Short names (`note`, `Read`), sorted. */
  tools: string[]
}

/** Offered tools grouped by MCP server: built-ins first, then servers by name. Duplicates are dropped. */
export function groupTools(tools: readonly string[]): ToolGroup[] {
  const groups = new Map<string | null, Set<string>>()
  for (const name of tools) {
    if (typeof name !== 'string' || !name) continue
    const mcp = parseMcpTool(name)
    const server = mcp ? mcp.server : null
    const tool = mcp ? mcp.tool : name
    if (!groups.has(server)) groups.set(server, new Set())
    groups.get(server)!.add(tool)
  }
  return [...groups]
    .map(([server, set]) => ({ server, tools: [...set].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => (a.server === null ? -1 : b.server === null ? 1 : a.server.localeCompare(b.server)))
}

function globToRegExp(glob: string): RegExp {
  const body = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${body}$`)
}

/** `Bash(git *)` → `Bash`; `Read` → `Read`; `mcp__x__*` → `mcp__x__*`. */
export function patternToolName(pattern: string): string {
  const open = pattern.indexOf('(')
  return (open > 0 ? pattern.slice(0, open) : pattern).trim()
}

/** Offered tools an allow pattern designates. */
export function patternMatches(pattern: string, offered: readonly string[]): string[] {
  const name = patternToolName(pattern)
  if (!name) return []
  const re = globToRegExp(name)
  if (name.startsWith(MCP_PREFIX)) return offered.filter((tool) => re.test(tool))
  // A bare name: the built-in of that name, or the canonical tool of the nexus server.
  return offered.filter((tool) => {
    if (re.test(tool) && !tool.startsWith(MCP_PREFIX)) return true
    const mcp = parseMcpTool(tool)
    return mcp !== null && mcp.server === CANONICAL_TOOL_SERVER && re.test(mcp.tool)
  })
}

export interface PatternAvailability {
  pattern: string
  /** Offered tools it designates; empty = not available in this session. */
  matches: string[]
}

/** Each allow pattern with the offered tools it designates (duplicates dropped, order kept). */
export function allowAvailability(allow: readonly string[], offered: readonly string[]): PatternAvailability[] {
  const seen = new Set<string>()
  const out: PatternAvailability[] = []
  for (const pattern of allow) {
    if (typeof pattern !== 'string' || !pattern || seen.has(pattern)) continue
    seen.add(pattern)
    out.push({ pattern, matches: patternMatches(pattern, offered) })
  }
  return out
}
