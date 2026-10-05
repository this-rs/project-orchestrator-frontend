import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ServerUpdateStatus } from '@/types/update'
import type { UpdateCheckResult } from '@/hooks/useUpdateCheck'

const hook = vi.hoisted(() => ({ value: null as unknown as UpdateCheckResult }))
vi.mock('@/hooks', () => ({ useUpdateCheck: () => hook.value }))

import { WebUpdateBanner } from './WebUpdateBanner'

function status(over: Partial<ServerUpdateStatus> = {}): ServerUpdateStatus {
  return {
    current: '0.0.15',
    current_build: '0.0.15',
    latest: '0.0.16',
    update_available: true,
    release_url: 'https://gh/r16',
    notes_excerpt: null,
    published_at: null,
    checked_at: null,
    last_error: null,
    check_enabled: true,
    auto_update_enabled: false,
    deployment_mode: 'standalone',
    self_update_supported: true,
    update_hint: 'orchestrator update',
    installing: false,
    install_error: null,
    staged_version: null,
    restart_required: false,
    restart_supported: true,
    ...over,
  }
}

const install = vi.fn(async () => {})
const restart = vi.fn(async () => {})
const dismiss = vi.fn()

function setHook(over: Partial<UpdateCheckResult> = {}, st: ServerUpdateStatus | null = status()) {
  hook.value = {
    updateAvailable: st?.update_available ?? true,
    latestVersion: st?.latest ?? '0.0.16',
    currentVersion: st?.current ?? '0.0.15',
    releaseUrl: 'https://gh/r16',
    dismissed: false,
    dismiss,
    loading: false,
    status: st,
    check: vi.fn(async () => {}),
    install,
    restart,
    acting: false,
    restarting: false,
    actionError: null,
    ...over,
  }
}

describe('WebUpdateBanner', () => {
  beforeEach(() => {
    // jsdom has no matchMedia (ConfirmDialog reads prefers-reduced-motion)
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
    install.mockClear()
    restart.mockClear()
    dismiss.mockClear()
  })

  it('renders nothing when there is no update, or it was dismissed', () => {
    setHook({ updateAvailable: false }, status({ update_available: false }))
    const { container, rerender } = render(<WebUpdateBanner />)
    expect(container.firstChild).toBeNull()
    setHook({ dismissed: true })
    rerender(<WebUpdateBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('standalone: offers to install and can be dismissed', () => {
    setHook()
    render(<WebUpdateBanner />)
    expect(screen.getByText(/Version 0.0.16/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /install update/i }))
    expect(install).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /dismiss update notification/i }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('docker / package manager: shows the command instead of an install button', () => {
    setHook({}, status({ deployment_mode: 'docker', self_update_supported: false, update_hint: 'docker compose pull && docker compose up -d' }))
    render(<WebUpdateBanner />)
    expect(screen.getByText(/docker compose pull/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /install update/i })).toBeNull()
  })

  it('older server without the update service: notification only', () => {
    setHook({}, null)
    render(<WebUpdateBanner />)
    expect(screen.getByText(/Version 0.0.16/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /install update/i })).toBeNull()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeTruthy()
  })

  it('while installing: progress, no install or dismiss button', () => {
    setHook({}, status({ installing: true }))
    render(<WebUpdateBanner />)
    expect(screen.getByText(/Downloading version 0.0.16/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /install update/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
  })

  it('staged update is shown even if the notice was dismissed, and restart needs confirmation', async () => {
    setHook({ dismissed: true }, status({ staged_version: '0.0.16', restart_required: true }))
    render(<WebUpdateBanner />)
    expect(screen.getByText(/is installed and ready/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /restart now/i }))
    expect(restart).not.toHaveBeenCalled()
    expect(await screen.findByText(/Running conversations are interrupted/)).toBeTruthy()
    const confirm = screen.getAllByRole('button', { name: /restart now/i }).pop()!
    fireEvent.click(confirm)
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1))
  })

  it('staged without a supervisor: asks to restart manually, no restart button', () => {
    setHook({}, status({ staged_version: '0.0.16', restart_required: true, restart_supported: false }))
    render(<WebUpdateBanner />)
    expect(screen.getByText(/Restart the server manually/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /restart now/i })).toBeNull()
  })

  it('install failure is shown and can be retried', () => {
    setHook({}, status({ install_error: 'disk full' }))
    render(<WebUpdateBanner />)
    expect(screen.getByRole('alert').textContent).toContain('disk full')
    fireEvent.click(screen.getByRole('button', { name: /retry install/i }))
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('shows the reason a refused action gives', () => {
    setHook({ actionError: 'no newer release is known' })
    render(<WebUpdateBanner />)
    expect(screen.getByRole('alert').textContent).toContain('no newer release is known')
  })

  it('while restarting: says so and offers no restart button', () => {
    setHook({ restarting: true }, status({ staged_version: '0.0.16', restart_required: true }))
    render(<WebUpdateBanner />)
    expect(screen.getByText(/Restarting to apply version 0.0.16/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /restart now/i })).toBeNull()
  })
})
