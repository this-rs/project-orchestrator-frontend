/**
 * Provider-aware frames shared by the tests of BOTH reducers (`useChat` live,
 * `historyEventsToMessages` for history): the same frame must give the same
 * blocks on both paths.
 *
 * PROVISIONAL — hand-written from the nexus agent contract (§5 capabilities,
 * §7 errors: `code` = `kind`) until the backend publishes sample frames.
 */

/** A `session_error` carrying a typed provider error. */
export const TYPED_SESSION_ERROR = {
  type: 'session_error',
  reason: 'provider_error',
  message: 'Codex is not signed in',
  received_at: '2026-10-05T10:00:00Z',
  code: 'auth_required',
  provider_id: 'codex',
  login_hint: 'codex login',
  retryable: false,
} as const

/** The death of a Claude CLI: no `code`. Must keep the block it always had. */
export const UNTYPED_SESSION_ERROR = {
  type: 'session_error',
  reason: 'subprocess_died',
  message: 'The Claude CLI process exited unexpectedly',
  received_at: '2026-10-05T10:00:00Z',
} as const

/** A question the backend built for a provider with no native question tool. */
export const SYNTHETIC_QUESTION = {
  type: 'ask_user_question',
  tool_call_id: 'q-synth-1',
  synthetic: true,
  questions: [
    {
      question: 'Which database?',
      header: 'Database',
      multiSelect: false,
      options: [
        { label: 'Postgres', description: 'Relational' },
        { label: 'Neo4j', description: 'Graph' },
      ],
    },
  ],
} as const

/** The same question asked natively (Claude's control channel): no `synthetic`. */
export const NATIVE_QUESTION = {
  type: 'ask_user_question',
  tool_call_id: 'q-native-1',
  questions: SYNTHETIC_QUESTION.questions,
} as const

/** Claude's question tool seen on the stream, as a `tool_use`. */
export const CLAUDE_QUESTION_TOOL_USE = {
  type: 'tool_use',
  id: 'toolu_q1',
  tool: 'AskUserQuestion',
  input: { questions: SYNTHETIC_QUESTION.questions },
} as const

/** Another provider's question tool, named differently, with its canonical alias. */
export const ALIASED_QUESTION_TOOL_USE = {
  type: 'tool_use',
  id: 'call_q2',
  tool: 'request_user_input',
  canonical: 'AskUserQuestion',
  input: { questions: SYNTHETIC_QUESTION.questions },
} as const

/** A Claude turn result as it has always been: a bare reported `cost_usd`. */
export const CLAUDE_RESULT = {
  type: 'result',
  session_id: 'sess-1',
  duration_ms: 1200,
  cost_usd: 0.0123,
  subtype: 'success',
} as const

/** A local endpoint: nothing is charged, tokens are counted. */
export const FREE_RESULT = {
  type: 'result',
  session_id: 'sess-1',
  duration_ms: 900,
  subtype: 'success',
  cost: { usd: null, basis: 'free' },
  usage: { input_tokens: 1200, output_tokens: 300 },
  model: 'qwen2.5-coder-32b',
} as const

/** A priced estimate that disagrees with the legacy field: `cost` wins. */
export const PRICED_RESULT = {
  type: 'result',
  session_id: 'sess-1',
  duration_ms: 900,
  subtype: 'success',
  cost_usd: 9.99,
  cost: { usd: 0.042, basis: 'priced' },
  usage: { input_tokens: 5000, output_tokens: 800 },
} as const

/** No price known at all: must never surface as "$0". */
export const UNKNOWN_COST_RESULT = {
  type: 'result',
  session_id: 'sess-1',
  duration_ms: 900,
  subtype: 'success',
  cost_usd: null,
  cost: { usd: null, basis: 'unknown' },
} as const
