import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiscussionNodeRow } from '../DiscussionNode'
import type { DiscussionNode } from '@/services/discussions'

const node = (extra: Partial<DiscussionNode> = {}): DiscussionNode =>
  ({
    session_id: 's1',
    title: 'Session de test',
    status: 'idle',
    message_count: 12,
    duration_secs: 125,
    cost_usd: 0.4,
    children: [],
    metadata: {},
    ...extra,
  }) as DiscussionNode

describe('DiscussionNodeRow', () => {
  it('shows messages, duration and cost without any hover (a phone has no hover)', () => {
    const { container } = render(
      <DiscussionNodeRow node={node()} depth={0} selectedSessionId={null} onSelectNode={vi.fn()} />,
    )
    expect(screen.getByLabelText('12 messages')).toBeTruthy()
    expect(screen.getByLabelText('Durée 2m 5s')).toBeTruthy()
    expect(screen.getByLabelText('Coût $0.40')).toBeTruthy()
    expect(container.innerHTML).not.toContain('group-hover:opacity')
    expect(container.innerHTML).not.toContain('opacity-0')
  })

  it('names its status in words and in French', () => {
    render(<DiscussionNodeRow node={node({ status: 'failed' })} depth={0} selectedSessionId={null} onSelectNode={vi.fn()} />)
    expect(screen.getByText('Échouée')).toBeTruthy()
  })

  it('a title is a real button (keyboard) and an untitled session is named in French', () => {
    const onSelect = vi.fn()
    render(<DiscussionNodeRow node={node({ title: '' })} depth={0} selectedSessionId={null} onSelectNode={onSelect} />)
    screen.getByRole('button', { name: 'Session sans titre' }).click()
    expect(onSelect).toHaveBeenCalledWith('s1')
  })
})
