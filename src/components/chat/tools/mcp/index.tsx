/**
 * MCP Sub-Renderer Registry
 *
 * Routes MCP tool actions to specialized renderers by category.
 * Falls back to the generic McpGenericRenderer for unrecognized actions.
 */

/* eslint-disable react-refresh/only-export-components */

export { ListRenderer } from './ListRenderer'
export { EntityRenderer } from './EntityRenderer'
export { ChatRenderer } from './ChatRenderer'
export { CodeRenderer } from './CodeRenderer'
export { ProgressRenderer } from './ProgressRenderer'

// Re-export utilities for external use
export { parseResult, ErrorDisplay } from './utils'

// ---------------------------------------------------------------------------
// Mega-tool (short action) → legacy action name resolution
// ---------------------------------------------------------------------------
// The MCP backend exposes 18 mega-tools (project, plan, task, code, etc.)
// with a short `action` parameter (list, create, get, search, etc.).
// The frontend renderers expect legacy action names (list_projects, create_plan).
// This map mirrors the backend's mega_tool_to_legacy() in handlers.rs.

const MEGA_TOOL_MAP: Record<string, Record<string, string>> = {
  project: {
    list: 'list_projects', create: 'create_project', get: 'get_project',
    update: 'update_project', delete: 'delete_project', sync: 'sync_project',
    get_roadmap: 'get_project_roadmap', list_plans: 'list_project_plans',
  },
  plan: {
    list: 'list_plans', create: 'create_plan', get: 'get_plan',
    update_status: 'update_plan_status', delete: 'delete_plan',
    link_to_project: 'link_plan_to_project', unlink_from_project: 'unlink_plan_from_project',
    get_dependency_graph: 'get_dependency_graph', get_critical_path: 'get_critical_path',
  },
  task: {
    list: 'list_tasks', create: 'create_task', get: 'get_task',
    update: 'update_task', delete: 'delete_task', get_next: 'get_next_task',
    add_dependencies: 'add_task_dependencies', remove_dependency: 'remove_task_dependency',
    get_blockers: 'get_task_blockers', get_blocked_by: 'get_tasks_blocked_by',
    get_context: 'get_task_context', get_prompt: 'get_task_prompt',
  },
  step: {
    list: 'list_steps', create: 'create_step', update: 'update_step',
    get: 'get_step', delete: 'delete_step', get_progress: 'get_step_progress',
  },
  decision: {
    add: 'add_decision', get: 'get_decision', update: 'update_decision',
    delete: 'delete_decision', search: 'search_decisions',
  },
  constraint: {
    list: 'list_constraints', add: 'add_constraint', get: 'get_constraint',
    update: 'update_constraint', delete: 'delete_constraint',
  },
  release: {
    list: 'list_releases', create: 'create_release', get: 'get_release',
    update: 'update_release', delete: 'delete_release',
    add_task: 'add_task_to_release', add_commit: 'add_commit_to_release',
    remove_commit: 'remove_commit_from_release',
  },
  milestone: {
    list: 'list_milestones', create: 'create_milestone', get: 'get_milestone',
    update: 'update_milestone', delete: 'delete_milestone',
    get_progress: 'get_milestone_progress', add_task: 'add_task_to_milestone',
    link_plan: 'link_plan_to_milestone', unlink_plan: 'unlink_plan_from_milestone',
  },
  commit: {
    create: 'create_commit', link_to_task: 'link_commit_to_task',
    link_to_plan: 'link_commit_to_plan',
    get_task_commits: 'get_task_commits', get_plan_commits: 'get_plan_commits',
  },
  note: {
    list: 'list_notes', create: 'create_note', get: 'get_note',
    update: 'update_note', delete: 'delete_note',
    search: 'search_notes', search_semantic: 'search_notes_semantic',
    confirm: 'confirm_note', invalidate: 'invalidate_note', supersede: 'supersede_note',
    link_to_entity: 'link_note_to_entity', unlink_from_entity: 'unlink_note_from_entity',
    get_context: 'get_context_notes', get_needing_review: 'get_notes_needing_review',
    list_project: 'list_project_notes', get_propagated: 'get_propagated_notes',
    get_entity: 'get_entity_notes',
  },
  workspace: {
    list: 'list_workspaces', create: 'create_workspace', get: 'get_workspace',
    update: 'update_workspace', delete: 'delete_workspace',
    get_overview: 'get_workspace_overview', list_projects: 'list_workspace_projects',
    add_project: 'add_project_to_workspace', remove_project: 'remove_project_from_workspace',
    get_topology: 'get_workspace_topology',
  },
  workspace_milestone: {
    list_all: 'list_all_workspace_milestones', list: 'list_workspace_milestones',
    create: 'create_workspace_milestone', get: 'get_workspace_milestone',
    update: 'update_workspace_milestone', delete: 'delete_workspace_milestone',
    add_task: 'add_task_to_workspace_milestone',
    link_plan: 'link_plan_to_workspace_milestone',
    unlink_plan: 'unlink_plan_from_workspace_milestone',
    get_progress: 'get_workspace_milestone_progress',
  },
  resource: {
    list: 'list_resources', create: 'create_resource', get: 'get_resource',
    update: 'update_resource', delete: 'delete_resource',
    link_to_project: 'link_resource_to_project',
  },
  component: {
    list: 'list_components', create: 'create_component', get: 'get_component',
    update: 'update_component', delete: 'delete_component',
    add_dependency: 'add_component_dependency', remove_dependency: 'remove_component_dependency',
    map_to_project: 'map_component_to_project',
  },
  chat: {
    list_sessions: 'list_chat_sessions', get_session: 'get_chat_session',
    delete_session: 'delete_chat_session', send_message: 'chat_send_message',
    list_messages: 'list_chat_messages',
  },
  feature_graph: {
    create: 'create_feature_graph', get: 'get_feature_graph',
    list: 'list_feature_graphs', add_entity: 'add_to_feature_graph',
    auto_build: 'auto_build_feature_graph', delete: 'delete_feature_graph',
  },
  code: {
    search: 'search_code', search_project: 'search_project_code',
    search_workspace: 'search_workspace_code',
    get_file_symbols: 'get_file_symbols', find_references: 'find_references',
    get_file_dependencies: 'get_file_dependencies', get_call_graph: 'get_call_graph',
    analyze_impact: 'analyze_impact', get_architecture: 'get_architecture',
    find_similar: 'find_similar_code',
    find_trait_implementations: 'find_trait_implementations',
    find_type_traits: 'find_type_traits', get_impl_blocks: 'get_impl_blocks',
    get_communities: 'get_code_communities', get_health: 'get_code_health',
    get_node_importance: 'get_node_importance', plan_implementation: 'plan_implementation',
  },
  admin: {
    sync_directory: 'sync_directory', start_watch: 'start_watch',
    stop_watch: 'stop_watch', watch_status: 'watch_status',
    meilisearch_stats: 'get_meilisearch_stats',
    delete_meilisearch_orphans: 'delete_meilisearch_orphans',
    cleanup_cross_project_calls: 'cleanup_cross_project_calls',
    cleanup_sync_data: 'cleanup_sync_data',
    update_staleness_scores: 'update_staleness_scores',
    update_energy_scores: 'update_energy_scores',
    search_neurons: 'search_neurons', reinforce_neurons: 'reinforce_neurons',
    decay_synapses: 'decay_synapses', backfill_synapses: 'backfill_synapses',
  },
}

