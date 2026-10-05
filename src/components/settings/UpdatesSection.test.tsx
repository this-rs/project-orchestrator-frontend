import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// A plain function, not vi.fn(): vitest reports an error thrown by a vi.fn() as a test failure
// even when the code under test catches it.
let next: (cmd: string) => unknown = () => null
const calls: string[] = []
const invoke = {
  mockReset: () => {
    calls.length = 0
    next = () => null
  },
}
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => {
    calls.push(cmd)
    return next(cmd)
  },
}))

const chat = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock('@/services/chat', () => ({
  chatApi: { getChatConfig: () => chat.get(), updateChatConfig: (p: unknown) => chat.update(p) },
}))

import { UpdatesSection } from './UpdatesSection'

describe('UpdatesSection', () => {
  beforeEach(() => {
    invoke.mockReset()
    chat.get.mockReset().mockResolvedValue({ auto_update_app: true })
    chat.update.mockReset()
  })

  it('says up to date when check_update returns null', async () => {
    next = () => null
    render(<UpdatesSection />)
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
    await waitFor(() => expect(screen.getByText('You are up to date.')).toBeTruthy())
    expect(calls).toEqual(['check_update'])
  })

  it('offers the update then installs it', async () => {
    next = (cmd) => (cmd === 'check_update' ? { version: '0.0.17', body: null, date: null } : undefined)
    render(<UpdatesSection />)
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
    await waitFor(() => expect(screen.getByText('Version 0.0.17 is available.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /update now/i }))
    await waitFor(() => expect(calls).toEqual(['check_update', 'install_update']))
    expect(screen.getByText(/will restart/)).toBeTruthy()
  })

  it('shows the failure and lets the user retry', async () => {
    next = () => {
      throw new Error('Update check failed: offline')
    }
    render(<UpdatesSection />)
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('offline'))
    expect((screen.getByRole('button', { name: /check for updates/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('the automatic-check switch reflects the stored value and saves a change', async () => {
    chat.get.mockResolvedValue({ auto_update_app: true })
    chat.update.mockResolvedValue({ auto_update_app: false })
    render(<UpdatesSection />)
    const sw = await screen.findByRole('switch')
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false))
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    await waitFor(() => expect(chat.update).toHaveBeenCalledWith({ auto_update_app: false }))
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('false'))
  })

  it('rolls the switch back and says so when saving fails', async () => {
    chat.get.mockResolvedValue({ auto_update_app: true })
    chat.update.mockRejectedValue(new Error('disk is read-only'))
    render(<UpdatesSection />)
    const sw = await screen.findByRole('switch')
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(sw)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('disk is read-only'))
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('stays disabled and explains when the setting cannot be read', async () => {
    chat.get.mockRejectedValue(new Error('backend down'))
    render(<UpdatesSection />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('backend down'))
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })
})
