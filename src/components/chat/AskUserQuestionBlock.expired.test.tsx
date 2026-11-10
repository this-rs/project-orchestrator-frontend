/**
 * A question card is answerable only while the SERVER says a person is being
 * waited on for that very question: `activity.state === 'waiting_on_person'`
 * AND `state_reason.rule === 'question_open'`.
 *
 * Every other answer — the turn ended, the tool was interrupted, the session is
 * dead, the activity was never read, the read failed — makes the card an
 * EXPIRED card: explicit text, options shown but disabled, no submit button.
 * Fail-closed on purpose: a wrong "open" sends the answer to a dead tool and
 * the conversation looks broken (session cadfa92b, question "Disque" asked at
 * 13:37:53Z, interrupted, tool_call_id never closed); a wrong "expired" costs
 * one normal message.
 *
 * Run with: npx vitest run src/components/chat/AskUserQuestionBlock.expired.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ContentBlock, SessionActivity } from '@/types'
import { AskUserQuestionBlock } from './AskUserQuestionBlock'
import { ChatSessionProvider } from './ChatSessionContext'

const askBlock: ContentBlock = {
  id: 'b1',
  type: 'ask_user_question',
  content: '',
  metadata: {
    tool_call_id: 'q1',
    questions: [
      { question: 'Pick one', header: 'Choice', multiSelect: false, options: [{ label: 'Alpha' }, { label: 'Beta' }] },
    ],
  },
}

/** A live session, waiting on a person, and the rule that decided is the open question. */
const AWAITING: SessionActivity = {
  live: true,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
  state: 'waiting_on_person',
  state_reason: { rule: 'question_open', age_ms: 1_200 },
}

/** The same session after the turn ended: the question is gone with it. */
const TURN_OVER: SessionActivity = {
  live: true,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
  state: 'done',
  state_reason: { rule: 'answered_human', age_ms: 40_000 },
}

function mount(sessionActivity?: SessionActivity | null) {
  const onRespond = vi.fn().mockReturnValue(true)
  render(
    <ChatSessionProvider sessionId="s1" sessionActivity={sessionActivity}>
      <AskUserQuestionBlock block={askBlock} onRespond={onRespond} />
    </ChatSessionProvider>,
  )
  return onRespond
}

const submit = () => screen.queryByRole('button', { name: 'Submit' })

describe('AskUserQuestionBlock — only an OPEN question is actionable', () => {
  it('an open question is answerable and sends its answer', () => {
    const onRespond = mount(AWAITING)
    expect(submit()).not.toBeNull()
    fireEvent.click(screen.getByText('Alpha'))
    fireEvent.click(submit()!)
    expect(onRespond).toHaveBeenCalledWith('q1', 'Alpha')
    expect(screen.getByText(/Answered:/)).toBeInTheDocument()
  })

  it('a question whose turn is over is expired: no button, nothing to click', () => {
    const onRespond = mount(TURN_OVER)
    // Explicit: the card says why it cannot be answered.
    expect(screen.getByText(/can no longer be answered/i)).toBeInTheDocument()
    // No way to send anything.
    expect(submit()).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    // The options are still readable, but inert.
    const alpha = screen.getByText('Alpha').closest('button')
    expect(alpha).toBeDisabled()
    fireEvent.click(screen.getByText('Alpha'))
    expect(onRespond).not.toHaveBeenCalled()
  })

  it('an unknown state is expired too — absence of a verdict is not a verdict', () => {
    const onRespond = mount(undefined)
    expect(screen.getByText(/can no longer be answered/i)).toBeInTheDocument()
    expect(submit()).toBeNull()
    fireEvent.click(screen.getByText('Alpha'))
    expect(onRespond).not.toHaveBeenCalled()
  })
})
