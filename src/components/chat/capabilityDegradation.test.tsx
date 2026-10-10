/**
 * Degradation by capability, in the transcript: one test per rule, each red
 * without its guard — and the full Claude profile renders as before.
 *
 * The composer side (images, resume, banners) is in
 * `ChatInput.capabilities.test.tsx` and `ChatPanel.providerState.test.tsx`.
 *
 * Run with: npx vitest run src/components/chat/capabilityDegradation.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { ChatMessage, ContentBlock } from '@/types'
import { CLAUDE_CODE_CAPABILITIES, type ProviderCapabilities } from '@/types/provider'

const cancelTools = vi.fn()
vi.mock('@/services', () => ({ chatApi: { cancelTools: (...a: unknown[]) => cancelTools(...a) } }))

import { chatSessionEngineAtom, chatSessionIdAtom } from '@/atoms'
import { harnessGapOf } from '@/constants/providerErrors'
import { ProviderStateCard } from './ProviderStateCard'
import { policyOnlyRequestText, toolCancelUnsupportedText } from '@/constants/capabilities'
import { ChatCapabilitiesProvider, ChatSessionProvider } from './ChatSessionContext'
import { ChatMessageBubble, groupBlocksByAgent } from './ChatMessageBubble'
import { PermissionRequestBlock } from './PermissionRequestBlock'
import { ToolCallBlock } from './ToolCallBlock'

const caps = (over: Partial<ProviderCapabilities>): ProviderCapabilities => ({ ...CLAUDE_CODE_CAPABILITIES, ...over })

/** Mount inside the chat panel's contexts; `capabilities` absent = no provider at all (default profile). */
function mount(ui: ReactNode, capabilities?: ProviderCapabilities) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  const inner = <ChatSessionProvider sessionId="s1">{ui}</ChatSessionProvider>
  return render(
    <Provider store={store}>
      {capabilities ? <ChatCapabilitiesProvider capabilities={capabilities}>{inner}</ChatCapabilitiesProvider> : inner}
    </Provider>,
  )
}

const permissionBlock: ContentBlock = {
  id: 'p1',
  type: 'permission_request',
  content: '',
  metadata: { tool_call_id: 'c1', tool_name: 'Bash', tool_input: { command: 'ls' } },
}

beforeEach(() => {
  cancelTools.mockReset()
})

describe('interactive_permissions', () => {
  it('false: no Allow / Deny / scope buttons, and the request says the policy decides', () => {
    const onRespond = vi.fn()
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={onRespond} />, caps({ interactive_permissions: false }))
    expect(screen.queryByRole('button', { name: /allow/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /deny/i })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(policyOnlyRequestText())).toBeTruthy()
    expect(onRespond).not.toHaveBeenCalled()
  })

  it('false: a decision that is already recorded (history) still shows as decided', () => {
    mount(
      <PermissionRequestBlock
        block={{ ...permissionBlock, metadata: { ...permissionBlock.metadata, decided: true, decision: 'denied' } }}
        onRespond={() => true}
      />,
      caps({ interactive_permissions: false }),
    )
    expect(screen.getByText('Denied')).toBeTruthy()
    expect(screen.queryByText(policyOnlyRequestText())).toBeNull()
  })

  it('Claude profile: allow once, for the session, and deny — never "Always" (P11b)', () => {
    const onRespond = vi.fn(() => true)
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={onRespond} />)
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'For this session' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Always' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    expect(onRespond).toHaveBeenCalledWith('c1', true, 'once')
  })
})

