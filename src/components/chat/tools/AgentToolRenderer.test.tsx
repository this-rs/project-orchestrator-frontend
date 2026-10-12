/**
 * The `Agent` tool card: what the sub-agent was asked, and the way into the
 * child conversation it ran in.
 *
 * The join under test is the one the backend fixes: the child's
 * `spawned_by.tool_use_id` equals the parent's tool-call id. The native harness
 * declares `subagents: none` and never emits `parent_tool_use_id`, so nothing
 * else links the two.
 *
 * Claude Code's own sub-agent tool is also named `Agent`, but Claude Code runs
 * its sub-agents in-process: no child conversation ever exists in PO, so its
 * card must not promise one.
 *
 * Run with: npx vitest run src/components/chat/tools/AgentToolRenderer.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CLAUDE_CODE_CAPABILITIES, MINIMAL_CAPABILITIES, type ProviderCapabilities } from '@/types/provider'
import { ChatCapabilitiesProvider, ChatSessionProvider, type ChatChildSession } from '../ChatSessionContext'
import { AgentToolRenderer } from './AgentToolRenderer'
import { AgentGroup } from '../AgentGroup'
import { toDetachedRun } from '@/hooks/useDetachedRuns'
import type { ContentBlock, DetachedSession } from '@/types'
import { ToolContent, getToolIcon, getToolSummary, resolveToolRenderer } from './index'

const CALL = 'call_subagent_1'
const INPUT = {
  description: 'Audit the spawn path',
  prompt: 'Read src/chat/subagents.rs and report how the child session is opened.',
  subagent_type: 'Explore',
}

/** The native harness: no sub-agents of its own, so PO hosts the child. */
const NATIVE_CAPS: Readonly<ProviderCapabilities> = { ...MINIMAL_CAPABILITIES, subagents: 'none' }

function inSession(
  ui: ReactNode,
  {
    childSessions,
    openSession,
    capabilities = NATIVE_CAPS,
  }: { childSessions?: ChatChildSession[]; openSession?: (id: string) => void; capabilities?: Readonly<ProviderCapabilities> } = {},
) {
  return render(
    <ChatSessionProvider sessionId="parent-1" childSessions={childSessions} openSession={openSession}>
      <ChatCapabilitiesProvider capabilities={capabilities}>{ui}</ChatCapabilitiesProvider>
    </ChatSessionProvider>,
  )
}

describe('the Agent tool resolves to its own card', () => {
  it('a native-harness call resolves by its canonical name, whatever the provider kind', () => {
    const resolved = resolveToolRenderer({
      providerKind: 'openai_compatible',
      toolName: 'Agent',
      canonical: 'Agent',
      toolInput: INPUT,
    })
    expect(resolved.Renderer).toBe(AgentToolRenderer)
    expect(resolved.via).toBe('canonical')
  })

  it('names the task in the collapsed header, with the kind of agent asked for', () => {
    expect(getToolSummary('Agent', INPUT, { providerKind: 'openai_compatible', canonical: 'Agent' })).toBe(
      'Audit the spawn path — Explore',
    )
    expect(getToolIcon('Agent', INPUT, { providerKind: 'openai_compatible', canonical: 'Agent' })).toBe('⇲')
    // A model that sent no description still gets a header that says something.
    expect(getToolSummary('Agent', { prompt: 'Find the login flow' }, { canonical: 'Agent' })).toBe('Find the login flow')
  })

  it('Claude Code keeps its own `Task` nesting: the name `Task` is untouched', () => {
    expect(resolveToolRenderer({ toolName: 'Task', toolInput: { prompt: 'x' } }).Renderer).not.toBe(AgentToolRenderer)
  })
})

