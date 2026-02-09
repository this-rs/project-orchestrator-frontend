/**
 * Summary functions for tool call headers.
 *
 * Each function takes the raw toolInput and returns a short human-readable
 * summary for the collapsed header in ToolCallBlock.
 *
 * Separated from renderer components to avoid fast-refresh warnings
 * (files exporting React components should only export components).
 */

/** Truncate a string to maxLen characters, adding ellipsis if needed */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

/**
 * Bash: show the description if available, otherwise the truncated command.
 */
export function getBashSummary(toolInput: Record<string, unknown>): string {
  const description = (toolInput.description as string) ?? ''
  const command = (toolInput.command as string) ?? ''
  if (description) return description
  return truncate(command, 60)
}

/** Extract the basename from a file path */
function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * Edit: show the basename of the file, with "(replace all)" suffix if applicable.
 */
export function getEditSummary(toolInput: Record<string, unknown>): string {
  const filePath = (toolInput.file_path as string) ?? ''
  const replaceAll = (toolInput.replace_all as boolean) ?? false
  const name = basename(filePath) || 'file'
  return replaceAll ? `${name} (replace all)` : name
}

/**
 * Read: show the basename + line range if offset/limit provided.
 */
export function getReadSummary(toolInput: Record<string, unknown>): string {
  const filePath = (toolInput.file_path as string) ?? ''
  const offset = toolInput.offset as number | undefined
  const limit = toolInput.limit as number | undefined
  const name = basename(filePath) || 'file'

  if (offset != null && limit != null) return `${name}:${offset}-${offset + limit}`
  if (offset != null) return `${name}:${offset}+`
  if (limit != null) return `${name}:1-${limit}`
  return name
}

/**
 * Write: show the basename of the file.
 */
export function getWriteSummary(toolInput: Record<string, unknown>): string {
  const filePath = (toolInput.file_path as string) ?? ''
  return basename(filePath) || 'file'
}

/**
 * Glob: show the glob pattern.
 */
export function getGlobSummary(toolInput: Record<string, unknown>): string {
  const pattern = (toolInput.pattern as string) ?? ''
  return truncate(pattern, 50) || 'glob'
}

/**
 * Grep: show the regex pattern + output mode.
 */
export function getGrepSummary(toolInput: Record<string, unknown>): string {
  const pattern = (toolInput.pattern as string) ?? ''
  const mode = (toolInput.output_mode as string) ?? ''
  const label = truncate(pattern, 40) || 'grep'
  return mode && mode !== 'files_with_matches' ? `${label} (${mode})` : label
}

/**
 * WebFetch: show the hostname from the URL.
 */
export function getWebFetchSummary(toolInput: Record<string, unknown>): string {
  const url = (toolInput.url as string) ?? ''
  try {
    const parsed = new URL(url)
    return truncate(parsed.hostname + parsed.pathname, 50)
  } catch {
    return truncate(url, 50) || 'fetch'
  }
}

/**
 * WebSearch: show the search query.
 */
export function getWebSearchSummary(toolInput: Record<string, unknown>): string {
  const query = (toolInput.query as string) ?? ''
  return truncate(query, 50) || 'search'
}

// ---------------------------------------------------------------------------
// MCP tool summaries — contextual summaries for project-orchestrator tools
// ---------------------------------------------------------------------------

const MCP_PREFIX = 'mcp__project-orchestrator__'

/** Mapping of MCP action name → function extracting a summary from input */
const MCP_SUMMARY_MAP: Record<string, (input: Record<string, unknown>) => string> = {
  create_plan: (i) => `Create plan: ${truncate(String(i.title ?? ''), 40)}`,
  get_plan: () => 'Get plan details',
  update_plan_status: (i) => `Update plan → ${i.status ?? '?'}`,
  delete_plan: () => 'Delete plan',
  create_task: (i) => `Create task: ${truncate(String(i.title ?? i.description ?? ''), 40)}`,
  get_task: () => 'Get task details',
  update_task: (i) => i.status ? `Update task → ${i.status}` : 'Update task',
  delete_task: () => 'Delete task',
  get_next_task: () => 'Get next task',
  create_step: (i) => `Add step: ${truncate(String(i.description ?? ''), 40)}`,
  update_step: (i) => i.status ? `Update step → ${i.status}` : 'Update step',
  list_steps: () => 'List steps',
  get_step_progress: () => 'Get step progress',
  add_decision: (i) => `Decision: ${truncate(String(i.description ?? ''), 40)}`,
  search_code: (i) => `Search code: ${truncate(String(i.query ?? ''), 40)}`,
  search_project_code: (i) => `Search: ${truncate(String(i.query ?? ''), 40)}`,
  search_notes: (i) => `Search notes: ${truncate(String(i.query ?? ''), 40)}`,
  search_decisions: (i) => `Search decisions: ${truncate(String(i.query ?? ''), 40)}`,
  get_architecture: () => 'Architecture overview',
  analyze_impact: (i) => `Impact: ${truncate(String(i.target ?? ''), 40)}`,
  find_references: (i) => `References: ${truncate(String(i.symbol ?? ''), 40)}`,
  get_file_symbols: (i) => `Symbols: ${basename(String(i.file_path ?? ''))}`,
  get_call_graph: (i) => `Call graph: ${truncate(String(i.function ?? ''), 40)}`,
  sync_project: (i) => `Sync project: ${i.slug ?? ''}`,
  sync_directory: (i) => `Sync: ${truncate(String(i.path ?? ''), 40)}`,
  create_commit: (i) => `Commit: ${truncate(String(i.message ?? ''), 40)}`,
  link_commit_to_task: () => 'Link commit → task',
  link_commit_to_plan: () => 'Link commit → plan',
  create_project: (i) => `Create project: ${truncate(String(i.name ?? ''), 40)}`,
  get_project: (i) => `Get project: ${i.slug ?? ''}`,
  create_note: (i) => `Note: ${truncate(String(i.content ?? ''), 40)}`,
  get_context_notes: (i) => `Context notes: ${i.entity_type ?? ''}`,
  create_milestone: (i) => `Milestone: ${truncate(String(i.title ?? ''), 40)}`,
  create_release: (i) => `Release: ${i.version ?? ''}`,
  get_dependency_graph: () => 'Dependency graph',
  get_critical_path: () => 'Critical path',
  get_task_context: () => 'Get task context',
  get_task_prompt: () => 'Get task prompt',
  add_task_dependencies: () => 'Add task dependencies',
  list_tasks: () => 'List tasks',
  list_plans: () => 'List plans',
  list_project_plans: () => 'List project plans',
  get_task_blockers: () => 'Get task blockers',
  link_plan_to_project: () => 'Link plan → project',
  add_constraint: (i) => `Constraint: ${truncate(String(i.description ?? ''), 40)}`,
}

/**
 * MCP tool: contextual summary based on action name + input params.
 */
export function getMcpSummary(toolName: string, toolInput: Record<string, unknown>): string {
  const action = toolName.startsWith(MCP_PREFIX)
    ? toolName.slice(MCP_PREFIX.length)
    : toolName
  const fn = MCP_SUMMARY_MAP[action]
  if (fn) return fn(toolInput)
  // Fallback: humanize the action name
  return action.replace(/_/g, ' ')
}
