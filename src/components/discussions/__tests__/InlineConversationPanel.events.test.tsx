/**
 * The panel must show the events the backend REALLY emits (ChatEvent):
 * `assistant_text`, `tool_use { tool, input }`, `session_error`.
 *
 * Its private parser predated that shape: it read `tool_use.name` (the backend
 * sends `tool`), so every tool showed up as the generic name "tool" followed by the
 * raw JSON of its input — the red test below.
 * `assistant_text` and `session_error` were already shown (the latter since
 * frontend#198) and are kept as guards: going through the shared assembler
 * must not lose them.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const ws = vi.hoisted(() => ({ onmessage: null as null | ((e: MessageEvent) => void) }))
vi.mock('@/services/chat', () => ({ chatApi: { interruptSession: vi.fn() } }))
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
    ws.onmessage = handlers.onmessage
    queueMicrotask(() => handlers.onmessage({ data: JSON.stringify({ type: 'auth_ok' }) } as MessageEvent))
    return { readyState: 1, send: vi.fn(), close: vi.fn() }
  }),
}))

import { InlineConversationPanel } from '../InlineConversationPanel'

const emit = (evt: object) =>
  act(async () => {
    ws.onmessage!({ data: JSON.stringify(evt) } as MessageEvent)
  })

const renderPanel = () =>
  render(
    <MemoryRouter>
      <InlineConversationPanel sessionId="s1" title="Ma session" onClose={() => {}} />
    </MemoryRouter>,
  )

describe('InlineConversationPanel — backend event shapes', () => {
  it('shows a tool call as a tool call, not as the raw JSON dump labelled "tool"', async () => {
    renderPanel()
    await screen.findByText('Ma session')
    await emit({ type: 'user_message', content: 'lance les tests' })
    await emit({ type: 'tool_use', id: 't1', tool: 'Bash', input: { command: 'cargo test' } })
    expect((await screen.findAllByText(/cargo test/)).length).toBeGreaterThan(0)
    // The private parser read `tool_use.name` (absent: the backend sends `tool`) and printed
    // the whole input as JSON under the generic name "tool".
    expect(screen.queryByText(/"command"/)).toBeNull()
  })

  it('shows assistant_text as the assistant speaking', async () => {
    renderPanel()
    await screen.findByText('Ma session')
    await emit({ type: 'user_message', content: 'salut' })
    await emit({ type: 'assistant_text', content: 'Bonjour, je regarde ça.' })
    expect(await screen.findByText(/Bonjour, je regarde ça\./)).toBeTruthy()
    expect(screen.queryByText('Event')).toBeNull()
  })

  it('shows the death of the CLI', async () => {
    renderPanel()
    await screen.findByText('Ma session')
    await emit({ type: 'user_message', content: 'go' })
    await emit({ type: 'session_error', reason: 'subprocess_died', message: 'CLI process exited' })
    expect(await screen.findByText(/CLI process exited \(subprocess_died\)/)).toBeTruthy()
  })
})
