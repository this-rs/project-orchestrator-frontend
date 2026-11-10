/**
 * The chat hook reports whether an answer was handed to the socket. The cards
 * must only switch to their "answered" state on success: on a dead socket the
 * agent is still blocked and the user has to be able to answer again.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ContentBlock, SessionActivity } from '@/types'
import { AskUserQuestionBlock } from './AskUserQuestionBlock'
import { PermissionRequestBlock } from './PermissionRequestBlock'
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

const permBlock: ContentBlock = {
  id: 'b2',
  type: 'permission_request',
  content: '',
  metadata: { tool_call_id: 'p1', tool_name: 'Bash', tool_input: { command: 'ls' } },
}

/**
 * The session really is waiting on a person for THIS question, which is what
 * makes the card answerable at all (`questionAwaitsPerson`): these tests are
 * about a live question whose answer failed to leave, not about the card that
 * outlives its turn.
 */
const AWAITING: SessionActivity = {
  live: true,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
  state: 'waiting_on_person',
  state_reason: { rule: 'question_open', age_ms: 900 },
}

/** Render a question card inside the transcript it belongs to. */
function renderAsk(onRespond: (requestId: string, response: string) => boolean | void) {
  return render(
    <ChatSessionProvider sessionId="s1" sessionActivity={AWAITING}>
      <AskUserQuestionBlock block={askBlock} onRespond={onRespond} />
    </ChatSessionProvider>,
  )
}

describe('AskUserQuestionBlock', () => {
  const answer = () => {
    fireEvent.click(screen.getByText('Alpha'))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  }

  it('stays answerable and shows an error when onRespond returns false', () => {
    const onRespond = vi.fn().mockReturnValue(false)
    renderAsk(onRespond)
    answer()
    expect(onRespond).toHaveBeenCalledWith('q1', 'Alpha')
    expect(screen.queryByText(/Answered:/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('alert').textContent).toMatch(/not sent/i)
  })

  it('shows the submitted state when onRespond returns true', () => {
    const onRespond = vi.fn().mockReturnValue(true)
    renderAsk(onRespond)
    answer()
    expect(screen.getByText(/Answered:/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('can be re-answered after a failure', () => {
    const onRespond = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAsk(onRespond)
    answer()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(onRespond).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/Answered:/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('PermissionRequestBlock', () => {
  it.each([
    ['Allow', 'Allowed'],
    ['Deny', 'Denied'],
  ])('%s: stays pending with an error when onRespond returns false', (button, decided) => {
    const onRespond = vi.fn().mockReturnValue(false)
    render(<PermissionRequestBlock block={permBlock} onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(button) }))
    expect(onRespond).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(decided)).toBeNull()
    expect(screen.getByRole('button', { name: /Allow/ })).toHaveProperty('disabled', false)
    expect(screen.getByRole('alert').textContent).toMatch(/not sent/i)
  })

  it.each([
    ['Allow', 'Allowed'],
    ['Deny', 'Denied'],
  ])('%s: shows the decision when onRespond returns true', (button, decided) => {
    const onRespond = vi.fn().mockReturnValue(true)
    render(<PermissionRequestBlock block={permBlock} onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(button) }))
    expect(screen.getByText(decided)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

