/**
 * VaultUnlock — unlock the vault inline (inside a provider card or the picker).
 *
 * Run with: npx vitest run src/components/chat/VaultUnlock.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/services/api'
import { DURATION_CHOICES } from '@/services/vault'

const unlock = vi.fn()
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { unlock: (...a: unknown[]) => unlock(...a) },
}))

import { VaultUnlock } from './VaultUnlock'

function mount(props: Partial<Parameters<typeof VaultUnlock>[0]> = {}) {
  const onUnlocked = vi.fn()
  const { unmount } = render(
    <MemoryRouter>
      <VaultUnlock onUnlocked={onUnlocked} {...props} />
    </MemoryRouter>,
  )
  return { onUnlocked, unmount }
}

beforeEach(() => {
  unlock.mockReset()
  // Clear sessionStorage between tests so duration memory doesn't leak.
  try { sessionStorage.clear() } catch { /* ignore */ }
})

describe('VaultUnlock', () => {
  it('renders the passphrase input, duration selector, and unlock button', () => {
    mount()
    expect(screen.getByPlaceholderText(/passphrase/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
  })

  it('duration selector shows all DURATION_CHOICES', () => {
    mount()
    const select = screen.getByLabelText(/duration/i) as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.textContent)
    expect(options).toEqual(DURATION_CHOICES.map((d) => d.label))
  })

  it('defaults to 1 hour (60 minutes)', () => {
    mount()
    const select = screen.getByLabelText(/duration/i) as HTMLSelectElement
    expect(select.value).toBe('60')
  })

  it('sends the selected duration to vaultApi.unlock', async () => {
    unlock.mockResolvedValue(undefined)
    mount()

    // Change duration to 4h
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '240' } })

    // Type passphrase and submit
    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'my-secret' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)

    await waitFor(() => expect(unlock).toHaveBeenCalledWith('my-secret', 240))
  })

  it('remembers a short chosen duration in sessionStorage', async () => {
    unlock.mockResolvedValue(undefined)
    const { unmount } = render(
      <MemoryRouter>
        <VaultUnlock onUnlocked={vi.fn()} />
      </MemoryRouter>,
    )

    // Select 15 min and unlock
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '15' } })
    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'pass' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)
    await waitFor(() => expect(unlock).toHaveBeenCalled())

    unmount()

    // Mount again — should remember 15 min
    render(
      <MemoryRouter>
        <VaultUnlock onUnlocked={vi.fn()} />
      </MemoryRouter>,
    )
    const select = screen.getByLabelText(/duration/i) as HTMLSelectElement
    expect(select.value).toBe('15')
  })

  it('never remembers a duration longer than 1 h: back to the 60 min default', async () => {
    unlock.mockResolvedValue(undefined)
    const { unmount } = mount()
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '720' } })
    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'pass' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)
    await waitFor(() => expect(unlock).toHaveBeenCalledWith('pass', 720))
    unmount()

    mount()
    expect((screen.getByLabelText(/duration/i) as HTMLSelectElement).value).toBe('60')
  })

  it('a tampered stored duration falls back to 60 min', () => {
    sessionStorage.setItem('po-vault-unlock-minutes', '9999')
    mount()
    expect((screen.getByLabelText(/duration/i) as HTMLSelectElement).value).toBe('60')
  })

  it('calls onUnlocked after a successful unlock', async () => {
    unlock.mockResolvedValue(undefined)
    const { onUnlocked } = mount()

    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'pass' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
  })

  it('shows an error on wrong passphrase (403)', async () => {
    unlock.mockRejectedValue(new ApiError(403, 'Forbidden'))
    mount()

    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'wrong' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/wrong passphrase/i))
  })

  it('the unlock button is disabled while the passphrase is empty', () => {
    mount()
    expect(screen.getByRole('button', { name: /unlock/i })).toBeDisabled()
  })

  it('shows a success status after unlock', async () => {
    unlock.mockResolvedValue(undefined)
    mount()

    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'pass' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/unlocked/i))
  })
})
