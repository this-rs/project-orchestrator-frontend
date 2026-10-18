/**
 * Run with: npx vitest run src/components/chat/SessionUsageSummary.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { SessionUsage } from '@/types'

vi.mock('@/services/chat', () => ({
  chatApi: { getSessionUsage: vi.fn<(sessionId: string) => Promise<SessionUsage>>() },
}))

import { chatApi } from '@/services/chat'
import { SessionUsageSummary } from './SessionUsageSummary'

const usage = (over: Partial<SessionUsage> = {}): SessionUsage => ({
  turns: 3,
  turns_with_usage: 2,
  input_tokens: 1000,
  cache_read_tokens: 9000,
  cache_hit_ratio: 0.9,
  by_turn: [],
  ...over,
})

describe('SessionUsageSummary (CTX0-FE)', () => {
  beforeEach(() => vi.mocked(chatApi.getSessionUsage).mockReset())

  it('the conversation total comes from GET /usage, not from the transcript', async () => {
    vi.mocked(chatApi.getSessionUsage).mockResolvedValue(usage())
    render(<SessionUsageSummary sessionId="s1" isStreaming={false} />)
    const el = await screen.findByTestId('session-usage-summary')
    expect(chatApi.getSessionUsage).toHaveBeenCalledWith('s1')
    expect(el.textContent).toContain('90%')
    expect(el.getAttribute('title')).toContain('2')
    expect(el.getAttribute('title')).toContain('3')
  })

  it('says "no cache read" when the backend has no ratio, never 0%', async () => {
    vi.mocked(chatApi.getSessionUsage).mockResolvedValue(usage({ cache_read_tokens: null, cache_hit_ratio: null }))
    render(<SessionUsageSummary sessionId="s1" isStreaming={false} />)
    const el = await screen.findByTestId('session-usage-summary')
    expect(el.textContent).not.toContain('0%')
    expect(el.textContent).toMatch(/no cache read/)
  })

  it('nothing until a turn reported a usage', async () => {
    vi.mocked(chatApi.getSessionUsage).mockResolvedValue(usage({ turns_with_usage: 0 }))
    render(<SessionUsageSummary sessionId="s1" isStreaming={false} />)
    await waitFor(() => expect(chatApi.getSessionUsage).toHaveBeenCalled())
    expect(screen.queryByTestId('session-usage-summary')).toBeNull()
  })

  it('not asked while a turn streams (read again when it ends)', () => {
    render(<SessionUsageSummary sessionId="s1" isStreaming />)
    expect(chatApi.getSessionUsage).not.toHaveBeenCalled()
  })
})
