import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import tokens from '@/refs/__fixtures__/tokens.json'
import { ChatMessageBubble } from './ChatMessageBubble'
import type { ChatMessage } from '@/types'
import type { ChatReference } from '@/refs/types'

const a = tokens.valid[0]
const b = tokens.valid[1]
const refA = a.ref as ChatReference
const refB = b.ref as ChatReference

const msg = (content: string, refs?: ChatReference[]): ChatMessage => ({
  id: 'm1',
  role: 'user',
  blocks: [{ id: 'b1', type: 'text', content }],
  timestamp: new Date(),
  ...(refs ? { refs } : {}),
})

describe('ChatMessageBubble — references', () => {
  it('replaces each token the message carries with a chip, inside the text', () => {
    const { container } = render(
      <ChatMessageBubble message={msg(`voir ${a.token} et ${b.token}`, [{ ...refA, label: 'Plan A', resolution: 'ok' }, refB])} />,
    )
    const chips = screen.getAllByTestId('reference-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].textContent).toContain('Plan A')
    expect(container.textContent).toContain('voir ')
    expect(container.textContent).not.toContain(a.ref.id)
    expect(screen.queryByRole('list', { name: 'References' })).toBeNull()
  })

  it('keeps a token with no matching reference as plain text', () => {
    const { container } = render(<ChatMessageBubble message={msg(`voir ${a.token}`, [refB])} />)
    expect(container.textContent).toContain(a.token)
    // the reference whose token is absent still shows, in a labelled list
    const list = screen.getByRole('list', { name: 'References' })
    expect(list.querySelectorAll('[data-testid="reference-chip"]')).toHaveLength(1)
  })

  it('draws the text exactly as before when the message has no references', () => {
    const plain = render(<ChatMessageBubble message={msg(`voir ${a.token}`)} />)
    expect(screen.queryByTestId('reference-chip')).toBeNull()
    expect(plain.container.textContent).toContain(`voir ${a.token}`)
    const empty = render(<ChatMessageBubble message={msg(`voir ${a.token}`, [])} />)
    expect(empty.container.innerHTML).toBe(plain.container.innerHTML)
  })
})