describe('permission_scopes', () => {
  const withMeta = (extra: Record<string, unknown>): ContentBlock => ({
    ...permissionBlock,
    metadata: { ...permissionBlock.metadata, ...extra },
  })
  /** The same tree (same store) rendered again with another block: the component keeps its state. */
  function stage(onRespond: (...a: unknown[]) => boolean) {
    const store = createStore()
    store.set(chatSessionIdAtom, 's1')
    const view = (b: ContentBlock) => (
      <Provider store={store}>
        <ChatCapabilitiesProvider capabilities={caps({ permission_scopes: ['once', 'session'] })}>
          <ChatSessionProvider sessionId="s1">
            <PermissionRequestBlock block={b} onRespond={onRespond} />
          </ChatSessionProvider>
        </ChatCapabilitiesProvider>
      </Provider>
    )
    const { rerender } = render(view(permissionBlock))
    return (b: ContentBlock) => rerender(view(b))
  }

  it('only `once`: no session scope is offered — Allow once / Deny stay', () => {
    const onRespond = vi.fn(() => true)
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={onRespond} />, caps({ permission_scopes: ['once'] }))
    expect(screen.queryByRole('button', { name: 'For this session' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    expect(onRespond).toHaveBeenCalledWith('c1', true, 'once')
  })

  it('a provider declaring `always` still gets no "Always" button', () => {
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={() => true} />, caps({ permission_scopes: ['once', 'session', 'always'] }))
    expect(screen.queryByRole('button', { name: 'Always' })).toBeNull()
  })

  it('session: sent with its scope, NOT shown as allowed until the backend confirms', () => {
    const onRespond = vi.fn(() => true)
    const update = stage(onRespond)
    const session = screen.getByRole('button', { name: 'For this session' })
    expect(session.getAttribute('title')).toMatch(/this exact call/)
    fireEvent.click(session)
    expect(onRespond).toHaveBeenCalledWith('c1', true, 'session')
    expect(screen.queryByText('Allowed')).toBeNull()
    expect(screen.queryByText('Allowed for the session')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Waiting for the confirmation/)
    expect(screen.getByRole('button', { name: 'Allow once' })).toHaveProperty('disabled', true)
    // The decision arrives with what was granted.
    update(withMeta({ decided: true, decision: 'allowed', decision_scope: 'session', decision_rule: 'Bash: git status' }))
    expect(screen.getByText('Allowed for the session')).toBeTruthy()
    expect(screen.getByText('Bash: git status')).toBeTruthy()
  })

  it('a refused scope (permission_scope_unsupported): never "Allowed", the request can be answered again', () => {
    const onRespond = vi.fn(() => true)
    const update = stage(onRespond)
    fireEvent.click(screen.getByRole('button', { name: 'For this session' }))
    update(withMeta({ scope_refused: { scope: 'session', at: 1 } }))
    expect(screen.queryByText('Allowed')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/cannot be kept for the session/)
    const once = screen.getByRole('button', { name: 'Allow once' })
    expect(once).toHaveProperty('disabled', false)
    fireEvent.click(once)
    expect(onRespond).toHaveBeenLastCalledWith('c1', true, 'once')
    expect(screen.getByText('Allowed')).toBeTruthy()
  })

  it('deny carries no scope', () => {
    const onRespond = vi.fn(() => true)
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onRespond).toHaveBeenCalledWith('c1', false, undefined)
  })

  it('the actions are one labelled group', () => {
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={() => true} />)
    expect(screen.getByRole('group', { name: 'Answer this permission request' })).toBeTruthy()
  })
})

