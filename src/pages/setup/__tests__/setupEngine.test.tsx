import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { setupConfigAtom, setupStepAtom, defaultSetupConfig, withSetupModelFallback, type SetupConfig } from '@/atoms/setup'

const invokeMock = vi.hoisted(() => vi.fn())
const envMock = vi.hoisted(() => ({ tauri: true }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@/services/env', () => ({
  get isTauri() {
    return envMock.tauri
  },
  fetchSetupStatus: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  useDragRegion: () => ({}),
}))

import { ChatPage } from '../ChatPage'
import { LaunchPage } from '../LaunchPage'
import { SetupWizard } from '../SetupWizard'

function renderWith(ui: React.ReactElement, patch: Partial<SetupConfig> = {}, step = 2) {
  const store = createStore()
  store.set(setupConfigAtom, { ...defaultSetupConfig, embeddingProvider: 'disabled', ...patch })
  store.set(setupStepAtom, step)
  render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  )
  return store
}

function cli(installed: boolean) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'check_cli_status') return { installed, version: installed ? '1.0.0' : null }
    if (cmd === 'generate_config') return '/tmp/config.yaml'
    return null
  })
}

const next = () => screen.getByRole('button', { name: /next/i })

describe('setup wizard: chat engine choice', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    envMock.tauri = true
  })

  it('keeps the Claude Code path unchanged: CLI section shown, step blocked until the CLI is found', async () => {
    cli(false)
    renderWith(<SetupWizard />)
    expect(await screen.findByText('Claude Code CLI')).toBeTruthy()
    expect(screen.getByText('Default Model')).toBeTruthy()
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('check_cli_status'))
    expect((next() as HTMLButtonElement).disabled).toBe(true)
  })

  it('Claude Code chosen with the CLI present: the step can be passed', async () => {
    cli(true)
    renderWith(<SetupWizard />)
    await waitFor(() => expect((next() as HTMLButtonElement).disabled).toBe(false))
  })

  it('another provider: no CLI needed, Claude fields hidden, step passable', async () => {
    cli(false)
    renderWith(<SetupWizard />)
    await screen.findByText('Claude Code CLI')
    fireEvent.click(screen.getByRole('radio', { name: /another provider/i }))
    expect(screen.queryByText('Claude Code CLI')).toBeNull()
    expect(screen.queryByText('Default Model')).toBeNull()
    expect(screen.queryByText('Configure MCP')).toBeNull()
    expect(screen.getByTestId('setup-no-engine-note').textContent).toMatch(/Settings/)
    await waitFor(() => expect((next() as HTMLButtonElement).disabled).toBe(false))
  })

  it('another provider still waits for the embedding model (local, not downloaded)', async () => {
    cli(false)
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'check_embedding_model') return { available: false, cachePath: null, estimatedSizeMb: 100 }
      return null
    })
    renderWith(<SetupWizard />, { embeddingProvider: 'local', chatProvider: 'none' })
    await waitFor(() => expect((next() as HTMLButtonElement).disabled).toBe(true))
  })

  it('selecting the engine writes chatProvider without touching Claude fields', async () => {
    cli(false)
    const store = renderWith(<ChatPage />)
    fireEvent.click(await screen.findByRole('radio', { name: /another provider/i }))
    const c = store.get(setupConfigAtom)
    expect(c.chatProvider).toBe('none')
    expect(c.chatClaudeCliPath).toBe('')
    fireEvent.click(screen.getByRole('radio', { name: /^Claude Code/ }))
    expect(store.get(setupConfigAtom).chatProvider).toBe('claude-code')
  })
})

describe('setup wizard: launch summary and generated config', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    envMock.tauri = true
    cli(true)
  })

  it('summarises a non-Claude choice and links to /providers after generation', async () => {
    renderWith(<LaunchPage />, { chatProvider: 'none', chatModel: 'x' }, 3)
    expect(screen.getByText('Chat provider')).toBeTruthy()
    expect(screen.getByText(/To configure in Settings/)).toBeTruthy()
    expect(screen.queryByText('Chat Model')).toBeNull()
    expect(screen.queryByText('Auto-update CLI')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /generate config/i }))
    const link = await screen.findByRole('link', { name: /add a chat provider/i })
    expect(link.getAttribute('href')).toBe('/providers')
    const [, args] = invokeMock.mock.calls.find((c) => c[0] === 'generate_config')!
    expect(args.config.chatProvider).toBe('none')
    expect(args.config.chatModel).toBe('')
    expect(args.config.chatClaudeCliPath).toBe('')
    expect(args.config.chatAutoUpdateCli).toBe(false)
  })

  it('Claude Code summary is unchanged and keeps the model fallback', async () => {
    renderWith(<LaunchPage />, { chatModel: '' }, 3)
    expect(screen.getByText('Chat Model')).toBeTruthy()
    expect(screen.queryByText('Chat provider')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /generate config/i }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('generate_config', expect.anything()))
    const [, args] = invokeMock.mock.calls.find((c) => c[0] === 'generate_config')!
    expect(args.config.chatProvider).toBe('claude-code')
    expect(args.config.chatModel).not.toBe('')
    expect(screen.queryByRole('link', { name: /add a chat provider/i })).toBeNull()
  })

  it('withSetupModelFallback never invents Claude values for another provider', () => {
    const out = withSetupModelFallback({ ...defaultSetupConfig, chatProvider: 'none' as const, chatClaudeCliPath: '/x', chatAutoUpdateCli: true })
    expect(out.chatModel).toBe('')
    expect(out.chatClaudeCliPath).toBe('')
    expect(out.chatAutoUpdateCli).toBe(false)
  })
})

describe('setup wizard: re-reading an existing config', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    envMock.tauri = true
    window.history.pushState({}, '', '/setup?from=tray')
  })

  async function reread(existing: Record<string, unknown>) {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'read_config' ? existing : null))
    const { trayNavigationAtom } = await import('@/atoms/setup')
    const store = createStore()
    store.set(trayNavigationAtom, true)
    store.set(setupStepAtom, 3)
    render(
      <Provider store={store}>
        <MemoryRouter>
          <SetupWizard />
        </MemoryRouter>
      </Provider>,
    )
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('read_config'))
    await waitFor(() => expect(store.get(setupConfigAtom).serverPort).toBe(7777))
    return store
  }

  it('a config without chatProvider is Claude Code', async () => {
    const store = await reread({ serverPort: 7777, chatModel: 'claude-opus-4' })
    expect(store.get(setupConfigAtom).chatProvider).toBe('claude-code')
    expect(store.get(setupConfigAtom).chatModel).toBe('claude-opus-4')
  })

  it('chatProvider "none" is kept', async () => {
    const store = await reread({ serverPort: 7777, chatProvider: 'none' })
    expect(store.get(setupConfigAtom).chatProvider).toBe('none')
  })
})
