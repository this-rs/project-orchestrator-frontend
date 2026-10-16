/**
 * The live interruption banner: shown while an instance is OUT, gone once it
 * answers again — driven by the persisted events, not by a local flag.
 *
 * Run with: npx vitest run src/components/chat/ProviderOutageBanner.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import { ProviderOutageBanner } from './ProviderOutageBanner'

const START = '2026-10-16T14:05:29Z'
const T0 = Date.parse(START)
const iso = (offsetS: number) => new Date(T0 + offsetS * 1000).toISOString()

const down = (seenS: number, over: Record<string, unknown> = {}) => ({
  type: 'provider_outage', phase: 'down', provider_id: 'deepseek-prod', failures: 3, started_at: START, cause: 'connection refused', created_at: iso(seenS), ...over,
})
const up = (seenS: number, over: Record<string, unknown> = {}) => ({
  type: 'provider_outage', phase: 'up', provider_id: 'deepseek-prod', failures: 0, started_at: START, duration_ms: 4200, created_at: iso(seenS), ...over,
})

const show = (events: Record<string, unknown>[]) =>
  render(
    <Provider store={createStore()}>
      <ProviderOutageBanner messages={historyEventsToMessages(events as never[])} />
    </Provider>,
  )

describe('<ProviderOutageBanner>', () => {
  it('shows nothing while every provider answers', () => {
    show([{ type: 'user_message', content: 'hi', created_at: iso(0) }])
    expect(screen.queryByTestId('provider-outage-banner')).toBeNull()
  })

  it('names the instance that is out and says the turn is held, not lost', () => {
    show([down(0)])
    const banner = screen.getByTestId('provider-outage-banner')
    expect(banner.getAttribute('role')).toBe('alert')
    expect(banner.getAttribute('data-phase')).toBe('down')
    expect(banner.getAttribute('data-provider')).toBe('deepseek-prod')
    expect(banner.textContent).toContain('deepseek-prod')
    expect(banner.textContent).toContain('out of service')
    expect(banner.textContent).toContain('resumes on its own')
    // The raw cause is masked server-side and shown as is.
    expect(banner.textContent).toContain('connection refused')
    expect(banner.textContent).toContain('3 consecutive failures')
  })

  it('retires the banner the moment the instance answers again', () => {
    const { rerender } = show([down(0)])
    expect(screen.getByTestId('provider-outage-banner')).toBeTruthy()
    rerender(
      <Provider store={createStore()}>
        <ProviderOutageBanner messages={historyEventsToMessages([down(0), up(31)] as never[])} />
      </Provider>,
    )
    expect(screen.queryByTestId('provider-outage-banner')).toBeNull()
  })

  it('speaks of one instance and counts the others still out', () => {
    show([down(0), down(10, { provider_id: 'other' })])
    const banner = screen.getByTestId('provider-outage-banner')
    expect(banner.getAttribute('data-provider')).toBe('deepseek-prod')
    expect(banner.textContent).toContain('1 others out')
  })
})
