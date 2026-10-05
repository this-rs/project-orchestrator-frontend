/**
 * Provider-aware events in the HISTORY reducer — on the same frames as the
 * live reducer (`hooks/__tests__/useChat.providerEvents.test.tsx`).
 *
 * Run with: npx vitest run src/utils/chatAssembly.providerEvents.test.ts
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages, isQuestionToolUse } from './chatAssembly'
import {
  ALIASED_QUESTION_TOOL_USE,
  CLAUDE_QUESTION_TOOL_USE,
  CLAUDE_RESULT,
  FREE_RESULT,
  NATIVE_QUESTION,
  PRICED_RESULT,
  SYNTHETIC_QUESTION,
  TYPED_SESSION_ERROR,
  UNKNOWN_COST_RESULT,
  UNTYPED_SESSION_ERROR,
} from './__fixtures__/providerEventFrames'

const blocks = (events: unknown[]) => historyEventsToMessages(events as never[]).flatMap((m) => m.blocks)

describe('historyEventsToMessages — session_error with a typed code', () => {
  it('keeps the code and the typed error on the error block', () => {
    const [error] = blocks([{ ...TYPED_SESSION_ERROR }]).filter((b) => b.type === 'error')
    expect(error.metadata?.code).toBe('auth_required')
    expect(error.metadata?.provider_error).toMatchObject({
      code: 'auth_required',
      message: 'Codex is not signed in',
      provider_id: 'codex',
      login_hint: 'codex login',
    })
    // The text is still there for the export and for a reader without the card.
    expect(error.content).toContain('Codex is not signed in')
  })

  it('leaves the death of a Claude CLI exactly as it was: no metadata', () => {
    const [error] = blocks([{ ...UNTYPED_SESSION_ERROR }]).filter((b) => b.type === 'error')
    expect(error.metadata).toBeUndefined()
    expect(error.content).toBe('The Claude CLI process exited unexpectedly (subprocess_died)')
  })
})

describe('historyEventsToMessages — questions to the user', () => {
  it('a synthetic question is a question block, marked synthetic', () => {
    const [q] = blocks([{ ...SYNTHETIC_QUESTION }])
    expect(q.type).toBe('ask_user_question')
    expect(q.metadata).toMatchObject({ tool_call_id: 'q-synth-1', synthetic: true })
    expect(q.metadata?.questions).toHaveLength(1)
  })

  it('a native question carries no synthetic flag (unchanged block)', () => {
    const [q] = blocks([{ ...NATIVE_QUESTION }])
    expect(q.metadata).toEqual({ tool_call_id: 'q-native-1', questions: NATIVE_QUESTION.questions })
  })

  it('the user turn that follows a synthetic question is its answer', () => {
    const messages = historyEventsToMessages([
      { ...SYNTHETIC_QUESTION },
      { type: 'user_message', content: 'Postgres' },
    ] as never[])
    const q = messages[0].blocks[0]
    expect(q.metadata).toMatchObject({ submitted: true, response: 'Postgres' })
    // The turn itself is still shown.
    expect(messages[1].role).toBe('user')
    expect(messages[1].blocks[0].content).toBe('Postgres')
  })

  it('a user turn does NOT answer a native question (its tool_result does)', () => {
    const messages = historyEventsToMessages([
      { ...NATIVE_QUESTION },
      { type: 'user_message', content: 'something else' },
    ] as never[])
    expect(messages[0].blocks[0].metadata?.submitted).toBeUndefined()
  })

  it("Claude's question tool on the stream still becomes a question block", () => {
    const [q] = blocks([{ ...CLAUDE_QUESTION_TOOL_USE }])
    expect(q.type).toBe('ask_user_question')
    expect(q.metadata?.tool_call_id).toBe('toolu_q1')
  })

  it("another provider's question tool is recognised by its canonical alias, not its name", () => {
    expect(isQuestionToolUse(ALIASED_QUESTION_TOOL_USE)).toBe(true)
    const [q] = blocks([{ ...ALIASED_QUESTION_TOOL_USE }])
    expect(q.type).toBe('ask_user_question')
  })

  it('an ordinary tool is not a question', () => {
    expect(isQuestionToolUse({ type: 'tool_use', tool: 'Bash', canonical: 'Bash' })).toBe(false)
  })
})

describe('historyEventsToMessages — cost of a turn', () => {
  const turn = (result: unknown) =>
    historyEventsToMessages([{ type: 'assistant_text', content: 'ok' }, result] as never[])[0]

  it('a Claude result keeps its reported cost, as before', () => {
    const msg = turn({ ...CLAUDE_RESULT })
    expect(msg.cost_usd).toBe(0.0123)
    expect(msg.cost_basis).toBe('reported')
    expect(msg.duration_ms).toBe(1200)
  })

  it('a free turn stores its basis and usage, and no dollar figure', () => {
    const msg = turn({ ...FREE_RESULT })
    expect(msg.cost_usd).toBeUndefined()
    expect(msg.cost_basis).toBe('free')
    expect(msg.usage).toEqual({ input_tokens: 1200, output_tokens: 300 })
  })

  it('`cost` wins over the bare `cost_usd`', () => {
    const msg = turn({ ...PRICED_RESULT })
    expect(msg.cost_usd).toBe(0.042)
    expect(msg.cost_basis).toBe('priced')
  })

  it('an unknown cost is stored as unknown, never as zero', () => {
    const msg = turn({ ...UNKNOWN_COST_RESULT })
    expect(msg.cost_usd).toBeUndefined()
    expect(msg.cost_basis).toBe('unknown')
  })
})
