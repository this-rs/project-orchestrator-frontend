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

import { UpdatesSection } from './UpdatesSection'

describe('UpdatesSection', () => {
  beforeEach(() => invoke.mockReset())

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
})