describe('the Agent tool card', () => {
  it('shows what the sub-agent was asked and opens the child found by tool_use_id', () => {
    const openSession = vi.fn()
    inSession(
      <ToolContent
        providerKind="openai_compatible"
        canonical="Agent"
        toolName="Agent"
        toolCallId={CALL}
        toolInput={INPUT}
        resultContent="The child is opened with spawned_by = conversation."
        isLoading={false}
      />,
      {
        openSession,
        childSessions: [
          // A sibling child of the same parent, from another call: must not be picked.
          { sessionId: 'child-other', title: 'Another sub-agent', isStreaming: false, toolUseId: 'call_other' },
          { sessionId: 'child-1', title: 'Audit the spawn path', isStreaming: false, toolUseId: CALL },
        ],
      },
    )

    expect(screen.getByText('Asked of the sub-agent')).toBeInTheDocument()
    expect(screen.getByText(INPUT.prompt)).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
    // The answer is the tool result, already on the block.
    expect(screen.getByText('The child is opened with spawned_by = conversation.')).toBeInTheDocument()

    const open = screen.getByTestId('agent-open-child')
    expect(open).toHaveTextContent('Open the sub-conversation')
    fireEvent.click(open)
    expect(openSession).toHaveBeenCalledWith('child-1')
    expect(openSession).toHaveBeenCalledTimes(1)
  })

  it('says the sub-agent is still working while the call has no result', () => {
    inSession(
      <AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading />,
      { openSession: vi.fn(), childSessions: [{ sessionId: 'child-1', title: 'Running', isStreaming: true, toolUseId: CALL }] },
    )
    expect(screen.getByRole('status')).toHaveTextContent('The sub-agent is still working…')
    // The child is reachable while it works — that is the point of the link.
    expect(screen.getByTestId('agent-open-child')).toBeInTheDocument()
  })

  it('offers no dead link when no child answers to this call (older backend, or not listed yet)', () => {
    inSession(<AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading={false} resultContent="done" />, {
      openSession: vi.fn(),
      childSessions: [{ sessionId: 'child-other', title: 'Another', isStreaming: false, toolUseId: 'call_other' }],
    })
    expect(screen.queryByTestId('agent-open-child')).not.toBeInTheDocument()
    expect(screen.getByTestId('agent-no-child')).toHaveTextContent('The sub-conversation is not listed yet')
  })

  it('offers no link outside the chat panel, where there is nothing to navigate', () => {
    render(
      <ChatCapabilitiesProvider capabilities={NATIVE_CAPS}>
        <AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading={false} />
      </ChatCapabilitiesProvider>,
    )
    expect(screen.queryByTestId('agent-open-child')).not.toBeInTheDocument()
    expect(screen.getByTestId('agent-no-child')).toBeInTheDocument()
  })

  it('a child whose origin carried no tool_use_id is never guessed at', () => {
    inSession(<AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading={false} />, {
      openSession: vi.fn(),
      childSessions: [{ sessionId: 'child-1', title: 'Opened by a person', isStreaming: false }],
    })
    expect(screen.queryByTestId('agent-open-child')).not.toBeInTheDocument()
  })

  it('a failed call shows the failure, not an answer', () => {
    inSession(
      <AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading={false} isError resultContent="AskUserQuestion is denied to a spawned session" />,
      { openSession: vi.fn() },
    )
    expect(screen.getByText('The sub-agent failed')).toBeInTheDocument()
    expect(screen.queryByText('Its answer')).not.toBeInTheDocument()
  })

  it('a call the backend refused (error, no child) shows the failure, not a wait for a child', () => {
    inSession(
      <AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading={false} isError resultContent="too many sub-agents for this session" />,
      { openSession: vi.fn(), childSessions: [] },
    )
    expect(screen.getByText('The sub-agent failed')).toBeInTheDocument()
    expect(screen.getByText('too many sub-agents for this session')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-no-child')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agent-open-child')).not.toBeInTheDocument()
  })

  it('a failed call whose child DID open still links it', () => {
    inSession(
      <AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading={false} isError resultContent="the sub-agent crashed" />,
      { openSession: vi.fn(), childSessions: [{ sessionId: 'child-1', title: 'Crashed', isStreaming: false, toolUseId: CALL }] },
    )
    expect(screen.getByTestId('agent-open-child')).toBeInTheDocument()
  })
})

describe("Claude Code's own `Agent` call", () => {
  // Current Claude Code names its sub-agent tool `Agent`, with a `prompt`. Not
  // grouped into an AgentGroup (background agent, nested call, history without
  // `parent_tool_use_id`), it resolves to this card — but its sub-agent runs
  // inside the CLI and never becomes a PO conversation.
  const CLAUDE_INPUT = { description: 'Explore the repo', prompt: 'List the chat handlers.', subagent_type: 'general-purpose' }

  it('is a plain sub-agent card: task, kind, answer — no link and no "not listed yet"', () => {
    inSession(
      <ToolContent
        toolName="Agent"
        toolCallId="toolu_claude_1"
        toolInput={CLAUDE_INPUT}
        resultContent="Found 3 handlers."
        isLoading={false}
      />,
      {
        openSession: vi.fn(),
        capabilities: CLAUDE_CODE_CAPABILITIES,
        childSessions: [{ sessionId: 'child-other', title: 'A runner child', isStreaming: false, toolUseId: 'call_other' }],
      },
    )
    expect(screen.getByTestId('agent-tool-card')).toBeInTheDocument()
    expect(screen.getByText(CLAUDE_INPUT.prompt)).toBeInTheDocument()
    expect(screen.getByText('general-purpose')).toBeInTheDocument()
    expect(screen.getByText('Found 3 handlers.')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-open-child')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agent-no-child')).not.toBeInTheDocument()
    expect(screen.queryByText('The sub-conversation is not listed yet')).not.toBeInTheDocument()
  })

  it('outside the chat panel (default capabilities = Claude) it promises no child either', () => {
    render(<ToolContent toolName="Agent" toolInput={CLAUDE_INPUT} isLoading />)
    expect(screen.getByTestId('agent-tool-card')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-no-child')).not.toBeInTheDocument()
  })

  it('a native session\'s `Agent` call still links its child', () => {
    const openSession = vi.fn()
    inSession(
      <ToolContent providerKind="openai_compatible" canonical="Agent" toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading />,
      { openSession, childSessions: [{ sessionId: 'child-1', title: 'Audit', isStreaming: true, toolUseId: CALL }] },
    )
    fireEvent.click(screen.getByTestId('agent-open-child'))
    expect(openSession).toHaveBeenCalledWith('child-1')
  })
})

