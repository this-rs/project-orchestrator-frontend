/**
 * ResultErrorBlock — error blocks with and without actionable provider codes.
 *
 * T3 (Coffre verrouillé): a `result_error` block with `credentials_locked` code
 * renders the unlock card (ProviderStateCard + LockedVaultActions) instead of
 * the generic red error box.
 *
 * Run with: npx vitest run src/components/chat/ResultErrorBlock.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ContentBlock, ChatMessage } from '@/types'
import { providersAtom, providersLoadStateAtom } from '@/atoms'

// Mock vault API for unlock tests
const unlockVault = vi.fn()
vi.mock('@/services/vault', async (orig) => ({
  ...(await orig<typeof import('@/services/vault')>()),
  vaultApi: { unlock: (...a: unknown[]) => unlockVault(...a) },
}))

// Mock providers API
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: { list: vi.fn().mockResolvedValue({ providers: [], default: null }), status: vi.fn().mockResolvedValue({ status: 'healthy' }) },
}))

import { ChatMessageBubble } from './ChatMessageBubble'
import { ChatSessionProvider, ChatCapabilitiesProvider } from './ChatSessionContext'
import { CLAUDE_CODE_CAPABILITIES } from '@/types/provider'

const noop = vi.fn()

function makeMessage(blocks: ContentBlock[]): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    blocks,
    timestamp: new Date(),
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const store = createStore()
  store.set(providersAtom, { providers: [], default: null, aliases: [] })
  store.set(providersLoadStateAtom, 'ready')
  return (
    <Provider store={store}>
      <MemoryRouter>
        <ChatSessionProvider sessionId="sess-1">
          <ChatCapabilitiesProvider capabilities={CLAUDE_CODE_CAPABILITIES}>
            {children}
          </ChatCapabilitiesProvider>
        </ChatSessionProvider>
      </MemoryRouter>
    </Provider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  unlockVault.mockReset()
  try { sessionStorage.clear() } catch { /* ignore */ }
})

