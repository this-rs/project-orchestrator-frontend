/**
 * The `Agent` tool card: what the sub-agent was asked, and the way into the
 * child conversation it ran in.
 *
 * The join under test is the one the backend fixes: the child's
 * `spawned_by.tool_use_id` equals the parent's tool-call id. The native harness
 * declares `subagents: none` and never emits `parent_tool_use_id`, so nothing
 * else links the two.
 *
 * Run with: npx vitest run src/components/chat/tools/AgentToolRenderer.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ChatSessionProvider, type ChatChildSession } from '../ChatSessionContext'
import { AgentToolRenderer } from './AgentToolRenderer'
import { ToolContent, getToolIcon, getToolSummary, resolveToolRenderer } from './index'

const CALL = 'call_subagent_1'
const INPUT = {
  description: 'Audit the spawn path',
  prompt: 'Read src/chat/subagents.rs and report how the child session is opened.',
  subagent_type: 'Explore',
}

function inSession(
  ui: ReactNode,
  { childSessions, openSession }: { childSessions?: ChatChildSession[]; openSession?: (id: string) => void } = {},
) {
  return render(
    <ChatSessionProvider sessionId="parent-1" childSessions={childSessions} openSession={openSession}>
      {ui}
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
    render(<AgentToolRenderer toolName="Agent" toolCallId={CALL} toolInput={INPUT} isLoading={false} />)
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
})
