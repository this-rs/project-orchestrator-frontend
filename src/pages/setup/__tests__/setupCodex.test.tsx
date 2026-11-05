import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, configure } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { setupConfigAtom, setupStepAtom, defaultSetupConfig, type SetupConfig } from '@/atoms/setup'
import { pendingSetupProviderAtom } from '@/atoms/setupProvider'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@/services/env', () => ({
  isTauri: true,
  fetchSetupStatus: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  useDragRegion: () => () => {},
}))

import { installMatchMedia } from '@/pages/__tests__/testUtils'
import { ChatPage } from '../ChatPage'

configure({ asyncUtilTimeout: 10_000 })
installMatchMedia()

function renderChat(patch: Partial<SetupConfig> = {}) {
  const store = createStore()
  store.set(setupConfigAtom, { ...defaultSetupConfig, embeddingProvider: 'disabled', ...patch })
  store.set(setupStepAtom, 2)
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

/** The CLI of Claude Code is absent in these tests; the probe of Codex is the variable. */
function machine(codex: { installed: boolean; version: string | null; path: string | null } | 'unanswered') {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'check_cli_status') return { installed: false, version: null }
    if (cmd === 'check_codex_status') {
      if (codex === 'unanswered') return new Promise(() => {})
      return codex
    }
    return null
  })
}

describe('setup wizard: Codex and another provider', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('shows Codex as a third card, with its detected version', async () => {
    machine({ installed: true, version: '0.9.1', path: '/usr/local/bin/codex' })
    renderChat()
    expect(await screen.findByRole('radio', { name: /^Codex/ })).toBeTruthy()
    expect(await screen.findByText('codex 0.9.1 found on this computer.')).toBeTruthy()
    expect(invokeMock).toHaveBeenCalledWith('check_codex_status')
  })

  it('says so when codex is not on the PATH, without installing anything', async () => {
    machine({ installed: false, version: null, path: null })
    renderChat()
    expect(await screen.findByText(/codex was not found on the PATH/)).toBeTruthy()
    expect(invokeMock).not.toHaveBeenCalledWith('install_cli', expect.anything())
  })

  it('a probe still running reads as "looking", never as installed', async () => {
    machine('unanswered')
    renderChat()
    expect(await screen.findByText(/Looking for the codex program/)).toBeTruthy()
  })

  it('choosing Codex records it as pending and keeps the config on none', async () => {
    machine({ installed: true, version: '0.9.1', path: '/x/codex' })
    const store = renderChat()
    fireEvent.click(await screen.findByRole('radio', { name: /^Codex/ }))
    expect(store.get(setupConfigAtom).chatProvider).toBe('none')
    const pending = store.get(pendingSetupProviderAtom)
    expect(pending).toMatchObject({ id: 'codex', kind: 'codex', credential_ref: 'none' })
  })

  it('choosing another provider shows its form and records a vault reference, never a key', async () => {
    machine({ installed: false, version: null, path: null })
    const store = renderChat()
    fireEvent.click(await screen.findByRole('radio', { name: /another provider/i }))
    const vault = await screen.findByPlaceholderText('deepseek-key')
    fireEvent.change(vault, { target: { value: 'deepseek-key' } })
    await waitFor(() =>
      expect(store.get(pendingSetupProviderAtom)).toMatchObject({
        id: 'deepseek',
        kind: 'openai_compatible',
        credential_ref: 'vault:deepseek-key',
      }),
    )
    expect(JSON.stringify(store.get(pendingSetupProviderAtom))).not.toMatch(/sk-/)
  })

  it('an invalid id is shown and nothing is recorded as pending', async () => {
    machine({ installed: false, version: null, path: null })
    const store = renderChat()
    fireEvent.click(await screen.findByRole('radio', { name: /another provider/i }))
    fireEvent.change(await screen.findByPlaceholderText('deepseek'), { target: { value: 'Bad Id' } })
    expect(await screen.findByTestId('setup-other-provider-error')).toBeTruthy()
    expect(store.get(pendingSetupProviderAtom)).toBeNull()
  })

  it('choosing Claude Code clears a pending provider left by another card', async () => {
    machine({ installed: true, version: '0.9.1', path: '/x/codex' })
    const store = renderChat()
    fireEvent.click(await screen.findByRole('radio', { name: /^Codex/ }))
    expect(store.get(pendingSetupProviderAtom)).not.toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /^Claude Code/ }))
    expect(store.get(pendingSetupProviderAtom)).toBeNull()
  })
})