describe('subagents', () => {
  const blocks: ContentBlock[] = [
    { id: 't', type: 'tool_use', content: 'Task', metadata: { tool_call_id: 'task-1', tool_name: 'Task', tool_input: {} } },
    { id: 'c', type: 'text', content: 'child says hi', metadata: { parent_tool_use_id: 'task-1' } },
    { id: 'u', type: 'tool_use', content: 'Read', metadata: { tool_call_id: 'r-1', tool_name: 'Read', tool_input: {}, parent_tool_use_id: 'task-1' } },
  ]

  it('nested (Claude): blocks are grouped under the agent that produced them', () => {
    const grouped = groupBlocksByAgent(blocks)
    expect(grouped.map((g) => g.kind)).toEqual(['agent_group'])
    expect(groupBlocksByAgent(blocks, 'nested')).toEqual(grouped)
  })

  it('separate_thread: the grouping is kept', () => {
    expect(groupBlocksByAgent(blocks, 'separate_thread').map((g) => g.kind)).toEqual(['agent_group'])
  })

  it('none: no agent group, the blocks stay flat in arrival order', () => {
    const grouped = groupBlocksByAgent(blocks, 'none')
    expect(grouped.map((g) => g.kind)).toEqual(['tool_group', 'block', 'tool_group'])
    expect(grouped.some((g) => g.kind === 'agent_group')).toBe(false)
  })

  it('none: the bubble renders the child text at top level', () => {
    const message: ChatMessage = { id: 'm', role: 'assistant', blocks, timestamp: new Date() }
    mount(
      <ChatMessageBubble message={message} onRespondPermission={() => true} onRespondInput={() => true} />,
      caps({ subagents: 'none' }),
    )
    // Inside an agent group the child text is hidden until the group is expanded.
    expect(screen.getByText('child says hi')).toBeTruthy()
  })
})

describe('thinking', () => {
  const message: ChatMessage = {
    id: 'm',
    role: 'assistant',
    blocks: [
      { id: 'th', type: 'thinking', content: 'let me think about it' },
      { id: 'tx', type: 'text', content: 'the answer' },
    ],
    timestamp: new Date(),
  }
  const bubble = <ChatMessageBubble message={message} onRespondPermission={() => true} onRespondInput={() => true} />

  it('false: the reasoning block is not rendered', () => {
    mount(bubble, caps({ thinking: false }))
    expect(screen.queryByText(/Thought process|Thinking/i)).toBeNull()
    expect(screen.getByText('the answer')).toBeTruthy()
  })

  it('Claude profile: the reasoning block is rendered as before', () => {
    mount(bubble)
    expect(screen.getByText(/Thought process|Thinking/i)).toBeTruthy()
  })
})

/** The per-tool stop chip (a `role="button"` span nested in the block's header button). */
const stopChip = () => screen.getAllByRole('button', { name: /stop/i }).find((el) => el.tagName === 'SPAN')!