describe('ResultErrorBlock — non-actionable errors', () => {
  it('renders the red error box for a result_error without provider_error', () => {
    const block: ContentBlock = {
      id: 'err-1',
      type: 'result_error',
      content: 'Some execution error occurred',
      metadata: { result_text: 'failed', error_code: undefined },
    }
    render(
      <ChatMessageBubble
        message={makeMessage([block])}
        onRespondPermission={noop}
        onRespondInput={noop}
      />,
      { wrapper },
    )
    // The red error box should be shown
    const errorBox = screen.getByText('Execution error')
    expect(errorBox).toBeInTheDocument()
    expect(screen.getByText('Some execution error occurred')).toBeInTheDocument()
    // No provider state card
    expect(screen.queryByTestId('provider-state-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('locked-vault-actions')).not.toBeInTheDocument()
  })

  it('renders the red error box for unknown error codes', () => {
    const block: ContentBlock = {
      id: 'err-2',
      type: 'result_error',
      content: 'Connection failed',
      metadata: { error_code: 'unknown_code_xyz' },
    }
    render(
      <ChatMessageBubble
        message={makeMessage([block])}
        onRespondPermission={noop}
        onRespondInput={noop}
      />,
      { wrapper },
    )
    expect(screen.getByText('Execution error')).toBeInTheDocument()
    expect(screen.queryByTestId('provider-state-card')).not.toBeInTheDocument()
  })
})

describe('ResultErrorBlock — credentials_locked renders unlock card', () => {
  it('renders ProviderStateCard for credentials_locked code (not the red error box)', () => {
    const block: ContentBlock = {
      id: 'err-lock-1',
      type: 'result_error',
      content: 'The credential vault is locked',
      metadata: {
        provider_error: {
          code: 'credentials_locked',
          message: 'The credential vault is locked: the turn resumes when it is unlocked',
          provider_id: 'openai',
        },
        live_notice: true,
      },
    }
    const onResend = vi.fn()
    render(
      <ChatMessageBubble
        message={makeMessage([block])}
        onRespondPermission={noop}
        onRespondInput={noop}
        onResend={onResend}
      />,
      { wrapper },
    )
    // The unlock card should be shown, not the red error box
    expect(screen.queryByText('Execution error')).not.toBeInTheDocument()
    expect(screen.getByTestId('provider-state-card')).toBeInTheDocument()
    expect(screen.getByTestId('provider-state-card')).toHaveAttribute('data-error-code', 'credentials_locked')
    // Live notice with onResend shows the unlock form
    expect(screen.getByTestId('locked-vault-actions')).toBeInTheDocument()
  })

  it('the unlock card has the passphrase input and unlock button', () => {
    const block: ContentBlock = {
      id: 'err-lock-2',
      type: 'result_error',
      content: 'The credential vault is locked',
      metadata: {
        provider_error: {
          code: 'credentials_locked',
          message: 'The credential vault is locked',
        },
        live_notice: true,
      },
    }
    const onResend = vi.fn()
    render(
      <ChatMessageBubble
        message={makeMessage([block])}
        onRespondPermission={noop}
        onRespondInput={noop}
        onResend={onResend}
      />,
      { wrapper },
    )
    expect(screen.getByPlaceholderText(/passphrase/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
  })
})

describe('ResultErrorBlock — replayed notice from history', () => {
  it('a replayed notice shows the card but no resend action (informative only)', () => {
    const block: ContentBlock = {
      id: 'err-lock-replay',
      type: 'result_error',
      content: 'The credential vault is locked',
      metadata: {
        provider_error: {
          code: 'credentials_locked',
          message: 'The credential vault is locked',
        },
        // Mark as NOT a live notice (replayed from history)
        live_notice: false,
      },
    }
    render(
      <ChatMessageBubble
        message={makeMessage([block])}
        onRespondPermission={noop}
        onRespondInput={noop}
        // Even with onResend, a replayed notice shows no unlock form
        onResend={vi.fn()}
      />,
      { wrapper },
    )
    // The card should be shown but without the unlock form (informative only)
    const card = screen.getByTestId('provider-state-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveAttribute('data-error-code', 'credentials_locked')
    // A replayed notice should link to the vault settings, not show the unlock form
    expect(screen.queryByPlaceholderText(/passphrase/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /unlock the vault/i })).toBeInTheDocument()
  })
})

describe('ResultErrorBlock — unlock triggers resend', () => {
  it('unlocking from the card calls onResend with the original message', async () => {
    const onResend = vi.fn()
    unlockVault.mockResolvedValue(undefined)

    const block: ContentBlock = {
      id: 'err-lock-resend',
      type: 'result_error',
      content: 'The credential vault is locked',
      metadata: {
        provider_error: {
          code: 'credentials_locked',
          message: 'The credential vault is locked',
        },
        live_notice: true,
      },
    }

    render(
      <ChatMessageBubble
        message={makeMessage([block])}
        onRespondPermission={noop}
        onRespondInput={noop}
        onResend={onResend}
      />,
      { wrapper },
    )

    // Fill in passphrase and submit
    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'secret' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)

    await waitFor(() => expect(unlockVault).toHaveBeenCalled())
    await waitFor(() => expect(onResend).toHaveBeenCalledTimes(1))
  })

  it('onResend is called exactly once after unlock (no duplicates)', async () => {
    const onResend = vi.fn()
    unlockVault.mockResolvedValue(undefined)

    const block: ContentBlock = {
      id: 'err-lock-once',
      type: 'result_error',
      content: 'The credential vault is locked',
      metadata: {
        provider_error: {
          code: 'credentials_locked',
          message: 'The credential vault is locked',
        },
        live_notice: true,
      },
    }

    render(
      <ChatMessageBubble
        message={makeMessage([block])}
        onRespondPermission={noop}
        onRespondInput={noop}
        onResend={onResend}
      />,
      { wrapper },
    )

    // Unlock
    fireEvent.change(screen.getByPlaceholderText(/passphrase/i), { target: { value: 'pass' } })
    fireEvent.submit(screen.getByPlaceholderText(/passphrase/i).closest('form')!)

    await waitFor(() => expect(onResend).toHaveBeenCalledTimes(1))

    // Wait a bit to ensure no duplicate calls
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(onResend).toHaveBeenCalledTimes(1)
  })
})

describe('ResultErrorBlock — a turn still waiting for the unlock is not sent twice', () => {
  // The native engine WAITS for the unlock and resumes the same turn (T5). A card
  // that unlocks AND resends during that wait would start a second turn.
  const lockedLive: ContentBlock = {
    id: 'err-lock-waiting',
    type: 'result_error',
    content: 'The credential vault is locked',
    metadata: {
      provider_error: { code: 'credentials_locked', message: 'The credential vault is locked' },
      live_notice: true,
    },
  }

  it('offers no unlock-and-resend form while the turn is running', () => {
    render(
      <ChatMessageBubble
        message={makeMessage([lockedLive])}
        isStreaming
        onRespondPermission={noop}
        onRespondInput={noop}
        onResend={vi.fn()}
      />,
      { wrapper },
    )
    expect(screen.queryByPlaceholderText(/passphrase/i)).toBeNull()
  })

  it('offers it again once the turn has ended', () => {
    render(
      <ChatMessageBubble
        message={makeMessage([lockedLive])}
        isStreaming={false}
        onRespondPermission={noop}
        onRespondInput={noop}
        onResend={vi.fn()}
      />,
      { wrapper },
    )
    expect(screen.getByPlaceholderText(/passphrase/i)).toBeInTheDocument()
  })
})
