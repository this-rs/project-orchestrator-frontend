/**
 * Every panel that can sit over the scrolling conversation has a readable base surface and a
 * backdrop blur, so message text never shows through it.
 *
 * Run with: npx vitest run src/components/ui/panelGlass.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatSecretRequestsAtom } from '@/atoms'
import { SecretRequestTray } from '@/components/chat/SecretRequestTray'
import { EngineBanner } from '@/components/chat/EngineBanner'
import { PolicyOnlyBanner } from '@/components/chat/PolicyOnlyBanner'
import { ProviderStateCard } from '@/components/chat/ProviderStateCard'
import { SessionOpenError } from '@/components/chat/SessionOpenError'
import { CompactionBanner } from '@/components/chat/CompactionBanner'
import { ToastContainer } from '@/components/ui/Toast'
import { toastMessagesAtom } from '@/atoms'

vi.mock('@/services/vault', async (orig) => {
  const actual = await orig<typeof import('@/services/vault')>()
  return {
    ...actual,
    vaultApi: {
      overview: () =>
        Promise.resolve({ initialized: true, unlocked_until: null, secret_count: 0, unavailable: null, secrets: [], grants: [], requests: [] }),
    },
    hasUnlockProof: () => false,
  }
})

/** A base surface that is mostly opaque (alpha >= 60) — not a 5-10% tint. */
function expectGlass(el: HTMLElement) {
  expect(el.className).toContain('backdrop-blur-md')
  const base = /(?:^|\s)bg-surface-base\/(\d+)(?:\s|$)/.exec(el.className)
  expect(base, `no readable base surface on: ${el.className}`).not.toBeNull()
  expect(Number(base![1])).toBeGreaterThanOrEqual(60)
}

function wrap(ui: React.ReactElement, store = createStore()) {
  return render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  )
}

describe('panels over the conversation are glass', () => {
  beforeEach(() => vi.clearAllMocks())

  it('the vault passphrase / secret request card', async () => {
    const store = createStore()
    store.set(chatSecretRequestsAtom, [{ id: 'r1', name: 'dummy-token', reason: 'test', exists: false }])
    wrap(<SecretRequestTray sessionId="s1" />, store)
    const form = await waitFor(() => {
      const f = document.querySelector('form')
      expect(f).not.toBeNull()
      return f as HTMLElement
    })
    expectGlass(form)
    expect(form.className).toContain('border-amber-500') // amber identity kept
    expect(form.className).toContain('from-amber-500/10')
  })

  it('the engine banner', () => {
    wrap(<EngineBanner degraded={['hooks']} />)
    const el = screen.getByTestId('engine-banner')
    expectGlass(el)
    expect(el.className).toContain('from-amber-500/10')
  })

  it('the policy-only banner', () => {
    wrap(<PolicyOnlyBanner />)
    const el = screen.getByRole('note')
    expectGlass(el)
    expect(el.className).toContain('from-amber-500/10')
  })

  it('the provider state card, when it floats above the composer', () => {
    wrap(<ProviderStateCard floating error={{ code: 'endpoint_unreachable', message: '' }} />)
    const el = screen.getByTestId('provider-state-card')
    expectGlass(el)
    expect(el.className).toContain('from-red-500/10')
  })

  it('the provider state card stays a flat tint inside the message flow', () => {
    wrap(<ProviderStateCard error={{ code: 'endpoint_unreachable', message: '' }} />)
    const el = screen.getByTestId('provider-state-card')
    expect(el.className).not.toContain('backdrop-blur')
    expect(el.className).toContain('bg-red-500/10')
  })

  it('the session-open error, typed and untyped', () => {
    const { unmount } = wrap(
      <SessionOpenError error={{ message: 'x', info: { code: 'endpoint_unreachable', message: '' } } as never} onDismiss={() => {}} />,
    )
    expectGlass(screen.getByTestId('session-open-error'))
    unmount()
    wrap(<SessionOpenError error={{ message: 'boom' } as never} onDismiss={() => {}} />)
    const el = screen.getByTestId('session-open-error')
    expectGlass(el)
    expect(el.className).toContain('from-red-500/10')
  })

  it('the compaction banner, which is text floating over the transcript', () => {
    const { container } = wrap(<CompactionBanner visible />)
    expectGlass(container.firstElementChild as HTMLElement)
  })

  it('a toast floats over the conversation too', () => {
    const store = createStore()
    store.set(toastMessagesAtom, [{ id: 't', type: 'warning', message: 'Heads up' }])
    wrap(<ToastContainer />, store)
    const toast = screen.getByText('Heads up').closest('.rounded-xl') as HTMLElement
    expectGlass(toast)
  })
})
