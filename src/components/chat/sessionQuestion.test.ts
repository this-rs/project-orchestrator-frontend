/**
 * The one verdict that makes a question card actionable. Everything here is
 * about the asymmetry: a wrong "open" answers a dead tool and the screen says
 * nothing (session cadfa92b), a wrong "closed" costs one normal message.
 */
import { describe, it, expect } from 'vitest'
import type { SessionActivity } from '@/types'
import { questionAwaitsPerson } from './sessionQuestion'

const live = (p: Partial<SessionActivity> = {}): SessionActivity => ({
  live: true,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
  state: null,
  state_reason: null,
  ...p,
})

describe('questionAwaitsPerson', () => {
  it('is true only for a live session waiting on a person for the open question', () => {
    expect(
      questionAwaitsPerson(live({ state: 'waiting_on_person', state_reason: { rule: 'question_open' } })),
    ).toBe(true)
  })

  it('is false when the person is awaited for another reason', () => {
    for (const rule of ['permission_pending', 'secret_requested', 'person_must_act', 'message_queued']) {
      expect(questionAwaitsPerson(live({ state: 'waiting_on_person', state_reason: { rule } })), rule).toBe(false)
    }
  })

  it('is false once the turn is over, whatever the reason says', () => {
    for (const state of ['done', 'reporting', 'working', 'writing', 'watching', 'stalled'] as const) {
      expect(questionAwaitsPerson(live({ state, state_reason: { rule: 'question_open' } })), state).toBe(false)
    }
  })

  it('is false when the question rule is not the one that decided', () => {
    expect(
      questionAwaitsPerson(live({ state: 'waiting_on_person', state_reason: { rule: 'answered_human' } })),
    ).toBe(false)
  })

  it('is false on an unknown verdict — unknown is not open', () => {
    expect(questionAwaitsPerson(undefined)).toBe(false)
    expect(questionAwaitsPerson(null)).toBe(false)
    expect(questionAwaitsPerson(live())).toBe(false)
    // The state arrived but not the rule that explains it: not a permission to answer.
    expect(questionAwaitsPerson(live({ state: 'waiting_on_person' }))).toBe(false)
  })
})
