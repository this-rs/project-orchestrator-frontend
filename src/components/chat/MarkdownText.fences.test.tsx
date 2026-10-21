import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownText, type FenceRenderer } from './MarkdownText'
import { fenceClosed } from './viz/iso/fence'

const Probe: FenceRenderer = ({ source, streaming, inline }) => (
  <span data-testid="probe" data-streaming={String(streaming)} data-inline={String(!!inline)}>
    {source}
  </span>
)

describe('fenced renderers of the agent text', () => {
  it('a block is "streaming" only until its closing fence arrives', () => {
    const open = render(<MarkdownText content={'a\n\n```probe\nx'} fences={{ probe: Probe }} isStreaming />)
    expect(open.getByTestId('probe').dataset.streaming).toBe('true')
    open.unmount()
    render(<MarkdownText content={'a\n\n```probe\nx\n```\n\nb'} fences={{ probe: Probe }} isStreaming />)
    expect(screen.getByTestId('probe').dataset.streaming).toBe('false')
  })

  it('the same components from one delta to the next: a drawn block is not re-mounted', () => {
    let mounts = 0
    const Counting: FenceRenderer = ({ source }) => {
      useOnce(() => {
        mounts++
      })
      return <span>{source}</span>
    }
    const fences = { probe: Counting }
    const { rerender } = render(<MarkdownText content={'```probe\nx\n```\n\nb'} fences={fences} isStreaming />)
    rerender(<MarkdownText content={'```probe\nx\n```\n\nbc'} fences={fences} isStreaming />)
    rerender(<MarkdownText content={'```probe\nx\n```\n\nbcd'} fences={fences} isStreaming />)
    expect(mounts).toBe(1)
  })

  it('fenceClosed reads the block of the source at its position', () => {
    const text = '```js\nx\n```'
    expect(fenceClosed(text, { start: { offset: 0 }, end: { offset: text.length } })).toBe(true)
    expect(fenceClosed('```js\nx', { start: { offset: 0 }, end: { offset: 7 } })).toBe(false)
    expect(fenceClosed('$$\nx\n$$', { start: { offset: 0 }, end: { offset: 7 } })).toBe(true)
    expect(fenceClosed('```', undefined)).toBe(false)
  })
})

import { useEffect } from 'react'
function useOnce(fn: () => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fn, [])
}
