/**
 * A synthetic question (the provider has no native "ask the user" tool, decision
 * A45) is answered by a USER TURN, never by a `tool_result`: its call returns the
 * provider's RECEIPT straight away (`QUESTION_ASKED` in nexus) and ends the turn.
 *
 * Reading that receipt as the answer is what made a question look already
 * answered in the transcript — with the receipt ("The question was shown to the
 * user…") printed as the user's own words — so nobody could answer it and the
 * agent waited for an answer that never left.
 *
 * The events below are the ones the backend really persists for such a turn
 * (measured on a native-harness session, seq 205→210 and 241→247).
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages } from './chatAssembly'
import type { ChatMessage } from '@/types'

/** nexus `builtin.rs::QUESTION_ASKED`, byte for byte: what the model reads back. */
const RECEIPT = 'The question was shown to the user. Their answer will arrive as the next user message: end your turn now and do not guess it.'
const QUESTIONS = [{ header: 'Atterrissage', multiSelect: false, question: 'PR #789 est verte. Je l’atterris ?', options: [{ label: 'Oui' }, { label: 'Non' }] }]

const ask = { type: 'tool_use', id: 'call_1', tool: 'AskUserQuestion', canonical: 'AskUserQuestion', category: 'other', input: { questions: QUESTIONS }, created_at: 1_790_000_001 }
const question = { type: 'ask_user_question', id: 'q_call_1', tool_call_id: 'call_1', questions: QUESTIONS, input: { questions: QUESTIONS }, synthetic: true, created_at: 1_790_000_001.001 }
const receipt = { type: 'tool_result', id: 'call_1', is_error: false, result: RECEIPT, created_at: 1_790_000_001.003 }
const timing = { type: 'tool_timing', id: 'call_1', called_at: 1_790_000_001, ended_at: 1_790_000_001.002, created_at: 1_790_000_001.003 }
const turnEnd = { type: 'result', id: 'r1', subtype: 'success', duration_ms: 12, created_at: 1_790_000_002 }
const go = { type: 'user_message', content: 'go', created_at: 1_790_000_000 }

const questionBlocks = (messages: ChatMessage[]) => messages.flatMap((m) => m.blocks).filter((b) => b.type === 'ask_user_question')

describe('historyEventsToMessages — a synthetic question and its answer', () => {
  it('is answered by the user turn that follows, never by the provider receipt', () => {
    const messages = historyEventsToMessages([
      go, ask, question, receipt, timing, turnEnd,
      { type: 'user_message', content: 'Oui, et enchaîne', created_at: 1_790_000_003 },
    ])
    const blocks = questionBlocks(messages)
    // The `tool_use` and its control event are ONE question, not two.
    expect(blocks).toHaveLength(1)
    expect(blocks[0].metadata?.synthetic).toBe(true)
    expect(blocks[0].metadata?.submitted).toBe(true)
    expect(blocks[0].metadata?.response).toBe('Oui, et enchaîne')
  })

  it('stays answerable while the user has not answered: the receipt is not an answer', () => {
    const messages = historyEventsToMessages([go, ask, question, receipt, timing, turnEnd])
    const [block] = questionBlocks(messages)
    expect(block).toBeDefined()
    expect(block.metadata?.submitted).toBeFalsy()
    expect(block.metadata?.response).toBeUndefined()
  })

  it('a NATIVE question keeps being answered by its tool_result (Claude Code, no user turn)', () => {
    // A provider WITH a native question: the event carries no `synthetic` flag.
    const nativeQuestion = { ...question, synthetic: undefined }
    const messages = historyEventsToMessages([go, ask, nativeQuestion, { ...receipt, result: 'Oui' }, turnEnd])
    const [block] = questionBlocks(messages)
    // `synthetic` absent = the provider waits on an `input_response`: the
    // `tool_result` IS the answer and history shows it read-only.
    expect(block.metadata?.submitted).toBe(true)
    expect(block.metadata?.response).toBe('Oui')
  })
})