describe('tool_cancel', () => {
  const running: ContentBlock = {
    id: 'tu',
    type: 'tool_use',
    content: 'Bash',
    metadata: { tool_call_id: 'c9', tool_name: 'Bash', tool_input: { command: 'sleep 100' }, created_at: new Date().toISOString() },
  }

  it('false: the stop chip is disabled, explained, and does nothing', () => {
    mount(<ToolCallBlock block={running} />, caps({ tool_cancel: false }))
    const stop = stopChip()
    expect(stop.getAttribute('aria-disabled')).toBe('true')
    // Still reachable from the keyboard, with the reason tied to it.
    expect(stop.getAttribute('tabindex')).toBe('0')
    const help = document.getElementById(stop.getAttribute('aria-describedby')!)
    expect(help?.textContent).toBe(toolCancelUnsupportedText())
    fireEvent.click(stop)
    fireEvent.keyDown(stop, { key: 'Enter' })
    expect(cancelTools).not.toHaveBeenCalled()
  })

  it('Claude profile: the stop chip cancels the running tools', () => {
    cancelTools.mockResolvedValue({ capped: false })
    mount(<ToolCallBlock block={running} />)
    const stop = stopChip()
    expect(stop.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(stop)
    expect(cancelTools).toHaveBeenCalledWith('s1')
  })
})

describe('typed session_error in the transcript', () => {
  it('an error block carrying a provider error renders its card', () => {
    const message: ChatMessage = {
      id: 'm',
      role: 'assistant',
      timestamp: new Date(),
      blocks: [
        {
          id: 'e',
          type: 'error',
          content: 'Codex is not signed in (provider_error)',
          metadata: { code: 'auth_required', provider_error: { code: 'auth_required', message: 'Codex is not signed in', login_hint: 'codex login' } },
        },
      ],
    }
    mount(<ChatMessageBubble message={message} onRespondPermission={() => true} onRespondInput={() => true} />)
    const card = screen.getByRole('alert')
    expect(card.getAttribute('data-error-code')).toBe('auth_required')
    expect(card.querySelector('code')?.textContent).toBe('codex login')
  })

  it('an untyped error block is the plain red line it always was', () => {
    const message: ChatMessage = {
      id: 'm',
      role: 'assistant',
      timestamp: new Date(),
      blocks: [{ id: 'e', type: 'error', content: 'The Claude CLI process exited unexpectedly (subprocess_died)' }],
    }
    mount(<ChatMessageBubble message={message} onRespondPermission={() => true} onRespondInput={() => true} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('The Claude CLI process exited unexpectedly (subprocess_died)')).toBeTruthy()
  })
})

describe('cost of a turn in the bubble', () => {
  const turn = (extra: Partial<ChatMessage>): ChatMessage => ({
    id: 'm',
    role: 'assistant',
    blocks: [{ id: 'tx', type: 'text', content: 'the answer' }],
    timestamp: new Date(),
    ...extra,
  })
  const show = (extra: Partial<ChatMessage>) =>
    mount(<ChatMessageBubble message={turn(extra)} onRespondPermission={() => true} onRespondInput={() => true} />)

  it('a Claude turn shows the same cost as before', () => {
    // Four decimals under a cent, two above: the format the bubble always had.
    show({ cost_usd: 0.0042 })
    expect(screen.getByText('$0.0042')).toBeTruthy()
  })

  it('a Claude turn above a cent keeps two decimals', () => {
    show({ cost_usd: 0.456, cost_basis: 'reported' })
    expect(screen.getByText('$0.46')).toBeTruthy()
  })

  it('an unknown cost shows no amount — never "$0"', () => {
    const { container } = show({ cost_basis: 'unknown' })
    expect(screen.queryByTestId('cost-display')).toBeNull()
    expect(container.textContent).not.toContain('$')
  })

  it('a free turn reads "local"', () => {
    show({ cost_basis: 'free', usage: { input_tokens: 10, output_tokens: 2 } })
    expect(screen.getByTestId('cost-display').textContent).toContain('local')
  })

  it('an estimate carries its badge', () => {
    show({ cost_usd: 0.04, cost_basis: 'priced' })
    expect(screen.getByTestId('cost-display').textContent).toContain('est.')
  })
})

describe('engine gaps vs model limits in a failure card', () => {
  it('an `unsupported` on an engine feature is said to be Project Orchestrator’s gap, not the provider’s', () => {
    render(<ProviderStateCard error={{ code: 'unsupported', message: '', capability: 'message_queue' }} />)
    const card = screen.getByRole('alert')
    expect(card.textContent).toMatch(/agent engine does not do this yet \(message queue\)/)
    expect(card.textContent).toMatch(/not a limit of the model/)
    expect(card.textContent).not.toMatch(/This provider does not support/)
  })

  it('a message refused during a turn on an engine without a queue says so', () => {
    const store = createStore()
    store.set(chatSessionEngineAtom, { engine: 'agent', degraded: ['message_queue'] })
    render(
      <Provider store={store}>
        <ProviderStateCard error={{ code: 'turn_in_progress', message: '' }} />
      </Provider>,
    )
    expect(screen.getByTestId('harness-gap-note').textContent).toMatch(/not a limit of the model/)
  })

  it('a model capability is never reported as an engine gap', () => {
    expect(harnessGapOf({ code: 'unsupported', capability: 'images' })).toBeNull()
    expect(harnessGapOf({ code: 'unsupported', capability: 'tools' })).toBeNull()
    expect(harnessGapOf({ code: 'turn_in_progress' }, [])).toBeNull()
    render(<ProviderStateCard error={{ code: 'unsupported', message: '', capability: 'images' }} />)
    expect(screen.getByRole('alert').textContent).toMatch(/This provider does not support "images"/)
    expect(screen.queryByTestId('harness-gap-note')).toBeNull()
  })
})