/**
 * Resolve a mega-tool (megaTool, shortAction) pair to a legacy action name.
 *
 * Examples:
 *   resolveMegaToolAction("project", "list") → "list_projects"
 *   resolveMegaToolAction("code", "get_file_symbols") → "get_file_symbols"
 *   resolveMegaToolAction("unknown", "foo") → null
 */
export function resolveMegaToolAction(megaTool: string, shortAction: string): string | null {
  return MEGA_TOOL_MAP[megaTool]?.[shortAction] ?? null
}

/**
 * Resolve the effective legacy action name from a tool call.
 *
 * Handles three cases:
 * 1. Direct MCP tool: toolName = "mcp__project-orchestrator__list_projects" → "list_projects"
 * 2. Mega-tool with compound action: toolName = "…__code", action = "get_file_symbols" → "get_file_symbols"
 * 3. Mega-tool with short action: toolName = "…__project", action = "list" → "list_projects"
 */
export function resolveAction(rawAction: string, subAction: string | undefined): string {
  // If no sub-action, use the raw action directly (case 1: direct MCP tool or legacy name)
  if (!subAction) return rawAction

  // Try the sub-action directly (case 2: compound action like "get_file_symbols")
  if (classifyAction(subAction) !== 'unknown') return subAction

  // Try mega-tool resolution (case 3: short action like "list")
  const resolved = resolveMegaToolAction(rawAction, subAction)
  if (resolved) return resolved

  // Fallback: use sub-action as-is
  return subAction
}

