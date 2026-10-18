/**
 * A permission request about a NETWORK DESTINATION (N23b) must not describe the scope of the
 * answer as "only this exact call".
 *
 * Measured on backend origin/main a573905e (#801) and nexus 0cf5a20 (#113): a destination the
 * project has not consented to raises the ORDINARY `permission_request` — nexus's
 * `AgentEvent::PermissionAsk` carries no subject on the wire and the backend's `event_map`
 * adds none. So this interface cannot tell an origin question from a plain WebFetch approval,
 * and the old pre-click preview ("covers only: `WebFetch {…}`") was false whenever it was an
 * origin question: `session` is then kept by the harness against the whole origin
 * (`tool\u{0}https://host`) and `always` is written to the project's network consents.
 *
 * These tests pin what this interface may claim: the destination of the CALL, never the scope
 * of the answer, which PO states itself in `permission_decision.rule`.
 *
 * Run with: npx vitest run src/components/chat/PermissionRequestBlock.destination.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ContentBlock } from '@/types'
import { CLAUDE_CODE_CAPABILITIES, type ProviderCapabilities } from '@/types/provider'
import { chatSessionIdAtom } from '@/atoms'
import { ChatCapabilitiesProvider, ChatSessionProvider } from './ChatSessionContext'
import { PermissionRequestBlock } from './PermissionRequestBlock'

/** A session that offers the three scopes: the only case where a preview is shown at all. */
const THREE_SCOPES: ProviderCapabilities = {
  ...CLAUDE_CODE_CAPABILITIES,
  permission_scopes: ['once', 'session', 'always'],
}

function mount(ui: ReactNode, capabilities: ProviderCapabilities = THREE_SCOPES) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  return render(
    <Provider store={store}>
      <ChatCapabilitiesProvider capabilities={capabilities}>
        <ChatSessionProvider sessionId="s1">{ui}</ChatSessionProvider>
      </ChatCapabilitiesProvider>
    </Provider>,
  )
}

/** `always_eligible` is what the backend sets per request; without it `always` is not offered. */
const request = (tool: string, input: Record<string, unknown>): ContentBlock => ({
  id: 'b1',
  type: 'permission_request',
  content: '',
  metadata: {
    tool_call_id: 'c1',
    tool_name: tool,
    tool_input: input,
    tool_canonical: tool === 'mcp__nexus__WebFetch' ? 'WebFetch' : undefined,
    always_eligible: true,
  },
})

describe('PermissionRequestBlock — a network destination', () => {
  it('names the destination with its SCHEME: http and https are two consents, not one', () => {
    mount(<PermissionRequestBlock block={request('WebFetch', { url: 'http://docs.rs/x' })} onRespond={() => true} />)
    // The origin, not the bare hostname: `docs.rs` alone would make the insecure call
    // indistinguishable from the secure one on screen.
    expect(screen.getByText('Web: http://docs.rs')).toBeTruthy()
    expect(screen.queryByText('Web: docs.rs')).toBeNull()
  })

  it('an https destination is named as https', () => {
    mount(<PermissionRequestBlock block={request('WebFetch', { url: 'https://docs.rs/x' })} onRespond={() => true} />)
    expect(screen.getByText('Web: https://docs.rs')).toBeTruthy()
  })

  it('does NOT claim the answer covers only this exact call, and names the destination instead', () => {
    mount(
      <PermissionRequestBlock
        block={request('mcp__nexus__WebFetch', { url: 'http://docs.rs/x' })}
        onRespond={() => true}
      />,
    )
    // The two call-shaped previews are gone for a destination: they said "covers only" and
    // showed the identical call, which an origin question does not honour.
    expect(screen.queryByTestId('permission-session-scope')).toBeNull()
    expect(screen.queryByTestId('permission-always-scope')).toBeNull()
    expect(screen.queryByText(/mcp__nexus__WebFetch \{/)).toBeNull()
    // What is said instead: the destination of the call, and where `always` would be recorded.
    const reach = screen.getByTestId('permission-destination-scope')
    expect(reach.textContent).toContain('This call reaches:')
    expect(reach.textContent).toContain('http://docs.rs')
    expect(screen.getByTestId('permission-destination-always').textContent).toMatch(
      /network consent of this project.*Network tools/,
    )
  })

  it('the destination notice is wired to the buttons it describes (a11y)', () => {
    const { container } = mount(
      <PermissionRequestBlock block={request('WebFetch', { url: 'https://docs.rs/x' })} onRespond={() => true} />,
    )
    const session = container.querySelector('button[data-scope="session"]')!
    const always = container.querySelector('button[data-scope="always"]')!
    // Each button points at a paragraph that EXISTS, so a screen reader reads a description
    // rather than a dangling id.
    const describedBySession = session.getAttribute('aria-describedby')!
    const describedByAlways = always.getAttribute('aria-describedby')!
    expect(container.querySelector(`#${describedBySession}`)).toBeTruthy()
    expect(container.querySelector(`#${describedByAlways}`)).toBeTruthy()
    // And the hover hints no longer promise "this exact call".
    expect(session.getAttribute('title')).not.toMatch(/exact call/)
    expect(always.getAttribute('title')).toMatch(/network consent/)
  })

  it('a call that is NOT a destination keeps the exact-call preview unchanged', () => {
    mount(<PermissionRequestBlock block={request('Bash', { command: 'git status' })} onRespond={() => true} />)
    // A command's grant really is the identical call: that wording stays, and no destination
    // line appears.
    expect(screen.getByTestId('permission-session-scope').textContent).toContain('Bash: git status')
    expect(screen.queryByTestId('permission-destination-scope')).toBeNull()
    expect(screen.queryByTestId('permission-destination-always')).toBeNull()
  })

  it('a web call whose url cannot be parsed is not treated as a destination', () => {
    mount(<PermissionRequestBlock block={request('WebFetch', { url: 'not a url' })} onRespond={() => true} />)
    // No origin could be named, so nothing is asserted about one; the ordinary preview stands.
    expect(screen.queryByTestId('permission-destination-scope')).toBeNull()
    expect(screen.getByTestId('permission-session-scope')).toBeTruthy()
  })
})
