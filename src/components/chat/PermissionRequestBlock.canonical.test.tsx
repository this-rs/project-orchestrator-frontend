/**
 * An approval of a network tool names the ORIGIN it reaches, whatever name the
 * tool arrives under: `mcp__nexus__WebFetch` with no `tool_canonical` stamped
 * is still WebFetch (its canonical name, N17), and the browser's tools that
 * move to a page are web calls (N23). The block itself is unchanged: this pins
 * the classification it reads (`getToolCategory`).
 *
 * Run with: npx vitest run src/components/chat/PermissionRequestBlock.canonical.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ContentBlock } from '@/types'
import { CLAUDE_CODE_CAPABILITIES } from '@/types/provider'
import { chatSessionIdAtom } from '@/atoms'
import { ChatCapabilitiesProvider, ChatSessionProvider } from './ChatSessionContext'
import { PermissionRequestBlock } from './PermissionRequestBlock'

function mount(ui: ReactNode) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  return render(
    <Provider store={store}>
      <ChatCapabilitiesProvider capabilities={CLAUDE_CODE_CAPABILITIES}>
        <ChatSessionProvider sessionId="s1">{ui}</ChatSessionProvider>
      </ChatCapabilitiesProvider>
    </Provider>,
  )
}

/** No `tool_canonical`, no `tool_category`: only the name says what the tool is. */
const request = (tool: string, input: Record<string, unknown>): ContentBlock => ({
  id: 'b1',
  type: 'permission_request',
  content: '',
  metadata: { tool_call_id: 'c1', tool_name: tool, tool_input: input },
})

describe('PermissionRequestBlock — network tools by canonical name', () => {
  it('mcp__nexus__WebFetch without a canonical stamp names the origin, like WebFetch', () => {
    mount(<PermissionRequestBlock block={request('mcp__nexus__WebFetch', { url: 'https://docs.rs/serde' })} onRespond={() => true} />)
    expect(screen.getByText('Web: https://docs.rs')).toBeTruthy()
  })

  it('the browser moving to a page is a web approval that names the origin', () => {
    mount(
      <PermissionRequestBlock
        block={request('mcp__browser__browser_navigate', { url: 'https://example.org/a' })}
        onRespond={() => true}
      />,
    )
    expect(screen.getByText('Web: https://example.org')).toBeTruthy()
  })
})
