/**
 * The composer's permission-mode selector: Claude wording for a Claude Code
 * session (unchanged), neutral wording and a refused `trust` for a third-party
 * provider without a sandbox.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.toolPolicy.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import {
  chatPermissionConfigAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionPermissionOverrideAtom,
  chatSessionProviderAtom,
  chatSessionToolPolicyAtom,
} from '@/atoms'
import { TRUST_DOWNGRADED_TEXT, TRUST_REQUIRES_SANDBOX_TEXT } from '@/constants/toolPolicy'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => new Promise(() => {}) },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

type Store = ReturnType<typeof createStore>

function mount({ mode = 'default', sessionId = 's1' as string | null, prepare }: { mode?: string; sessionId?: string | null; prepare?: (store: Store) => void } = {}) {
  const store = createStore()
  store.set(chatSessionIdAtom, sessionId)
  store.set(chatPermissionConfigAtom, { mode: mode as never, allowed_tools: [], disallowed_tools: [] })
  prepare?.(store)
  const onChangePermissionMode = vi.fn()
  render(
    <Provider store={store}>
      <ChatInput
        onSend={() => {}}
        onQueue={() => {}}
        onQueueOp={() => {}}
        onInterrupt={() => {}}
        isStreaming={false}
        sessionId={sessionId}
        onChangePermissionMode={onChangePermissionMode}
      />
    </Provider>,
  )
  return { store, onChangePermissionMode }
}

/** Open the mode menu from its trigger (the button showing the current mode). */
function openMenu(currentLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${currentLabel}`) }))
}

const thirdParty = (capabilities: Record<string, unknown> = {}) => (store: Store) => {
  store.set(chatSessionProviderAtom, { id: 'local-llama', kind: 'openai_compatible' })
  store.set(chatSessionCapabilitiesSnapshotAtom, capabilities)
}

describe('ChatInput — permission mode selector, Claude Code', () => {
  it('lists the four modes with the labels it always had', () => {
    mount()
    openMenu('Default')
    const labels = ["Rock'n roll", 'Accept Edits', 'Default', 'Plan Only']
    for (const label of labels) {
      expect(screen.getAllByRole('button', { name: new RegExp(`^${label}`) }).length).toBeGreaterThan(0)
    }
    expect(screen.queryByText(TRUST_REQUIRES_SANDBOX_TEXT)).toBeNull()
  })

  it.each([
    ['bypassPermissions', "Rock'n roll"],
    ['acceptEdits', 'Accept Edits'],
    ['default', 'Default'],
    ['plan', 'Plan Only'],
    ['manual', 'Default'],
    // CLI-only modes: shown under their own name, not as `undefined`.
    ['auto', 'Auto'],
    ['dontAsk', "Don't Ask"],
    // Nobody knows this one: the least permissive interactive mode.
    ['yolo', 'Default'],
  ])('shows the server mode %s as "%s"', (mode, label) => {
    mount({ mode })
    expect(screen.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeTruthy()
  })

  it('shows the native mode of the session policy while it is the mode in force', () => {
    mount({
      prepare: (store) => {
        store.set(chatSessionPermissionOverrideAtom, 'auto_edits')
        store.set(chatSessionToolPolicyAtom, { mode: 'auto_edits', native_mode: 'auto', allow: [], deny: [] })
      },
    })
    expect(screen.getByRole('button', { name: /^Auto$/ })).toBeTruthy()
  })

  it("hands the picked mode over as a neutral mode, Rock'n roll included", () => {
    const { onChangePermissionMode } = mount()
    openMenu('Default')
    const bypass = screen.getByRole('button', { name: /^Rock/ })
    expect(bypass.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(bypass)
    expect(onChangePermissionMode).toHaveBeenCalledWith('trust')
  })

  it('before a session exists, picking a mode sets the override and picking the server default clears it', () => {
    const { store, onChangePermissionMode } = mount({ sessionId: null })
    openMenu('Default')
    fireEvent.click(screen.getByRole('button', { name: /^Accept Edits/ }))
    expect(store.get(chatSessionPermissionOverrideAtom)).toBe('auto_edits')
    openMenu('Accept Edits')
    fireEvent.click(screen.getByRole('button', { name: /^Default/ }))
    expect(store.get(chatSessionPermissionOverrideAtom)).toBeNull()
    expect(onChangePermissionMode).not.toHaveBeenCalled()
  })
})

describe('ChatInput — permission mode selector, third-party provider', () => {
  it('uses the neutral labels', () => {
    mount({ prepare: thirdParty({ sandbox: 'workspace' }) })
    openMenu('Ask')
    for (const label of ["Rock'n roll", 'Auto-approve edits', 'Plan only']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeTruthy()
    }
    expect(screen.queryByText('Bypass')).toBeNull()
  })

  it('refuses Trust without a sandbox: disabled for assistive tech, explained in visible text, still focusable', () => {
    const { onChangePermissionMode } = mount({ prepare: thirdParty({ sandbox: 'none' }) })
    openMenu('Ask')
    const trust = screen.getByRole('button', { name: /^Rock/ }) as HTMLButtonElement
    expect(trust.getAttribute('aria-disabled')).toBe('true')
    // Not the native `disabled`: the option stays reachable with the keyboard.
    expect(trust.disabled).toBe(false)
    const help = document.getElementById(trust.getAttribute('aria-describedby') ?? '')
    expect(help?.textContent).toBe(TRUST_REQUIRES_SANDBOX_TEXT)
    expect(within(trust).getByText(TRUST_REQUIRES_SANDBOX_TEXT)).toBeTruthy()

    fireEvent.click(trust)
    expect(onChangePermissionMode).not.toHaveBeenCalled()
    // The other modes still work.
    fireEvent.click(screen.getByRole('button', { name: /^Plan only/ }))
    expect(onChangePermissionMode).toHaveBeenCalledWith('plan_only')
  })

  it('offers Trust when the provider sandboxes its tools', () => {
    const { onChangePermissionMode } = mount({ prepare: thirdParty({ sandbox: 'full' }) })
    openMenu('Ask')
    const trust = screen.getByRole('button', { name: /^Rock/ })
    expect(trust.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(trust)
    expect(onChangePermissionMode).toHaveBeenCalledWith('trust')
  })
})

describe('ChatInput — trust downgraded when a provider without a sandbox is targeted', () => {
  it('a new conversation with trust in force on such a provider: replaced by ask, and said', () => {
    const { store } = mount({ mode: 'bypassPermissions', sessionId: null, prepare: thirdParty() })
    expect(store.get(chatSessionPermissionOverrideAtom)).toBe('ask')
    expect(screen.getByTestId('trust-downgraded').textContent).toContain(TRUST_DOWNGRADED_TEXT)
  })

  it('Claude Code keeps trust, with no notice', () => {
    const { store } = mount({ mode: 'bypassPermissions', sessionId: null })
    expect(store.get(chatSessionPermissionOverrideAtom)).toBeNull()
    expect(screen.queryByTestId('trust-downgraded')).toBeNull()
  })
})

describe('ChatInput — controls row never overflows', () => {
  it('the chips share one wrapping, shrinkable group; attach and send stay outside it', () => {
    mount({ sessionId: null })
    const row = screen.getByTestId('composer-controls')
    const chips = screen.getByTestId('composer-chips')
    expect(chips.className).toMatch(/\bflex-wrap\b/)
    expect(chips.className).toMatch(/\bmin-w-0\b/)
    expect(chips.className).toMatch(/\bflex-1\b/)
    expect(chips.parentElement).toBe(row)
    expect(within(chips).queryByRole('button', { name: 'Attach a file' })).toBeNull()
    expect(within(row).getByRole('button', { name: 'Attach a file' })).toBeTruthy()
  })

  it('a long model name is truncated with the full name as a tooltip', () => {
    mount({ sessionId: null })
    const chip = screen.getByTestId('model-chip')
    const label = chip.querySelector('span.truncate') as HTMLElement
    expect(label.className).toContain('min-w-0')
    expect(label.getAttribute('title')).toBe(label.textContent)
  })
})
