/**
 * Run with: npx vitest run src/components/ui/CostDisplay.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CostDisplay } from './CostDisplay'

const shown = () => screen.queryByTestId('cost-display')

describe('CostDisplay', () => {
  it('reported: the bare amount, nothing added', () => {
    render(<CostDisplay cost={{ usd: 0.0042, basis: 'reported' }} />)
    expect(shown()?.textContent).toBe('$0.0042')
    expect(shown()?.getAttribute('title')).toBeNull()
  })

  it('priced: amount + "est." badge, explained to sighted and screen-reader users', () => {
    render(<CostDisplay cost={{ usd: 0.5, basis: 'priced' }} />)
    const el = shown()!
    expect(el.textContent).toContain('$0.50')
    expect(el.textContent).toContain('est.')
    expect(el.getAttribute('title')).toMatch(/price table/)
    expect(el.querySelector('.sr-only')?.textContent).toMatch(/Estimated from a price table/)
  })

  it('free: "local", no dollar sign', () => {
    render(<CostDisplay cost={{ usd: 0, basis: 'free' }} />)
    expect(shown()?.textContent).toContain('local')
    expect(shown()?.textContent).not.toContain('$')
  })

  it('subscription: the word; the notional amount is not the main value', () => {
    render(<CostDisplay cost={{ usd: 0.3, basis: 'subscription' }} />)
    const el = shown()!
    expect(el.firstChild?.textContent).toBe('subscription')
    expect(el.getAttribute('title')).toContain('$0.30')
  })

  it('unknown: tokens alone when there are some', () => {
    render(<CostDisplay cost={{ usd: null, basis: 'unknown', tokens: { input: 1200, output: 300 } }} />)
    expect(shown()?.textContent).toContain('1.2k in · 300 out')
    expect(shown()?.textContent).not.toContain('$')
  })

  it.each([
    ['unknown', { usd: null, basis: 'unknown' as const }],
    ['unknown with a zero', { usd: 0, basis: 'unknown' as const }],
    ['no figure', { usd: null, basis: 'reported' as const }],
    ['nothing', null],
  ])('%s: renders nothing — and not its separator either', (_label, cost) => {
    const { container } = render(<CostDisplay cost={cost} before={<span>·</span>} />)
    expect(container.textContent).toBe('')
  })

  it('renders `before` only together with a cost', () => {
    const { container } = render(<CostDisplay cost={{ usd: 2, basis: 'reported' }} before={<span>·</span>} />)
    expect(container.textContent).toBe('·$2.00')
  })
})
