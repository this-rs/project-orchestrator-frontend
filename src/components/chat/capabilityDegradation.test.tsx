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

import { chatSessionIdAtom } from '@/atoms'
import { POLICY_ONLY_REQUEST_TEXT, TOOL_CANCEL_UNSUPPORTED_TEXT } from '@/constants/capabilities'
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
  it('false: no Allow / Deny / Remember, and the request says the policy decides', () => {
    const onRespond = vi.fn()
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={onRespond} />, caps({ interactive_permissions: false }))
    expect(screen.queryByRole('button', { name: /allow/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /deny/i })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(POLICY_ONLY_REQUEST_TEXT)).toBeTruthy()
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
    expect(screen.queryByText(POLICY_ONLY_REQUEST_TEXT)).toBeNull()
  })

  it('Claude profile: Allow, Deny and Remember as before', () => {
    const onRespond = vi.fn(() => true)
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /allow/i }))
    expect(onRespond).toHaveBeenCalledWith('c1', true, { toolName: 'Bash' })
  })
})

describe('permission_scopes', () => {
  it('without the `session` scope, "Remember" is not offered — Allow / Deny stay', () => {
    const onRespond = vi.fn(() => true)
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={onRespond} />, caps({ permission_scopes: ['once'] }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('Remember')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /allow/i }))
    expect(onRespond).toHaveBeenCalledWith('c1', true, undefined)
  })

  it('with the `session` scope, "Remember" is offered', () => {
    mount(<PermissionRequestBlock block={permissionBlock} onRespond={() => true} />, caps({ permission_scopes: ['once', 'session'] }))
    expect(screen.getByText('Remember')).toBeTruthy()
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
    expect(help?.textContent).toBe(TOOL_CANCEL_UNSUPPORTED_TEXT)
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
