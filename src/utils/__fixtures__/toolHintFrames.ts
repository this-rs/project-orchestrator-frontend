/**
 * Tool events shared by the tests of BOTH reducers (`useChat` live,
 * `historyEventsToMessages` for history): the same frame must put the same
 * provider hints on the block, whichever path built it.
 *
 * PROVISIONAL — hand-written (Codex `shell` shape from its public docs) until
 * the backend publishes sample frames of a non-Claude provider.
 */

/** A Codex `shell` call, stamped by its adapter. */
export const CODEX_SHELL_TOOL_USE = {
  type: 'tool_use',
  id: 'call_shell_1',
  tool: 'shell',
  input: { command: ['bash', '-lc', 'cargo test'], workdir: '/repo' },
  category: 'command',
  canonical: 'Bash',
} as const

export const CODEX_SHELL_PERMISSION_REQUEST = {
  type: 'permission_request',
  id: 'call_shell_1',
  tool: 'shell',
  input: { command: ['bash', '-lc', 'cargo test'], workdir: '/repo' },
  category: 'command',
  canonical: 'Bash',
} as const

/** A Claude Code call: no hint at all, as every event has been so far. */
export const CLAUDE_BASH_TOOL_USE = {
  type: 'tool_use',
  id: 'toolu_bash_1',
  tool: 'Bash',
  input: { command: 'cargo test', description: 'Run the tests' },
} as const

export const CLAUDE_BASH_PERMISSION_REQUEST = {
  type: 'permission_request',
  id: 'toolu_bash_1',
  tool: 'Bash',
  input: { command: 'cargo test', description: 'Run the tests' },
} as const