// ---------------------------------------------------------------------------
// Action → category classification
// ---------------------------------------------------------------------------

const LIST_ACTIONS = new Set([
  'list_projects', 'list_plans', 'list_project_plans', 'list_tasks',
  'list_chat_sessions', 'list_chat_messages', 'list_notes', 'list_project_notes',
  'list_steps', 'list_milestones', 'list_workspace_milestones',
  'list_all_workspace_milestones', 'list_releases', 'list_constraints',
  'list_workspaces', 'list_workspace_projects', 'list_resources',
  'list_components', 'list_feature_graphs',
  'search_decisions', 'search_notes', 'search_notes_semantic', 'search_neurons',
  'get_notes_needing_review', 'get_entity_notes', 'get_propagated_notes',
  'get_context_notes',
])

const CHAT_ACTIONS = new Set([
  'chat_send_message', 'get_chat_session',
])

const CODE_ACTIONS = new Set([
  'search_code', 'search_project_code', 'search_workspace_code',
  'find_similar_code', 'get_file_symbols', 'find_references',
  'get_call_graph', 'analyze_impact', 'get_architecture',
  'find_trait_implementations', 'find_type_traits', 'get_impl_blocks',
  'get_file_dependencies',
  'get_code_communities', 'get_code_health', 'get_node_importance',
  'plan_implementation',
])

const PROGRESS_ACTIONS = new Set([
  'get_step_progress', 'get_milestone_progress',
  'get_workspace_milestone_progress', 'get_dependency_graph',
  'get_critical_path', 'get_task_blockers', 'get_tasks_blocked_by',
  'get_task_context', 'get_task_prompt', 'get_project_roadmap',
  'get_next_task',
])

