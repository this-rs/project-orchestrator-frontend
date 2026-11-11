/**
 * The quota card of a provider: the human escape hatch of an exclusion that outlived the
 * provider's own reset. Nothing renders when the server knows nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QuotaStatus } from './QuotaStatus'

const quota = vi.fn()
const clearQuota = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    quota: (...a: unknown[]) => quota(...a),
    clearQuota: (...a: unknown[]) => clearQuota(...a),
  },
}))

const NOW = 1_792_500_000_000
const EXHAUSTED = {
  now_ms: NOW,
  quota: {
    provider_id: 'claude-code',
    windows: [{ kind: 'seven_day_overage_included', utilization: 1, resets_at_ms: 1_792_643_200_000, status: 'exhausted' }],
    source: 'live',
    observed_at_ms: NOW - 5 * 60_000,
    exhausted: { resets_at_ms: 1_792_643_200_000, reset_known: true, window: 'seven_day_overage_included', cause: 'window' },
  },
}

beforeEach(() => {
  quota.mockReset().mockResolvedValue({ now_ms: NOW, quota: null })
  clearQuota.mockReset().mockResolvedValue(undefined)
})

describe('QuotaStatus', () => {
  it('renders nothing when the server knows no quota', async () => {
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await waitFor(() => expect(quota).toHaveBeenCalledWith('claude-code'))
    expect(screen.queryByTestId('quota-claude-code')).toBeNull()
  })

  it('shows the exhaustion, the age of the observation and a clear button', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    expect(screen.getByText(/exhausted until/)).toBeTruthy()
    expect(screen.getByText(/window seven_day_overage_included/)).toBeTruthy()
    expect(screen.getByText(/observed/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear the quota of Claude Code' })).toBeTruthy()
  })

  it('clears the quota and confirms what it clears', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    expect(screen.getByText(/refuses until/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(clearQuota).toHaveBeenCalledWith('claude-code'))
  })
})
