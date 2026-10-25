/**
 * `tool_engine_not_installed` in the transcript: a limit of the BUILD (no built-in engine on this
 * installation), never of the model, with the way out. Any other refusal, or a success whose text
 * merely mentions the code, says nothing.
 *
 * Run with: npx vitest run src/components/chat/ToolEngineMissingNote.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import type { ContentBlock } from '@/types'

vi.mock('@/services', () => ({ chatApi: { cancelTools: vi.fn() } }))

import { ChatSessionProvider } from './ChatSessionContext'
import { ToolCallBlock } from './ToolCallBlock'

const use: ContentBlock = {
  id: 'tu',
  type: 'tool_use',
  content: 'WebSearch',
  metadata: { tool_call_id: 'c1', tool_name: 'WebSearch', tool_input: { query: 'x' }, created_at: new Date().toISOString() },
}
const result = (content: string, is_error: boolean): ContentBlock => ({
  id: 'tr',
  type: 'tool_result',
  content,
  metadata: { tool_call_id: 'c1', is_error },
})

function mount(res: ContentBlock) {
  return render(
    <Provider store={createStore()}>
      <MemoryRouter>
        <ChatSessionProvider sessionId="s1">
          <ToolCallBlock block={use} resultBlock={res} />
        </ChatSessionProvider>
      </MemoryRouter>
    </Provider>,
  )
}

describe('tool_engine_not_installed', () => {
  it('is said as a limit of the build, with a link to Settings → Network tools', () => {
    mount(result('tool_engine_not_installed: no engine', true))
    const note = screen.getByTestId('tool-engine-missing')
    expect(note.textContent).toContain('limit of the build, not of the model')
    expect(note.textContent).toContain('Brave or SearXNG')
    expect(note.textContent).toContain('dsh-obscura-nav')
    expect(screen.getByRole('link', { name: 'Settings → Network tools' }).getAttribute('href')).toBe('/providers#network-tools')
  })

  it('is absent for another typed refusal', () => {
    mount(result('tool_origin_not_allowed: https://x', true))
    expect(screen.queryByTestId('tool-engine-missing')).toBeNull()
  })

  it('is absent when the text only mentions the code and the call did not fail', () => {
    mount(result('tool_engine_not_installed: quoted in a page', false))
    expect(screen.queryByTestId('tool-engine-missing')).toBeNull()
  })
})
