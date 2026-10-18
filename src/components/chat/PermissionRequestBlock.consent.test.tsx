/**
 * A `permission_request` that carries `consent` (CONSENT-WIRE, backend #833) is asked AS an
 * origin question: named by the subject PO asserts, with what once / session / always mean for
 * an ORIGIN, and `always` offered only when the request says so.
 *
 * Without `consent`, the block is the ordinary tool permission it always was.
 *
 * Run with: npx vitest run src/components/chat/PermissionRequestBlock.consent.test.tsx
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ContentBlock } from '@/types'
import { CLAUDE_CODE_CAPABILITIES, type ProviderCapabilities } from '@/types/provider'
import { chatSessionIdAtom } from '@/atoms'
import { permissionCallOf } from '@/utils/chatAssembly'
import { ChatCapabilitiesProvider, ChatSessionProvider } from './ChatSessionContext'
import { PermissionRequestBlock } from './PermissionRequestBlock'

const THREE_SCOPES: ProviderCapabilities = {
  ...CLAUDE_CODE_CAPABILITIES,
  permission_scopes: ['once', 'session', 'always'],
}

function mount(ui: ReactNode) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  return render(
    <Provider store={store}>
      <ChatCapabilitiesProvider capabilities={THREE_SCOPES}>
        <ChatSessionProvider sessionId="s1">{ui}</ChatSessionProvider>
      </ChatCapabilitiesProvider>
    </Provider>,
  )
}

/** The block built from the wire event, through the reducers' own mapping. */
function blockOf(event: Record<string, unknown>): ContentBlock {
  return {
    id: 'b1',
    type: 'permission_request',
    content: '',
    metadata: {
      tool_call_id: 'c1',
      tool_name: event.tool,
      tool_input: event.input,
      tool_category: event.category,
      tool_canonical: event.canonical,
      ...permissionCallOf(event),
    },
  }
}

/** The backend's own example: the call says `http://`, PO keys the consent on `https://`. */
const ORIGIN_QUESTION = {
  type: 'permission_request',
  id: 'perm_3',
  tool: 'mcp__nexus__WebFetch',
  input: { url: 'http://docs.rs/x' },
  category: 'web',
  canonical: 'WebFetch',
  always: true,
  consent: { subject: 'https://docs.rs', destinations: ['http://docs.rs', 'https://docs.rs'] },
}

describe('PermissionRequestBlock — an origin question (consent on the wire)', () => {
  it('names the subject PO asserts, verbatim, even when the call says http://', () => {
    mount(<PermissionRequestBlock block={blockOf(ORIGIN_QUESTION)} onRespond={() => true} />)
    const heading = screen.getByRole('heading', { name: /Allow network access to this origin\?/ })
    expect(screen.getByTestId('permission-origin-subject').textContent).toBe('https://docs.rs')
    expect(heading.textContent).toContain('https://docs.rs')
    // Never the origin rebuilt from the call's url.
    expect(heading.textContent).not.toContain('http://docs.rs')
    expect(screen.queryByText('Web: http://docs.rs')).toBeNull()
    // The guesses of the plain-destination path are gone.
    expect(screen.queryByTestId('permission-destination-scope')).toBeNull()
    expect(screen.queryByTestId('permission-session-scope')).toBeNull()
  })

  it('explains once / session / always for an ORIGIN, and lists every destination always records', () => {
    mount(<PermissionRequestBlock block={blockOf(ORIGIN_QUESTION)} onRespond={() => true} />)
    const scopes = screen.getByRole('list', { name: 'What each answer covers' })
    expect(scopes.textContent).toContain('Once: this call only')
    expect(screen.getByTestId('permission-origin-session').textContent).toMatch(/every page of this origin/)
    const always = screen.getByTestId('permission-origin-always')
    expect(always.textContent).toMatch(/network consent of this project/)
    expect(always.textContent).toMatch(/Settings → Network tools/)
    const listed = Array.from(always.querySelectorAll('li code')).map((c) => c.textContent)
    expect(listed).toEqual(['http://docs.rs', 'https://docs.rs'])
  })

  it('each answer button points at the sentence that explains it, and the group is named by the question (a11y)', () => {
    const { container } = mount(<PermissionRequestBlock block={blockOf(ORIGIN_QUESTION)} onRespond={() => true} />)
    const group = screen.getByRole('group', { name: /Allow network access to this origin\?/ })
    expect(group).toBeTruthy()
    for (const button of [
      screen.getByRole('button', { name: 'Allow once' }),
      container.querySelector('button[data-scope="session"]')!,
      container.querySelector('button[data-scope="always"]')!,
    ]) {
      const id = button.getAttribute('aria-describedby')!
      expect(container.querySelector(`#${id}`)).toBeTruthy()
    }
  })

  it('always goes through the normal permission answer', () => {
    const onRespond = vi.fn(() => true)
    const { container } = mount(<PermissionRequestBlock block={blockOf(ORIGIN_QUESTION)} onRespond={onRespond} />)
    fireEvent.click(container.querySelector('button[data-scope="always"]')!)
    expect(onRespond).toHaveBeenCalledWith('c1', true, 'always')
  })

  it('does not offer always when the request does not say always: true', () => {
    const { always: _always, ...withoutAlways } = ORIGIN_QUESTION
    void _always
    const { container } = mount(<PermissionRequestBlock block={blockOf(withoutAlways)} onRespond={() => true} />)
    expect(container.querySelector('button[data-scope="always"]')).toBeNull()
    expect(screen.queryByTestId('permission-origin-always')).toBeNull()
    // Session and once are still explained for the origin.
    expect(screen.getByTestId('permission-origin-session')).toBeTruthy()
    expect(screen.getByTestId('permission-origin-subject').textContent).toBe('https://docs.rs')
  })

  it('once decided, the compact line names the subject', () => {
    const block = blockOf(ORIGIN_QUESTION)
    block.metadata = { ...block.metadata, decided: true, decision: 'allowed' }
    mount(<PermissionRequestBlock block={block} onRespond={() => true} />)
    expect(screen.getByText('https://docs.rs')).toBeTruthy()
  })
})

describe('PermissionRequestBlock — no consent: unchanged', () => {
  it('a web call without consent keeps the destination wording of #386', () => {
    const { consent: _consent, ...plain } = ORIGIN_QUESTION
    void _consent
    mount(<PermissionRequestBlock block={blockOf(plain)} onRespond={() => true} />)
    expect(screen.getByText('Web: http://docs.rs')).toBeTruthy()
    expect(screen.getByTestId('permission-destination-scope').textContent).toContain('http://docs.rs')
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByTestId('permission-origin-scopes')).toBeNull()
  })

  it('a command keeps the exact-call preview and the plain group label', () => {
    mount(
      <PermissionRequestBlock
        block={blockOf({ tool: 'Bash', input: { command: 'git status' }, always: true })}
        onRespond={() => true}
      />,
    )
    expect(screen.getByTestId('permission-session-scope').textContent).toContain('Bash: git status')
    expect(screen.getByRole('group', { name: 'Answer this permission request' })).toBeTruthy()
    expect(screen.queryByTestId('permission-origin-scopes')).toBeNull()
  })

  it('a malformed consent is ignored, never half-rendered', () => {
    mount(
      <PermissionRequestBlock
        block={blockOf({ ...ORIGIN_QUESTION, consent: { subject: '', destinations: ['https://docs.rs'] } })}
        onRespond={() => true}
      />,
    )
    expect(screen.queryByTestId('permission-origin-subject')).toBeNull()
    expect(screen.getByText('Web: http://docs.rs')).toBeTruthy()
  })
})