const ENTITY_ACTIONS = new Set([
  'get_plan', 'get_task', 'get_project', 'get_note',
  'get_milestone', 'get_workspace_milestone', 'get_release',
  'get_step', 'get_constraint', 'get_decision', 'get_workspace',
  'get_component', 'get_resource', 'get_workspace_overview',
  'get_workspace_topology',
  // Create/update/delete/link operations
  'create_plan', 'create_task', 'create_step', 'create_project',
  'create_note', 'create_milestone', 'create_release', 'create_commit',
  'create_workspace', 'create_workspace_milestone', 'create_component',
  'create_resource', 'create_feature_graph',
  'update_plan_status', 'update_task', 'update_step', 'update_note',
  'update_milestone', 'update_release', 'update_project', 'update_decision',
  'update_constraint', 'update_workspace', 'update_workspace_milestone',
  'update_component', 'update_resource',
  'delete_plan', 'delete_task', 'delete_step', 'delete_note',
  'delete_milestone', 'delete_release', 'delete_project', 'delete_decision',
  'delete_constraint', 'delete_workspace', 'delete_workspace_milestone',
  'delete_component', 'delete_resource', 'delete_chat_session',
  'delete_feature_graph',
  'link_plan_to_project', 'unlink_plan_from_project',
  'link_commit_to_task', 'link_commit_to_plan',
  'link_note_to_entity', 'unlink_note_from_entity',
  'link_resource_to_project',
  'add_task_dependencies', 'remove_task_dependency',
  'add_task_to_milestone', 'add_task_to_release',
  'add_task_to_workspace_milestone',
  'add_decision', 'add_constraint',
  'add_project_to_workspace', 'remove_project_from_workspace',
  'add_component_dependency', 'remove_component_dependency',
  'map_component_to_project', 'add_commit_to_release',
  'remove_commit_from_release',
  'confirm_note', 'invalidate_note', 'supersede_note',
  'sync_project', 'sync_directory', 'start_watch', 'stop_watch',
  'watch_status', 'get_meilisearch_stats', 'delete_meilisearch_orphans',
  'update_staleness_scores', 'update_energy_scores',
  'get_plan_commits', 'get_task_commits',
  'link_plan_to_milestone', 'unlink_plan_from_milestone',
  'link_plan_to_workspace_milestone', 'unlink_plan_from_workspace_milestone',
  'get_feature_graph', 'add_to_feature_graph', 'auto_build_feature_graph',
  'reinforce_neurons', 'decay_synapses', 'backfill_synapses',
  'cleanup_sync_data', 'cleanup_cross_project_calls',
])

/**
 * Classify an MCP action into a renderer category.
 */
export type McpCategory = 'list' | 'chat' | 'code' | 'progress' | 'entity' | 'unknown'

