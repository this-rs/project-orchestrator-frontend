/**
 * Render tests for `<BackgroundActivityBlock />` (F10 of plan 5985a7c4 —
 * orphan background output).
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BackgroundActivityMetadata, ContentBlock } from '@/types'
import { BackgroundActivityBlock } from './BackgroundActivityBlock'

function block(meta: Partial<BackgroundActivityMetadata>): ContentBlock {
  const entries = meta.entries ?? []
  const full: BackgroundActivityMetadata = {
    correlation_id: 'toolu_X',
    source: 'Monitor',
    count: entries.length,
    first_received_at: entries[0]?.received_at ?? '2026-05-01T10:00:00Z',
    last_received_at: entries[entries.length - 1]?.received_at ?? '2026-05-01T10:00:00Z',
    entries,
    ...meta,
  }
  return {
    id: 'b-1',
    type: 'background_activity',
    content: entries[entries.length - 1]?.content ?? '',
    metadata: full as unknown as Record<string, unknown>,
  }
}

const tick = (i: number) => ({
  source: 'Monitor',
  content: `EVENT ${i}`,
  received_at: `2026-05-01T10:00:${String(i).padStart(2, '0')}Z`,
})

describe('BackgroundActivityBlock', () => {
  it('renders a single collapsed summary line by default', () => {
    render(
      <BackgroundActivityBlock
        block={block({ subagent_type: 'researcher', count: 50, entries: [tick(1), tick(2), tick(3)] })}
      />,
    )
    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('Background activity')
    expect(toggle).toHaveTextContent('researcher')
    expect(toggle).toHaveTextContent('50 events')
    expect(toggle).toHaveTextContent('last: EVENT 3')
    // Entries are not listed until expanded.
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('falls back to source when no subagent_type / description is known', () => {
    render(<BackgroundActivityBlock block={block({ entries: [tick(1)] })} />)
    const toggle = screen.getByRole('button')
    expect(toggle).toHaveTextContent('Monitor')
    expect(toggle).toHaveTextContent('1 event')
  })

  it('expands to the retained entries and notes the ones not kept', () => {
    render(
      <BackgroundActivityBlock
        block={block({ count: 25, entries: [tick(1), tick(2)] })}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('EVENT 1')
    expect(list).toHaveTextContent('EVENT 2')
    expect(list).toHaveTextContent('23 earlier events not kept')
  })
})
