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

/** Short ID for summaries (first 8 chars) */
function shortId(id: unknown): string {
  const s = String(id ?? '')
  return s.length > 12 ? s.slice(0, 8) + '..' : s
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
  create_plan: (i) => `Plan ✚ ${truncate(String(i.title ?? ''), 40)}`,
  get_plan: (i) => i.plan_id ? `Plan ${shortId(i.plan_id)}` : 'Plan details',
  update_plan_status: (i) => `Plan → ${i.status ?? '?'}`,
  delete_plan: (i) => `Plan ✗ ${shortId(i.plan_id)}`,
  create_task: (i) => { const label = truncate(String(i.title ?? i.description ?? ''), 40); return i.priority ? `Task ✚ [P${i.priority}]: ${label}` : `Task ✚ ${label}` },
  get_task: (i) => i.task_id ? `Task ${shortId(i.task_id)}` : 'Task details',
  update_task: (i) => { const parts = ['Task']; if (i.status) parts.push('→ ' + i.status); if (i.task_id) parts.push(shortId(i.task_id)); return parts.join(' ') },
  delete_task: (i) => `Task ✗ ${shortId(i.task_id)}`,
  get_next_task: () => 'Next task',
  create_step: (i) => `Step ✚ ${truncate(String(i.description ?? ''), 40)}`,
  update_step: (i) => i.status ? `Step → ${i.status}` : 'Update step',
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
  link_commit_to_task: (i) => `Commit ${String(i.commit_sha ?? '').slice(0, 7)} → task`,
  link_commit_to_plan: (i) => `Commit ${String(i.commit_sha ?? '').slice(0, 7)} → plan`,
  create_project: (i) => `Project ✚ ${truncate(String(i.name ?? ''), 40)}`,
  get_project: (i) => `Project: ${i.slug ?? ''}`,
  update_project: (i) => `Project ↻ ${i.slug ?? ''}`,
  delete_project: (i) => `Project ✗ ${i.slug ?? ''}`,
  create_note: (i) => `Note ✚ ${truncate(String(i.content ?? ''), 40)}`,
  get_context_notes: (i) => `Context notes: ${i.entity_type ?? ''}`,
  create_milestone: (i) => `Milestone ✚ ${truncate(String(i.title ?? ''), 40)}`,
  update_milestone: (i) => { const parts = ['Milestone']; if (i.status) parts.push('→ ' + i.status); return parts.join(' ') },
  delete_milestone: (i) => `Milestone ✗ ${shortId(i.milestone_id)}`,
  create_release: (i) => `Release ✚ ${i.version ?? ''}`,
  update_release: (i) => { const parts = ['Release']; if (i.status) parts.push('→ ' + i.status); return parts.join(' ') },
  delete_release: (i) => `Release ✗ ${shortId(i.release_id)}`,
  get_dependency_graph: () => 'Dependency graph',
  get_critical_path: () => 'Critical path',
  get_task_context: () => 'Task context',
  get_task_prompt: () => 'Task prompt',
  add_task_dependencies: (i) => { const deps = i.dependency_ids; return `Add ${Array.isArray(deps) ? deps.length : ''} dep(s)` },
  list_tasks: (i) => i.status ? `Tasks (${i.status})` : 'List tasks',
  list_plans: (i) => i.status ? `Plans (${i.status})` : 'List plans',
  list_project_plans: (i) => `Plans: ${i.project_slug ?? ''}`,
  list_projects: () => 'List projects',
  list_chat_sessions: () => 'Chat sessions',
  list_chat_messages: () => 'Chat messages',
  list_notes: (i) => i.note_type ? `Notes (${i.note_type})` : 'List notes',
  list_project_notes: () => 'Project notes',
  list_milestones: () => 'List milestones',
  list_releases: () => 'List releases',
  list_constraints: () => 'List constraints',
  list_workspaces: () => 'List workspaces',
  list_workspace_projects: () => 'Workspace projects',
  list_workspace_milestones: () => 'Workspace milestones',
  list_resources: () => 'List resources',
  list_components: () => 'List components',
  get_task_blockers: () => 'Task blockers',
  get_tasks_blocked_by: () => 'Blocked tasks',
  link_plan_to_project: (i) => `Plan ${shortId(i.plan_id)} → project`,
  unlink_plan_from_project: (i) => `Unlink plan ${shortId(i.plan_id)}`,
  add_constraint: (i) => `Constraint ✚ (${i.severity ?? i.constraint_type ?? ''}): ${truncate(String(i.description ?? ''), 30)}`,
  // Chat
  chat_send_message: (i) => `Chat: ${truncate(String(i.message ?? ''), 50)}`,
  get_chat_session: () => 'Session details',
  delete_chat_session: () => 'Delete session',
  // Workspace
  create_workspace: (i) => `Workspace: ${truncate(String(i.name ?? ''), 40)}`,
  get_workspace: (i) => `Workspace: ${i.slug ?? ''}`,
  get_workspace_overview: (i) => `Overview: ${i.slug ?? ''}`,
  get_workspace_topology: (i) => `Topology: ${i.slug ?? ''}`,
  // Milestones & releases
  get_milestone: () => 'Milestone details',
  get_milestone_progress: () => 'Milestone progress',
  get_workspace_milestone: () => 'WS milestone',
  get_workspace_milestone_progress: () => 'WS milestone progress',
  get_release: () => 'Release details',
  get_project_roadmap: () => 'Project roadmap',
  // Notes
  get_note: (i) => i.note_id ? `Note ${shortId(i.note_id)}` : 'Note details',
  update_note: (i) => `Note ↻ ${shortId(i.note_id)}`,
  delete_note: (i) => `Note ✗ ${shortId(i.note_id)}`,
  confirm_note: (i) => `Note ✓ ${shortId(i.note_id)}`,
  invalidate_note: (i) => `Note ✗ ${shortId(i.note_id)}`,
  supersede_note: (i) => `Note ↻ ${shortId(i.old_note_id)}`,
  get_notes_needing_review: () => 'Notes for review',
  update_staleness_scores: () => 'Update staleness',
  // Steps & decisions
  get_step: () => 'Step details',
  delete_step: () => 'Delete step',
  get_decision: () => 'Decision details',
  update_decision: () => 'Update decision',
  delete_decision: () => 'Delete decision',
  // Sync & infra
  start_watch: (i) => `Watch: ${truncate(String(i.path ?? ''), 40)}`,
  stop_watch: () => 'Stop watcher',
  watch_status: () => 'Watch status',
  get_meilisearch_stats: () => 'Search stats',
  delete_meilisearch_orphans: () => 'Clean orphans',
  // Code exploration
  get_file_dependencies: (i) => `Deps: ${basename(String(i.file_path ?? ''))}`,
  find_similar_code: () => 'Similar code',
  find_trait_implementations: (i) => `Impl: ${truncate(String(i.trait_name ?? ''), 30)}`,
  find_type_traits: (i) => `Traits: ${truncate(String(i.type_name ?? ''), 30)}`,
  get_impl_blocks: (i) => `Impl blocks: ${truncate(String(i.type_name ?? ''), 30)}`,
  search_workspace_code: (i) => `WS search: ${truncate(String(i.query ?? ''), 35)}`,
  // Components & resources
  create_component: (i) => `Component: ${truncate(String(i.name ?? ''), 40)}`,
  create_resource: (i) => `Resource: ${truncate(String(i.name ?? ''), 40)}`,
  add_component_dependency: () => 'Component dep',
  map_component_to_project: () => 'Map component → project',
  // Task & entity links
  add_task_to_milestone: (i) => `Task ${shortId(i.task_id)} → milestone`,
  add_task_to_release: (i) => `Task ${shortId(i.task_id)} → release`,
  add_task_to_workspace_milestone: (i) => `Task ${shortId(i.task_id)} → WS milestone`,
  link_note_to_entity: (i) => `Note ${shortId(i.note_id)} → ${i.entity_type ?? 'entity'}`,
  unlink_note_from_entity: (i) => `Unlink note ${shortId(i.note_id)}`,
  link_resource_to_project: (i) => `Resource → project ${shortId(i.project_id)}`,
  add_project_to_workspace: (i) => `Project ${shortId(i.project_id)} → workspace`,
  remove_project_from_workspace: (i) => `Remove project ${shortId(i.project_id)}`,
  add_commit_to_release: (i) => `Commit ${String(i.commit_sha ?? '').slice(0, 7)} → release`,
  remove_task_dependency: (i) => `Remove dep ${shortId(i.dependency_id)}`,
  remove_component_dependency: () => 'Remove component dep',
  get_plan_commits: () => 'Plan commits',
  get_task_commits: () => 'Task commits',
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
