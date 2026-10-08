import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const chat = vi.hoisted(() => ({ interruptSession: vi.fn() }))
vi.mock('@/services/chat', () => ({ chatApi: chat }))
vi.mock('@/services/auth', () => ({ fetchWsTicket: vi.fn(async () => null) }))
// Partial mock: the shared chat rendering pulls services/api, which reads `isTauri` from env.
vi.mock('@/services/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/env')>()),
  wsUrl: (p: string) => `ws://x${p}`,
}))
vi.mock('@/hooks', () => ({ useWorkspaceSlug: () => 'acme' }))
vi.mock('@/services/wsAdapter', () => ({
  ReadyState: { OPEN: 1 },
  createWebSocket: vi.fn(async (_url: string, handlers: { onmessage: (e: MessageEvent) => void }) => {
    queueMicrotask(() => handlers.onmessage({ data: JSON.stringify({ type: 'auth_ok' }) } as MessageEvent))
    return { readyState: 0, send: vi.fn(), close: vi.fn() }
  }),
}))

import { InlineConversationPanel } from '../InlineConversationPanel'

const renderPanel = (onClose = vi.fn()) =>
  render(
    <MemoryRouter>
      <InlineConversationPanel sessionId="s1" title="Ma session" onClose={onClose} />
    </MemoryRouter>,
  )

describe('InlineConversationPanel header', () => {
  // braces matter: a beforeEach that RETURNS the mock makes vitest call it as a cleanup hook
  beforeEach(() => {
    chat.interruptSession.mockReset()
  })

  it('every control has an accessible name and a 36 px target, and they are not glued together', async () => {
    renderPanel()
    const stop = await screen.findByRole('button', { name: /Arrêter l'assistant de cette session/ })
    const full = screen.getByRole('button', { name: 'Ouvrir la conversation complète' })
    const close = screen.getByRole('button', { name: 'Fermer la conversation' })
    for (const b of [stop, full, close]) expect(b.className).toContain('h-9')
    expect(full.className).toContain('w-9')
    expect(close.className).toContain('w-9')
    expect(stop.parentElement!.className).toContain('gap-3')
  })

  it('Stop asks for confirmation first: one tap never interrupts a live assistant', async () => {
    chat.interruptSession.mockResolvedValue({ delivered: true })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Arrêter l'assistant de cette session/ }))
    expect(chat.interruptSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: "Arrêter l'assistant" }))
    await waitFor(() => expect(chat.interruptSession).toHaveBeenCalledWith('s1'))
  })

  it('cancelling the confirmation sends nothing', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Arrêter l'assistant de cette session/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(chat.interruptSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('a failed Stop is said on screen, not only in the console', async () => {
    chat.interruptSession.mockRejectedValue(new Error('réseau coupé'))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Arrêter l'assistant de cette session/ }))
    fireEvent.click(screen.getByRole('button', { name: "Arrêter l'assistant" }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("L'arrêt a échoué")
    expect(alert.textContent).toContain('réseau coupé')
  })
})