export function classifyAction(action: string): McpCategory {
  if (LIST_ACTIONS.has(action)) return 'list'
  if (CHAT_ACTIONS.has(action)) return 'chat'
  if (CODE_ACTIONS.has(action)) return 'code'
  if (PROGRESS_ACTIONS.has(action)) return 'progress'
  if (ENTITY_ACTIONS.has(action)) return 'entity'
  // Heuristic fallbacks
  if (action.startsWith('list_')) return 'list'
  if (action.startsWith('search_')) return 'list'
  if (action.startsWith('get_') && action.endsWith('_progress')) return 'progress'
  if (action.startsWith('create_') || action.startsWith('update_') || action.startsWith('delete_') ||
      action.startsWith('link_') || action.startsWith('unlink_') ||
      action.startsWith('add_') || action.startsWith('remove_')) return 'entity'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Data-driven inference — fallback when action classification fails
// ---------------------------------------------------------------------------

/**
 * Infer the renderer category and a synthetic action name from parsed data shape.
 * Used as a last-resort fallback when both direct and mega-tool action resolution fail.
 */
export function inferFromData(parsed: unknown): { category: McpCategory; action: string } | null {
  if (!parsed || typeof parsed !== 'object') return null

  // Direct array → list
  if (Array.isArray(parsed)) {
    return { category: 'list', action: 'list_items' }
  }

  const obj = parsed as Record<string, unknown>

  // --- List detection ---
  if (Array.isArray(obj.items)) return { category: 'list', action: inferListActionFromData(obj) }
  if (Array.isArray(obj.messages)) return { category: 'list', action: 'list_chat_messages' }
  // Named collection keys
  const collectionKey = findArrayKey(obj, [
    'projects', 'plans', 'tasks', 'steps', 'notes', 'decisions', 'hits',
    'constraints', 'milestones', 'releases', 'components', 'resources',
    'sessions', 'workspaces', 'feature_graphs', 'neurons',
  ])
  if (collectionKey) return { category: 'list', action: `list_${collectionKey}` }
  // Generic list indicators
  if (('has_more' in obj || 'total' in obj || 'count' in obj) && findFirstArray(obj)) {
    return { category: 'list', action: 'list_items' }
  }

  // --- Code detection ---
  if (hasAnyKey(obj, ['functions', 'structs', 'traits', 'enums', 'impls', 'macros'])) {
    return { category: 'code', action: 'get_file_symbols' }
  }
  if (hasAnyKey(obj, ['callers', 'callees', 'called_by', 'calls'])) {
    return { category: 'code', action: 'get_call_graph' }
  }
  if (Array.isArray(obj.references)) return { category: 'code', action: 'find_references' }
  if ('impact_level' in obj || Array.isArray(obj.dependent_files)) {
    return { category: 'code', action: 'analyze_impact' }
  }
  if (hasAnyKey(obj, ['top_files', 'languages'])) return { category: 'code', action: 'get_architecture' }
  if (hasAnyKey(obj, ['imports', 'dependents', 'imported_by'])) {
    return { category: 'code', action: 'get_file_dependencies' }
  }

  // --- Progress detection ---
  if ('completed' in obj && 'total' in obj && Array.isArray(obj.steps)) {
    return { category: 'progress', action: 'get_step_progress' }
  }
  if (hasAnyKey(obj, ['nodes', 'edges'])) return { category: 'progress', action: 'get_dependency_graph' }
  if (hasAnyKey(obj, ['critical_path'])) return { category: 'progress', action: 'get_critical_path' }
  if (hasAnyKey(obj, ['blockers', 'blocked'])) return { category: 'progress', action: 'get_task_blockers' }
  if (Array.isArray(obj.milestones) && Array.isArray(obj.releases)) {
    return { category: 'progress', action: 'get_project_roadmap' }
  }

  // --- Entity detection: nested structures (no flatten) ---
  // PlanDetails: { plan: PlanNode, tasks: [TaskDetails], constraints: [...] }
  if (obj.plan && typeof obj.plan === 'object' && Array.isArray(obj.tasks)) {
    return { category: 'entity', action: 'get_plan' }
  }
  // TaskDetails: { task: TaskNode, steps: [...], decisions: [...] }
  if (obj.task && typeof obj.task === 'object' && Array.isArray(obj.steps)) {
    return { category: 'entity', action: 'get_task' }
  }

  // --- Entity detection (single object with id) ---
  if (obj.id) {
    if (Array.isArray(obj.tasks) && Array.isArray(obj.constraints)) return { category: 'entity', action: 'get_plan' }
    if (Array.isArray(obj.steps) && obj.plan_id) return { category: 'entity', action: 'get_task' }
    if (obj.slug && obj.root_path) return { category: 'entity', action: 'get_project' }
    if (obj.note_type || ('content' in obj && 'importance' in obj)) return { category: 'entity', action: 'get_note' }
    if (obj.version) return { category: 'entity', action: 'get_release' }
    if (obj.target_date && obj.title) return { category: 'entity', action: 'get_milestone' }
    return { category: 'entity', action: 'get_entity' }
  }

  // CRUD confirmations
  if (obj.updated === true || obj.deleted === true || obj.added === true ||
      obj.created === true || obj.linked === true) {
    return { category: 'entity', action: 'update_entity' }
  }

  return null
}

/** Find the first matching key that has an array value */
function findArrayKey(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) return key
  }
  return null
}

/** Check if any of the keys exist in the object */
function hasAnyKey(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(k => k in obj)
}

/** Find any array field in the object */
function findFirstArray(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(v => Array.isArray(v) && v.length > 0)
}

/** Infer a list action from the shape of items in the data */
function inferListActionFromData(obj: Record<string, unknown>): string {
  const items = obj.items as Record<string, unknown>[]
  if (items.length === 0) return 'list_items'
  const first = items[0]
  if (first.slug && first.root_path) return 'list_projects'
  if (first.plan_id && first.steps) return 'list_tasks'
  if (first.tasks && first.constraints) return 'list_plans'
  if (first.note_type) return 'list_notes'
  if (first.version) return 'list_releases'
  if (first.target_date && first.title && !first.version) return 'list_milestones'
  if (first.constraint_type) return 'list_constraints'
  if (first.message_count || first.total_cost_usd) return 'list_chat_sessions'
  if (first.role && 'content' in first) return 'list_chat_messages'
  return 'list_items'
}
