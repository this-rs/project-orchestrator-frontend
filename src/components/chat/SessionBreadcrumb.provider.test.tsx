import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { providersAtom, providersLoadStateAtom } from '@/atoms'

const getSessionTree = vi.fn()
vi.mock('@/services/chat', () => ({ chatApi: { getSessionTree: (...a: unknown[]) => getSessionTree(...a) } }))

import { SessionBreadcrumb } from './SessionBreadcrumb'

describe('SessionBreadcrumb — providers', () => {
  it('names the provider of each hop; a hop without provider is Claude Code', async () => {
    getSessionTree.mockResolvedValue([
      { session_id: 'r', depth: 0, title: 'Root', is_streaming: false, model: 'claude-opus-4' },
      { session_id: 'c', parent_session_id: 'r', depth: 1, title: 'Child', is_streaming: false, provider_id: 'deepseek', model: 'deepseek-chat' },
    ])
    const store = createStore()
    store.set(providersAtom, {
      providers: [
        { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', health: { status: 'healthy' }, models: [] },
        { id: 'deepseek', kind: 'openai_compatible', label: 'DeepSeek', health: { status: 'healthy' }, models: [] },
      ],
    })
    store.set(providersLoadStateAtom, 'ready')
    render(
      <Provider store={store}>
        <SessionBreadcrumb sessionId="c" rootSessionId="r" onNavigate={vi.fn()} />
      </Provider>,
    )
    await screen.findByText('Child')
    const badges = screen.getAllByTestId('provider-badge').map((b) => b.textContent)
    expect(badges).toEqual(['Claude Code· opus-4', 'DeepSeek· deepseek-chat'])
  })
})
