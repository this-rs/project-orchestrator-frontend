import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThinkingBlock } from '../ThinkingBlock'

describe('ThinkingBlock', () => {
  it('renders nothing for a finished block with no text', () => {
    // Opus 4.7+ / Sonnet 5+ default to display "omitted": the block arrives with an
    // empty string and a signature only. A toggle that expands onto nothing is noise.
    const { container } = render(<ThinkingBlock content="" />)
    expect(container.firstChild).toBeNull()
  })

  it('treats whitespace-only text as empty', () => {
    const { container } = render(<ThinkingBlock content={'  \n '} />)
    expect(container.firstChild).toBeNull()
  })

  it('still shows the live indicator while streaming, even with no text yet', () => {
    render(<ThinkingBlock content="" isStreaming />)
    expect(screen.getByText('Thinking...')).toBeTruthy()
  })

  it('shows and expands a block that has text', () => {
    render(<ThinkingBlock content="checking the parser" />)
    fireEvent.click(screen.getByText('Thought process'))
    expect(screen.getByText('checking the parser')).toBeTruthy()
  })
})
