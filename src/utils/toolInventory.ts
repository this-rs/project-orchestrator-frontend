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
// session, whose tools carry no `mcp__` prefix. Like nexus, the glob is also
// matched against the full offered name, so a bare `*` designates every tool.
//
// An EMPTY or absent `tools` is not "no tool": the Codex and ACP adapters do not
// know their list and report none. Nothing is claimed then.

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

/**
 * Group of the MCP tools whose name nexus cut to 64 characters inside the server
 * name: the server can no longer be read, but the tool is still an MCP tool.
 * Never a real server name: nexus keeps only `[A-Za-z0-9_-]` in those.
 */
export const SHORTENED_SERVER = '…'

export interface ToolGroup {
  /**
   * MCP server name; `null` = built-in tools (no `mcp__` prefix);
   * {@link SHORTENED_SERVER} = MCP tools whose name was cut before the server ended.
   */
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
    // `mcp__…` with no readable server: a name cut to 64 characters (hash suffix). Still MCP.
    const shortened = !mcp && name.startsWith(MCP_PREFIX)
    const server = mcp ? mcp.server : shortened ? SHORTENED_SERVER : null
    const tool = mcp ? mcp.tool : name
    if (!groups.has(server)) groups.set(server, new Set())
    groups.get(server)!.add(tool)
  }
  return [...groups]
    .map(([server, set]) => ({ server, tools: [...set].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => groupRank(a.server) - groupRank(b.server) || (a.server ?? '').localeCompare(b.server ?? ''))
}

/** Built-ins first, named servers next, shortened names last. */
function groupRank(server: string | null): number {
  return server === null ? 0 : server === SHORTENED_SERVER ? 2 : 1
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
  // As nexus does (`ToolEntry::names`): the glob is matched against the offered name
  // (a built-in `Bash`, or any `mcp__…`, so `*` matches everything), then, for a tool of
  // the nexus server, against its canonical name (`Read` → `mcp__nexus__Read`).
  return offered.filter((tool) => {
    if (re.test(tool)) return true
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
