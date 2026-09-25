import { describe, it, expect } from 'vitest'
import { deriveInputAction, type InputAction } from './inputAction'

/**
 * The input bar has one action button whose meaning changes with state.
 * These cover the full truth table rather than the happy path, because the
 * failure mode is silent: a wrong state shows the user a Send arrow that
 * stops generation, or a Stop square that queues a message.
 */
describe('deriveInputAction', () => {
  const base = { hasText: false, isStreaming: false, isStopping: false, disabled: false }

  it('is idle on an empty box with nothing running', () => {
    expect(deriveInputAction(base)).toBe<InputAction>('idle')
  })

  it('sends as soon as there is text', () => {
    expect(deriveInputAction({ ...base, hasText: true })).toBe<InputAction>('send')
  })

  it('stops on an empty box while streaming', () => {
    expect(deriveInputAction({ ...base, isStreaming: true })).toBe<InputAction>('stop')
  })

  it('still sends while streaming when text is typed — the backend queues it', () => {
    // This is the whole reason `hasText` outranks `isStreaming`. `handleSend`
    // carries no `isStreaming` guard: mid-stream sends are queued, not dropped.
    expect(deriveInputAction({ ...base, hasText: true, isStreaming: true })).toBe<InputAction>('send')
  })

  it('shows the stopping state on an empty box once a stop is in flight', () => {
    expect(
      deriveInputAction({ ...base, isStreaming: true, isStopping: true }),
    ).toBe<InputAction>('stopping')
  })

  it('lets the user queue a message while a stop is still in flight', () => {
    expect(
      deriveInputAction({ ...base, hasText: true, isStreaming: true, isStopping: true }),
    ).toBe<InputAction>('send')
  })

  it('is idle whenever the input is disabled, whatever else is true', () => {
    // `disabled` comes from the parent (no session, socket down…). Nothing may
    // override it — least of all a stop that would fire on a dead socket.
    for (const hasText of [false, true]) {
      for (const isStreaming of [false, true]) {
        for (const isStopping of [false, true]) {
          expect(
            deriveInputAction({ hasText, isStreaming, isStopping, disabled: true }),
          ).toBe<InputAction>('idle')
        }
      }
    }
  })

  it('never returns stop or stopping when there is text to send', () => {
    // Guards the invariant behind the merge: with text in the box the button is
    // always a send, so a user mid-sentence cannot kill their own generation by
    // hitting what looks like the send arrow.
    for (const isStreaming of [false, true]) {
      for (const isStopping of [false, true]) {
        const action = deriveInputAction({ hasText: true, isStreaming, isStopping, disabled: false })
        expect(action).not.toBe<InputAction>('stop')
        expect(action).not.toBe<InputAction>('stopping')
      }
    }
  })
})