describe("a Claude Code sub-agent's read-only mirror (P18c)", () => {
  // The backend mirrors a Claude Code sub-agent into a child conversation marked
  // `mirror_of: "claude_code"`, linked by `spawned_by.tool_use_id` = the parent's call id.
  const CLAUDE_CALL = 'toolu_claude_mirror'
  const CLAUDE_INPUT = { description: 'Explore the repo', prompt: 'List the chat handlers.', subagent_type: 'Explore' }
  const MIRROR: DetachedSession = {
    id: 'mirror-1',
    title: 'Explore the repo',
    model: 'claude-sonnet',
    created_at: '2026-10-12T00:00:00Z',
    updated_at: '2026-10-12T00:00:00Z',
    provider_id: 'claude-code',
    mirror_of: 'claude_code',
    spawned_by: { type: 'conversation', parent_session_id: 'parent-1', tool_use_id: CLAUDE_CALL },
  }

  it('the children endpoint\'s mirror joins on the call id like any child', () => {
    expect(toDetachedRun(MIRROR).toolUseId).toBe(CLAUDE_CALL)
  })

  it('a Claude Code `Agent` card links its mirror child', () => {
    const openSession = vi.fn()
    inSession(
      <ToolContent toolName="Agent" toolCallId={CLAUDE_CALL} toolInput={CLAUDE_INPUT} resultContent="Found 3 handlers." isLoading={false} />,
      { openSession, capabilities: CLAUDE_CODE_CAPABILITIES, childSessions: [toDetachedRun(MIRROR)] },
    )
    const open = screen.getByTestId('agent-open-child')
    expect(open).toHaveTextContent('Open the sub-conversation')
    fireEvent.click(open)
    expect(openSession).toHaveBeenCalledWith('mirror-1')
  })

  it('without a mirror (backend without mirrors) it still promises none', () => {
    inSession(
      <ToolContent toolName="Agent" toolCallId={CLAUDE_CALL} toolInput={CLAUDE_INPUT} isLoading={false} resultContent="done" />,
      { openSession: vi.fn(), capabilities: CLAUDE_CODE_CAPABILITIES, childSessions: [] },
    )
    expect(screen.queryByTestId('agent-open-child')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agent-no-child')).not.toBeInTheDocument()
  })

  describe('the nested AgentGroup of the same call', () => {
    const parentBlock: ContentBlock = {
      id: 'b1',
      type: 'tool_use',
      content: '',
      metadata: { tool_name: 'Agent', tool_call_id: CLAUDE_CALL, tool_input: CLAUDE_INPUT },
    }
    const group = () => <AgentGroup parentBlock={parentBlock} childBlocks={[]} allBlocks={[parentBlock]} isStreaming />

    it('links the mirror too, the nesting itself unchanged', () => {
      const openSession = vi.fn()
      inSession(group(), { openSession, capabilities: CLAUDE_CODE_CAPABILITIES, childSessions: [toDetachedRun(MIRROR)] })
      expect(screen.getByText('Explore the repo')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('agent-group-open-child'))
      expect(openSession).toHaveBeenCalledWith('mirror-1')
    })

    it('shows no link when no mirror answers to the call', () => {
      inSession(group(), {
        openSession: vi.fn(),
        capabilities: CLAUDE_CODE_CAPABILITIES,
        childSessions: [{ sessionId: 'other', title: 'x', isStreaming: false, toolUseId: 'toolu_other' }],
      })
      expect(screen.queryByTestId('agent-group-open-child')).not.toBeInTheDocument()
    })
  })
})
