/**
 * The breadcrumb of a spawned session says WHAT it is to its parent, not only
 * that it hangs under one: a sub-agent's conversation and a runner's child look
 * exactly alike in a chain of titles.
 *
 * Run with: npx vitest run src/components/chat/SessionBreadcrumb.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import type { SessionTreeNode } from '@/types'

const TREE: SessionTreeNode[] = [
  { session_id: 'parent-1', depth: 0, is_streaming: false, title: 'The parent conversation' },
  { session_id: 'child-1', parent_session_id: 'parent-1', depth: 1, is_streaming: false, title: 'Audit the spawn path' },
]

vi.mock('@/hooks', () => ({
  useSessionTree: () => ({ tree: TREE, isLoading: false, hasStreamingNodes: false, refresh: () => {} }),
}))

const { SessionBreadcrumb } = await import('./SessionBreadcrumb')

function show(ui: ReactNode) {
  return render(<Provider store={createStore()}>{ui}</Provider>)
}

describe('SessionBreadcrumb', () => {
  it('marks a child opened by an Agent call as a sub-agent of its conversation', () => {
    show(
      <SessionBreadcrumb
        sessionId="child-1"
        rootSessionId="parent-1"
        onNavigate={vi.fn()}
        spawnedBy={{ type: 'conversation', parent_session_id: 'parent-1', tool_use_id: 'call_1' }}
      />,
    )
    const chip = screen.getByTestId('breadcrumb-spawn')
    expect(chip).toHaveTextContent('spawned')
    expect(chip).toHaveAttribute('title', 'Sub-agent of another conversation')
    expect(screen.getByText('The parent conversation')).toBeInTheDocument()
  })

  it('does NOT call a human-opened sub-conversation a sub-agent (no tool_use_id)', () => {
    show(
      <SessionBreadcrumb
        sessionId="child-1"
        rootSessionId="parent-1"
        onNavigate={vi.fn()}
        spawnedBy={{ type: 'conversation', parent_session_id: 'parent-1' }}
      />,
    )
    const chip = screen.getByTestId('breadcrumb-spawn')
    expect(chip).toHaveTextContent('spawned')
    expect(chip).not.toHaveAttribute('title')
  })

  it('names a runner child a runner, and does not call it a sub-agent of a conversation', () => {
    show(
      <SessionBreadcrumb
        sessionId="child-1"
        rootSessionId="parent-1"
        onNavigate={vi.fn()}
        spawnedBy={{ type: 'runner', run_id: 'r1', task_id: 't1', parent_session_id: 'parent-1' }}
      />,
    )
    const chip = screen.getByTestId('breadcrumb-spawn')
    expect(chip).toHaveTextContent('runner')
    expect(chip).not.toHaveAttribute('title')
  })

  it('draws no chip for a session with no origin — the chain alone, as before', () => {
    show(<SessionBreadcrumb sessionId="child-1" rootSessionId="parent-1" onNavigate={vi.fn()} />)
    expect(screen.queryByTestId('breadcrumb-spawn')).not.toBeInTheDocument()
    expect(screen.getByText('The parent conversation')).toBeInTheDocument()
  })
})
