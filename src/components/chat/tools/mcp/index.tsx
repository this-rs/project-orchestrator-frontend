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
// Action → category classification
// ---------------------------------------------------------------------------

const LIST_ACTIONS = new Set([
  'list_projects', 'list_plans', 'list_project_plans', 'list_tasks',
  'list_chat_sessions', 'list_chat_messages', 'list_notes', 'list_project_notes',
  'list_steps', 'list_milestones', 'list_workspace_milestones',
  'list_all_workspace_milestones', 'list_releases', 'list_constraints',
  'list_workspaces', 'list_workspace_projects', 'list_resources',
  'list_components', 'search_decisions', 'search_notes',
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
  'create_resource',
  'update_plan_status', 'update_task', 'update_step', 'update_note',
  'update_milestone', 'update_release', 'update_project', 'update_decision',
  'update_constraint', 'update_workspace', 'update_workspace_milestone',
  'update_component', 'update_resource',
  'delete_plan', 'delete_task', 'delete_step', 'delete_note',
  'delete_milestone', 'delete_release', 'delete_project', 'delete_decision',
  'delete_constraint', 'delete_workspace', 'delete_workspace_milestone',
  'delete_component', 'delete_resource', 'delete_chat_session',
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
  'confirm_note', 'invalidate_note', 'supersede_note',
  'sync_project', 'sync_directory', 'start_watch', 'stop_watch',
  'watch_status', 'get_meilisearch_stats', 'delete_meilisearch_orphans',
  'update_staleness_scores',
  'get_plan_commits', 'get_task_commits',
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
  if (action.startsWith('search_')) return 'code'
  if (action.startsWith('get_') && action.endsWith('_progress')) return 'progress'
  if (action.startsWith('create_') || action.startsWith('update_') || action.startsWith('delete_') ||
      action.startsWith('link_') || action.startsWith('add_') || action.startsWith('remove_')) return 'entity'
  return 'unknown'
}
