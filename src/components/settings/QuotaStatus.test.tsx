/**
 * The quota card of a provider: the human escape hatch of an exclusion that outlived the
 * provider's own reset. Nothing renders when the server knows nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '@/services/api'
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

/** The exhausted quota above, with some fields of its view replaced. */
const known = (over: Record<string, unknown>) => ({ ...EXHAUSTED, quota: { ...EXHAUSTED.quota, ...over } })

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

  it('shows nothing while the quota is being read, then the card', async () => {
    let answer: (v: unknown) => void = () => {}
    quota.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await waitFor(() => expect(quota).toHaveBeenCalledWith('claude-code'))
    expect(screen.queryByTestId('quota-claude-code')).toBeNull()
    answer(EXHAUSTED)
    expect(await screen.findByTestId('quota-claude-code')).toBeTruthy()
    expect(screen.getByText('Account quota')).toBeTruthy()
  })

  // The reset control is offered only when a limit is reached: a failed GET does not say so, so it offers no clear.
  it('says that the quota could not be read and offers to read again, without a reset', async () => {
    quota.mockRejectedValue(new ApiError(500, '{"error":"Internal server error"}'))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    const card = await screen.findByTestId('quota-claude-code')
    expect(card.textContent).toContain('The quota state could not be read.')
    expect(screen.getByRole('button', { name: 'Read the quota of Claude Code again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear the quota of Claude Code' })).toBeNull()
    // Nothing is claimed about a state nobody read.
    expect(screen.queryByText(/observed/)).toBeNull()
    expect(screen.queryByText(/exhaust/)).toBeNull()
  })

  it('shows the quota once a new read succeeds', async () => {
    quota.mockRejectedValueOnce(new ApiError(501, '{"error":"the chat router is not running"}'))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByText('The quota state could not be read.')
    quota.mockResolvedValueOnce(EXHAUSTED)
    fireEvent.click(screen.getByRole('button', { name: 'Read the quota of Claude Code again' }))
    expect(await screen.findByText(/exhausted until/)).toBeTruthy()
    expect(screen.queryByText('The quota state could not be read.')).toBeNull()
    expect(quota).toHaveBeenCalledTimes(2)
  })

  it('removes the card when the new read says that nothing is known', async () => {
    quota.mockRejectedValueOnce(new ApiError(500, '{"error":"Internal server error"}'))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByText('The quota state could not be read.')
    fireEvent.click(screen.getByRole('button', { name: 'Read the quota of Claude Code again' }))
    await waitFor(() => expect(screen.queryByTestId('quota-claude-code')).toBeNull())
  })

  it('stays unreadable, with the read button only, when the new read fails too', async () => {
    quota.mockRejectedValue(new ApiError(500, '{"error":"Internal server error"}'))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByText('The quota state could not be read.')
    fireEvent.click(screen.getByRole('button', { name: 'Read the quota of Claude Code again' }))
    await waitFor(() => expect(quota).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('The quota state could not be read.')).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Read the quota of Claude Code again' }) as HTMLButtonElement).disabled).toBe(false),
    )
    expect(screen.queryByRole('button', { name: 'Clear the quota of Claude Code' })).toBeNull()
  })

  it('replaces the card of the previous instance by the state of the new one', async () => {
    quota.mockImplementation(async (id: unknown) => (id === 'claude-code' ? EXHAUSTED : { now_ms: NOW, quota: null }))
    const { rerender } = render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    rerender(<QuotaStatus instanceId="deepseek" name="DeepSeek" />)
    await waitFor(() => expect(quota).toHaveBeenCalledWith('deepseek'))
    // The quota of Claude Code is not shown under the name of DeepSeek, not even while the read is pending.
    expect(screen.queryByTestId('quota-claude-code')).toBeNull()
    expect(screen.queryByText(/exhausted until/)).toBeNull()
    await waitFor(() => expect(quota).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('quota-deepseek')).toBeNull()
  })

  it('does not let a late answer for the previous instance come back', async () => {
    let answer: (v: unknown) => void = () => {}
    quota.mockImplementation((id: unknown) =>
      id === 'claude-code' ? new Promise((resolve) => (answer = resolve)) : Promise.resolve({ now_ms: NOW, quota: null }),
    )
    const { rerender } = render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await waitFor(() => expect(quota).toHaveBeenCalledWith('claude-code'))
    rerender(<QuotaStatus instanceId="deepseek" name="DeepSeek" />)
    await waitFor(() => expect(quota).toHaveBeenCalledWith('deepseek'))
    await act(async () => answer(EXHAUSTED))
    expect(screen.queryByText(/exhausted until/)).toBeNull()
    expect(screen.queryByTestId('quota-deepseek')).toBeNull()
  })

  // 8.64e15 ms is the last instant a Date can hold: beyond it, `toISOString()` throws.
  it.each([
    ['a known reset', true],
    ['a guessed cooldown', false],
  ])('keeps the card standing when the date of %s is out of range', async (_label, reset_known) => {
    quota.mockResolvedValue(known({ exhausted: { resets_at_ms: 8.64e15 + 1, reset_known, window: null, cause: 'window' } }))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    expect(screen.getByText('exhausted (no reset known)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    expect(screen.getByText(/with no deadline/)).toBeTruthy()
  })

  it('names the date of the reset in the exhaustion line', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    // The date is written in the locale of the reader; its hour depends on the time zone of the run.
    const line = screen.getByText(/exhausted until/).textContent ?? ''
    expect(line).toMatch(/^exhausted until .*\d{1,2}:\d{2}.* · window seven_day_overage_included$/)
  })

  it('claims no more than "no account exhaustion known" for a quota without one, and offers no reset', async () => {
    quota.mockResolvedValue(known({ exhausted: null }))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    // The view does not expose the per-model holds: "not exhausted" would say more than the server told.
    expect(screen.getByText('no account exhaustion known')).toBeTruthy()
    expect(screen.queryByText('not exhausted')).toBeNull()
    expect(screen.queryByText(/exhausted until/)).toBeNull()
    // No limit is reached, so there is nothing to reset.
    expect(screen.queryByRole('button', { name: 'Clear the quota of Claude Code' })).toBeNull()
  })

  // A family held while the account serves IS a limit reached, and `clear` drops the whole entry,
  // holds included: it is the only way to lift it, so the reset must be offered.
  it('offers the reset, and names the family, when only a model family is held', async () => {
    quota.mockResolvedValue(
      known({
        exhausted: null,
        model_holds: [{ model: 'Fable', resets_at_ms: 1_792_643_200_000, reset_known: true, observed_at_ms: NOW - 5 * 60_000 }],
      }),
    )
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    expect(screen.getByText(/Fable is out until/)).toBeTruthy()
    expect(screen.queryByText('no account exhaustion known')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(clearQuota).toHaveBeenCalledWith('claude-code'))
  })

  it('says an exhaustion without a known reset as open, without a window when none is named', async () => {
    quota.mockResolvedValue(
      known({ exhausted: { resets_at_ms: NOW + 5 * 60_000, reset_known: false, window: null, cause: 'out_of_credit' } }),
    )
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    expect(screen.getByText('exhausted (no reset known)')).toBeTruthy()
    expect(screen.queryByText(/window/)).toBeNull()
  })

  // `resets_at_ms` of an exhaustion whose reset is not known is a cooldown the server guessed:
  // the confirmation must not present it as the hour the provider gave.
  it('does not invent a deadline in the confirmation when the reset is not known', async () => {
    quota.mockResolvedValue(
      known({ exhausted: { resets_at_ms: NOW + 5 * 60_000, reset_known: false, window: null, cause: 'out_of_credit' } }),
    )
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    expect(screen.getByText(/with no deadline/)).toBeTruthy()
    expect(screen.queryByText(/refuses until/)).toBeNull()
  })

  it.each([
    ['just now', 59_000],
    ['just now', -30_000], // the clock of the server ran behind the observation: never a negative age
    ['1 min ago', 60_000],
    ['59 min ago', 59 * 60_000],
    ['1 h ago', 60 * 60_000],
    ['23 h ago', 23 * 60 * 60_000 + 59 * 60_000],
    ['1 d ago', 24 * 60 * 60_000],
    ['3 d ago', 3 * 24 * 60 * 60_000 + 60 * 60_000],
  ])('dates the observation "%s" (%i ms old)', async (age, ms) => {
    quota.mockResolvedValue(known({ observed_at_ms: NOW - ms }))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    expect(screen.getByText(`observed ${age}`)).toBeTruthy()
  })

  it('asks before clearing: the confirmation names the provider, and nothing is sent yet', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Clear the quota of Claude Code?' })
    expect(dialog.textContent).toMatch(/The server thinks Claude Code refuses until .+ \(observed 5 min ago\)/)
    expect(screen.queryByRole('button', { name: 'Clear the quota of Claude Code' })).toBeNull()
    expect(clearQuota).not.toHaveBeenCalled()
  })

  it('keeps the quota when the confirmation is declined', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(clearQuota).not.toHaveBeenCalled()
    expect(screen.getByText(/exhausted until/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear the quota of Claude Code' })).toBeTruthy()
  })

  it('removes the card once the quota is cleared', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.queryByTestId('quota-claude-code')).toBeNull())
    expect(clearQuota).toHaveBeenCalledTimes(1)
    expect(clearQuota).toHaveBeenCalledWith('claude-code')
  })

  // The bodies `DELETE /api/chat/providers/{id}/quota` really answers: `{"error": "<sentence>"}`, without a typed code
  // (backend `require_human`, `auth::middleware`, `registry()` and `AppError::Internal`).
  it.each([
    [403, 'provider settings can only be changed by a signed-in user'],
    [
      403,
      'this route requires a human session; an agent session token cannot change providers, consent, roles, model policy or chat permissions',
    ],
    [501, 'the chat router is not running'],
    [500, 'Internal server error'],
  ])('says why a clear was refused (%i: %s), and leaves the quota and the confirmation in place', async (status, sentence) => {
    quota.mockResolvedValue(EXHAUSTED)
    clearQuota.mockRejectedValue(new ApiError(status, JSON.stringify({ error: sentence })))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect((await screen.findByRole('alert')).textContent).toBe(sentence)
    expect(screen.getByText(/exhausted until/)).toBeTruthy()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['a JSON body without a sentence', new ApiError(500, '{}')],
    ['something that is not an error', 'nope'],
  ])('falls back on a generic message when the refusal is %s', async (_label, failure) => {
    quota.mockResolvedValue(EXHAUSTED)
    clearQuota.mockRejectedValue(failure)
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The request failed')
  })

  it('forgets the error of a refused clear when the confirmation is declined', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    clearQuota.mockRejectedValue(new ApiError(501, '{"error":"the chat router is not running"}'))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('the chat router is not running')).toBeNull()
    expect(screen.getByText(/exhausted until/)).toBeTruthy()
  })

  it('forgets the error of a failed clear when the next one succeeds', async () => {
    quota.mockResolvedValue(EXHAUSTED)
    clearQuota.mockRejectedValueOnce(new ApiError(500, '{"error":"boom"}'))
    render(<QuotaStatus instanceId="claude-code" name="Claude Code" />)
    await screen.findByTestId('quota-claude-code')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the quota of Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.queryByTestId('quota-claude-code')).toBeNull())
    expect(clearQuota).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
