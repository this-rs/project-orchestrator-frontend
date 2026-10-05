/**
 * `system_init` frames shared by the tests of BOTH reducers (`useChat` live,
 * `historyEventsToMessages` for history): the same frame must give the same
 * provider runtime on both paths.
 *
 * PROVISIONAL — hand-written from CONSOLIDATION A4/A42 until the backend
 * publishes its sample frames (see `services/__fixtures__/chat-contract`).
 */

/** A session created before providers existed: no `provider`, no `capabilities`. */
export const LEGACY_SYSTEM_INIT = {
  type: 'system_init',
  cli_session_id: 'cli-legacy-1',
  model: 'claude-sonnet-4-5',
  tools: ['Bash', 'Read', 'Edit'],
  mcp_servers: [{ name: 'project-orchestrator', status: 'connected' }],
  permission_mode: 'default',
} as const

/** A native-harness session on a local OpenAI-compatible endpoint, restricted profile. */
export const NATIVE_SYSTEM_INIT = {
  type: 'system_init',
  model: 'qwen2.5-coder-32b',
  tools: ['mcp__project-orchestrator__note'],
  mcp_servers: [{ name: 'project-orchestrator', status: 'connected' }],
  permission_mode: 'default',
  provider: { id: 'local-llama', kind: 'openai_compatible', label: 'Local llama-server' },
  tool_policy: { mode: 'ask', allow: [], deny: ['mcp__project-orchestrator__plan'] },
  capabilities: {
    interactive_permissions: false,
    permission_scopes: [],
    sandbox: 'none',
    secret_isolation: true,
    per_session_mcp: true,
    hooks: 'None',
    subagents: 'None',
    compaction_signal: true,
    thinking: false,
    images: false,
    tools: true,
    context_window: { value: 32768, source: 'probed' },
    set_model_live: false,
    native_question: false,
    tool_cancel: false,
    background_tasks: false,
    resume: true,
    cost: 'Free',
  },
} as const
