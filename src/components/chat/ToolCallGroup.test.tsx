/**
 * The vertical status bar of a chained-tools group must express the real
 * success / error / pending rate: one coloured segment per outcome,
 * proportional to its count — not a single "worst" colour.
 *
 * Run with: npx vitest run src/components/chat/ToolCallGroup.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { ContentBlock } from '@/types'
import { ToolCallGroup } from './ToolCallGroup'

const tool = (id: string, toolName = 'Read'): ContentBlock => ({
  id: `use-${id}`,
  type: 'tool_use',
  content: '',
  metadata: { tool_call_id: id, tool_name: toolName },
})
const ok = (id: string): ContentBlock => ({
  id: `res-${id}`,
  type: 'tool_result',
  content: '',
  metadata: { tool_call_id: id },
})
const err = (id: string): ContentBlock => ({
  id: `res-${id}`,
  type: 'tool_result',
  content: '',
  metadata: { tool_call_id: id, is_error: true },
})
const cancelled = (id: string): ContentBlock => ({
  id: `res-${id}`,
  type: 'tool_result',
  content: '',
  metadata: { tool_call_id: id, is_cancelled: true },
})

function mount(toolBlocks: ContentBlock[], allBlocks: ContentBlock[]) {
  return render(<ToolCallGroup toolBlocks={toolBlocks} allBlocks={allBlocks} />)
}

/** The status-bar segments, in DOM (top → bottom) order. */
function segments(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-outcome]')).map((el) => ({
    outcome: el.getAttribute('data-outcome'),
    className: el.className,
    flexGrow: el.style.flexGrow,
  }))
}

/** The status bar itself (the rounded container the segments fill). */
function bar(container: HTMLElement) {
  return container.querySelector('[data-outcome]')!.parentElement!
}

describe('<ToolCallGroup /> status bar', () => {
  it('splits into one segment per outcome, proportional to the counts', () => {
    // a = success, b = error, c = success, d = running (no result)
    const { container } = mount(
      [tool('a'), tool('b'), tool('c'), tool('d')],
      [ok('a'), err('b'), ok('c')],
    )

    expect(bar(container).getAttribute('title')).toBe('1 error · 1 running · 2 success')

    const s = segments(container)
    expect(s.map((x) => x.outcome)).toEqual(['error', 'running', 'success'])
    // flex-grow is the count, so heights are proportional to it.
    expect(s.map((x) => x.flexGrow)).toEqual(['1', '1', '2'])
    expect(s[0].className).toContain('bg-red-400')
    expect(s[1].className).toContain('bg-amber-400')
    expect(s[2].className).toContain('bg-green-400')
  })

  it('all success → a single full-height green segment', () => {
    const { container } = mount([tool('a'), tool('b')], [ok('a'), ok('b')])

    const s = segments(container)
    expect(s).toHaveLength(1)
    expect(s[0].outcome).toBe('success')
    expect(s[0].className).toContain('bg-green-400')
    expect(bar(container).getAttribute('title')).toBe('2 success')
  })

  it('all running → a single amber segment that pulses', () => {
    const { container } = mount([tool('a'), tool('b')], [])

    const s = segments(container)
    expect(s).toHaveLength(1)
    expect(s[0].outcome).toBe('running')
    expect(s[0].className).toContain('bg-amber-400')
    expect(s[0].className).toContain('animate-pulse')
  })

  it('a cancelled result is grey; an error+cancelled result counts as error only', () => {
    const { container } = mount(
      [tool('a'), tool('b'), tool('c')],
      [
        cancelled('a'),
        { ...err('b'), metadata: { tool_call_id: 'b', is_error: true, is_cancelled: true } },
        ok('c'),
      ],
    )

    const s = segments(container)
    expect(s.map((x) => x.outcome)).toEqual(['error', 'cancelled', 'success'])
    expect(s.map((x) => x.flexGrow)).toEqual(['1', '1', '1'])
    expect(bar(container).getAttribute('title')).toBe('1 error · 1 cancelled · 1 success')
  })
})
