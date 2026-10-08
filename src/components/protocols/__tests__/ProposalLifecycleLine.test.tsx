/**
 * The lifecycle of a proposal is a bar AND words: a reader who cannot tell the
 * colours apart still knows where it stands and what comes next.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ProposalLifecycleLine } from '../ProposalLifecycleLine'
import { lifecycleSentence } from '../rfcLifecycle'

describe('ProposalLifecycleLine', () => {
  it('says the step, the state and the next step in words', () => {
    render(<ProposalLifecycleLine status="under_review" />)
    expect(screen.getByText('Step 3 of 7 — Under review. Next: Accepted.')).toBeTruthy()
    const bar = screen.getByRole('progressbar', { name: 'Proposal lifecycle: Under review' })
    expect(bar.getAttribute('aria-valuenow')).toBe('43')
    const steps = screen.getByRole('list', { name: 'Lifecycle steps' })
    const current = within(steps).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')
    expect(current?.textContent).toContain('Review')
    expect(within(steps).getAllByText('(done)')).toHaveLength(2)
  })

  it('has no next step once implemented', () => {
    expect(lifecycleSentence('implemented')).toBe('Step 7 of 7 — Implemented. Done.')
  })

  it('explains a closed proposal instead of pointing at a next step', () => {
    render(<ProposalLifecycleLine status="rejected" />)
    expect(screen.getByText('Closed — rejected. Nothing is left to do.')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
    const steps = screen.getByRole('list', { name: 'Lifecycle steps' })
    expect(within(steps).queryByText('(done)')).toBeNull()
    expect(lifecycleSentence('superseded')).toMatch(/replaced by another proposal/)
  })
})
