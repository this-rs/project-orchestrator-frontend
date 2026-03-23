import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WaveAgentCard } from '../WaveAgentCard'
import type { ActiveAgentSnapshot } from '@/services/runner'

const baseAgent: ActiveAgentSnapshot = {
  session_id: 'sess-1',
  task_id: 'task-1',
  task_title: 'Test task',
  status: 'running',
  elapsed_secs: 120,
  cost_usd: 0.05,
}

const noop = () => {}

describe('WaveAgentCard overflow fix', () => {
  it('root container has overflow-hidden to prevent button bleed', () => {
    const { container } = render(
      <WaveAgentCard
        agent={baseAgent}
        isSelected={false}
        onToggleConversation={noop}
      />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('overflow-hidden')
  })

  it('footer has flex-wrap so buttons wrap on narrow cards', () => {
    const { container } = render(
      <WaveAgentCard
        agent={baseAgent}
        isSelected={false}
        onToggleConversation={noop}
      />,
    )
    // Footer is the 3rd direct child div (header, body, footer)
    const footer = container.firstElementChild!.children[2] as HTMLElement
    expect(footer.className).toContain('flex-wrap')
  })

  it('conversation button label uses short text for compact display', () => {
    render(
      <WaveAgentCard
        agent={baseAgent}
        isSelected={false}
        onToggleConversation={noop}
      />,
    )
    // Should have truncate on the button text to prevent overflow
    const btn = screen.getByRole('button', { name: /conversation/i })
    expect(btn.className).toContain('min-w-0')
  })
})
