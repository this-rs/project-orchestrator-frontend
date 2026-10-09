/**
 * The conversation page is a reference source: its title is draggable and an
 * "Add to chat" button sits next to it.
 *
 * Run with: npx vitest run src/pages/ChatSessionPage.refs.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { chatServerFeaturesAtom } from '@/atoms'
import kindsFixture from '@/refs/__fixtures__/kinds_response.json'
import { clearRefKinds, parseKindsResponse, setActiveKinds } from '@/refs/kinds'

vi.mock('@/hooks/runner', () => ({ useConversationWs: () => ({ messages: [], status: 'connected' }) }))
vi.mock('@/hooks', () => ({
  useDetachedRuns: () => ({ runs: [], hasActiveRuns: false }),
  useWorkspaceSlug: () => 'po',
}))
vi.mock('@/hooks/useStickToBottom', () => ({ useStickToBottom: () => ({ scrollRef: { current: null }, scrollToBottom: () => {} }) }))

import ChatSessionPage from './ChatSessionPage'

const SESSION = '6c9f3a1e-8d24-4b7a-9e51-2f0a4c7d8b13'

function mount(features: string[]) {
  const store = createStore()
  store.set(chatServerFeaturesAtom, features)
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/workspace/po/chat/${SESSION}`]}>
        <Routes>
          <Route path="/workspace/po/chat/:sessionId" element={<ChatSessionPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('ChatSessionPage as a reference source', () => {
  beforeEach(() => setActiveKinds(parseKindsResponse(kindsFixture.response)!))
  afterEach(() => clearRefKinds())

  it('declares the conversation on its title block (draggable) and offers a button', () => {
    mount(['refs_v1'])
    const title = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement
    expect(title.getAttribute('data-po-ref')).toBe(`conversation:${SESSION}`)
    expect(title.getAttribute('draggable')).toBe('true')
    expect(screen.getByRole('button', { name: /^Add .* to chat$/ })).toBeTruthy()
  })

  it('is exactly what it was without refs_v1', () => {
    mount([])
    const title = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement
    expect(title.hasAttribute('data-po-ref')).toBe(false)
    expect(screen.queryByRole('button', { name: /to chat$/ })).toBeNull()
  })
})
