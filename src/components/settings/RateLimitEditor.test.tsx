/**
 * The optional "Limits" section of one provider instance (RL8).
 *
 * Run with: npx vitest run src/components/settings/RateLimitEditor.test.tsx
 */
import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { RateLimitEditor } from './RateLimitEditor'
import type { RateLimit } from '@/types/rateLimit'

function Harness({ initial = [] as RateLimit[], models = ['deepseek-chat'] }: { initial?: RateLimit[]; models?: string[] }) {
  const [limits, setLimits] = useState<RateLimit[]>(initial)
  return (
    <RateLimitEditor value={limits} onChange={setLimits} credentialRef="vault:deepseek" models={models} uid="rl" />
  )
}

const rows = () => screen.queryAllByTestId('rate-limit-row')
const shown = (testId: string) => screen.queryByTestId(testId)?.textContent ?? null
const openSection = () => fireEvent.click(screen.getByRole('button', { name: /Limits/ }))

function pick(name: string, option: string) {
  const trigger = screen.getByRole('combobox', { name }) as HTMLElement
  fireEvent.click(trigger)
  const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
  fireEvent.click(within(listbox).getByRole('option', { name: option, hidden: true }))
}

describe('an instance with no limit', () => {
  it('starts closed and shows nothing but the summary line', () => {
    render(<Harness />)
    expect(screen.getByTestId('rate-limits')).toBeTruthy()
    // Nothing is rendered inside a closed disclosure: the screen is what it was.
    expect(rows()).toHaveLength(0)
    expect(screen.queryByTestId('rate-limit-add')).toBeNull()
    openSection()
    expect(screen.getByTestId('rate-limits-none')).toBeTruthy()
    expect(rows()).toHaveLength(0)
  })
})

describe('adding a limit', () => {
  it('appends a valid limit and says it in plain language', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    expect(rows()).toHaveLength(1)
    expect(shown('rate-limit-preview')).toContain('60 requests per minute (This instance)')
    expect(screen.queryByText('A strictly positive number.')).toBeNull()
  })

  it('never hands back a limit that is already there', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    expect(rows()).toHaveLength(2)
    expect(screen.queryByText('The same limit is already there.')).toBeNull()
    // The second one moved to another window rather than copying the first.
    const previews = screen.getAllByTestId('rate-limit-preview').map((p) => p.textContent)
    expect(previews[0]).toContain('per minute')
    expect(previews[1]).toContain('per hour')
  })

  it('refuses two limits that share kind, window and scope, and says so', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    // Bring the second back onto the first.
    const triggers = screen.getAllByRole('combobox', { name: 'Window' })
    fireEvent.click(triggers[1])
    const listbox = document.getElementById(triggers[1].getAttribute('aria-controls')!)!
    fireEvent.click(within(listbox).getByRole('option', { name: 'per minute', hidden: true }))
    expect(screen.getAllByText('The same limit is already there.')).toHaveLength(2)
  })

  it('removes the limit it was asked to remove', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    fireEvent.click(screen.getAllByTestId('rate-limit-remove')[0])
    expect(rows()).toHaveLength(0)
    expect(screen.getByTestId('rate-limits-none')).toBeTruthy()
  })
})

describe('the budget family is a different question', () => {
  it('a budget only offers calendar windows and asks for its time zone', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    expect(screen.queryByRole('combobox', { name: 'Time zone' })).toBeNull()

    pick('What to limit', 'US dollars')
    // The window became a calendar one, and its zone came with it.
    expect(screen.getByRole('combobox', { name: 'Window' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Time zone' }).textContent).toContain('utc')

    const trigger = screen.getByRole('combobox', { name: 'Window' })
    fireEvent.click(trigger)
    const listbox = document.getElementById(trigger.getAttribute('aria-controls')!)!
    const options = within(listbox)
      .getAllByRole('option', { hidden: true })
      .map((o) => o.textContent)
    expect(options).toEqual(['per day', 'per week', 'per month'])
  })
})

describe('an invalid ceiling', () => {
  it('is refused inline, with the same rule the backend applies', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    const max = screen.getByLabelText('Ceiling') as HTMLInputElement
    fireEvent.change(max, { target: { value: '0' } })
    expect(screen.getByText('A strictly positive number.')).toBeTruthy()
    fireEvent.change(max, { target: { value: '1.5' } })
    expect(screen.getByText('A whole number of requests or tokens.')).toBeTruthy()
    fireEvent.change(max, { target: { value: '40' } })
    expect(screen.queryByText('A strictly positive number.')).toBeNull()
  })
})

describe('a scope', () => {
  it('names a credential REFERENCE and refuses a bare key', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    pick('Applies to', 'One key')
    const ref = screen.getByLabelText('Credential reference') as HTMLInputElement
    expect(ref.value).toBe('vault:deepseek')
    expect(shown('rate-limit-preview')).toContain('One key vault:deepseek')

    fireEvent.change(ref, { target: { value: 'sk-live-abcdef' } })
    expect(screen.getByText('Name a credential reference (vault:<name> or env:<VAR>).')).toBeTruthy()
  })

  it('names a model of the instance', () => {
    render(<Harness />)
    openSection()
    fireEvent.click(screen.getByTestId('rate-limit-add'))
    pick('Applies to', 'One model')
    expect(shown('rate-limit-preview')).toContain('One model deepseek-chat')
  })
})

describe('the time zone', () => {
  it('is refused when the runtime does not know it', () => {
    render(
      <Harness initial={[{ kind: 'requests', window: 'day', calendar: 'Mars/Olympus', max: 100, scope: 'instance' }]} />,
    )
    expect(screen.getByText('Unknown time zone.')).toBeTruthy()
  })
})
