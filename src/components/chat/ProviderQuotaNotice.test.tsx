/**
 * The quota notice INSIDE the model menu. Two things must hold: it names WHICH family is out (an
 * account-wide `exhausted` cannot, and a person reading only that concluded "PO no longer uses
 * Fable" — measured 11/11/2026), and it renders NOTHING when the account serves. The unlock is an
 * in-place confirmation, never a modal, and it must make the notice disappear.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProviderQuotaNotice } from './ProviderQuotaNotice'

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
const RESET = 1_792_643_200_000
const FAMILY = {
  now_ms: NOW,
  quota: {
    provider_id: 'claude-code',
    windows: [{ kind: 'seven_day', utilization: 0.38, resets_at_ms: RESET, status: 'allowed' }],
    source: 'live',
    observed_at_ms: NOW - 12 * 60_000,
    exhausted: null,
    model_holds: [{ model: 'Fable', resets_at_ms: RESET, reset_known: true, observed_at_ms: NOW - 12 * 60_000 }],
  },
}

beforeEach(() => {
  quota.mockReset().mockResolvedValue({ now_ms: NOW, quota: null })
  clearQuota.mockReset().mockResolvedValue(undefined)
})

describe('ProviderQuotaNotice', () => {
  it('renders nothing when the server knows nothing', async () => {
    render(<ProviderQuotaNotice providerId="claude-code" name="Claude Code" active />)
    await waitFor(() => expect(quota).toHaveBeenCalledWith('claude-code'))
    expect(screen.queryByTestId('routing-quota-claude-code')).toBeNull()
  })

  it('renders nothing on a serving account: no decorative unlock', async () => {
    quota.mockResolvedValue({ now_ms: NOW, quota: { ...FAMILY.quota, model_holds: [] } })
    render(<ProviderQuotaNotice providerId="claude-code" name="Claude Code" active />)
    await waitFor(() => expect(quota).toHaveBeenCalled())
    expect(screen.queryByTestId('routing-quota-claude-code')).toBeNull()
    expect(screen.queryByText('Unblock')).toBeNull()
  })

  it('names the family that is out, its reset and the age of the observation', async () => {
    quota.mockResolvedValue(FAMILY)
    render(<ProviderQuotaNotice providerId="claude-code" name="Claude Code" active />)
    await screen.findByTestId('routing-quota-claude-code')
    expect(screen.getByText(/Fable is out until/)).toBeTruthy()
    expect(screen.getByText(/observed 12 min ago/)).toBeTruthy()
  })

  it('confirms in place (never a modal) and forgets the quota', async () => {
    quota.mockResolvedValue(FAMILY)
    render(<ProviderQuotaNotice providerId="claude-code" name="Claude Code" active />)
    await screen.findByTestId('routing-quota-claude-code')

    fireEvent.click(screen.getByTestId('routing-quota-unlock-claude-code'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/Forget Claude Code/)).toBeTruthy()

    fireEvent.click(screen.getByTestId('routing-quota-confirm-claude-code'))
    await waitFor(() => expect(clearQuota).toHaveBeenCalledWith('claude-code'))
    await waitFor(() => expect(screen.queryByTestId('routing-quota-claude-code')).toBeNull())
  })

  it('says why a refusal happened instead of pretending it worked', async () => {
    quota.mockResolvedValue(FAMILY)
    clearQuota.mockRejectedValue(new Error('nope'))
    render(<ProviderQuotaNotice providerId="claude-code" name="Claude Code" active />)
    await screen.findByTestId('routing-quota-claude-code')
    fireEvent.click(screen.getByTestId('routing-quota-unlock-claude-code'))
    fireEvent.click(screen.getByTestId('routing-quota-confirm-claude-code'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByTestId('routing-quota-claude-code')).toBeTruthy()
  })

  it('does not read the quota while the menu is closed', () => {
    render(<ProviderQuotaNotice providerId="claude-code" name="Claude Code" active={false} />)
    expect(quota).not.toHaveBeenCalled()
  })
})
