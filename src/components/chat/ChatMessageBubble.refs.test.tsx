import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

describe('ChatMessageBubble — entities cited by the agent', () => {
  const agent = (content: string): ChatMessage => ({
    id: 'a1',
    role: 'assistant',
    blocks: [{ id: 'b1', type: 'text', content }],
    timestamp: new Date(),
  })

  it('draws a cited #plan:uuid as a chip in an assistant text block', async () => {
    render(inWorkspace(<ChatMessageBubble message={agent(`voir ${a.token}`)} />))
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/workspace/acme/plans/${a.ref.id}`)
  })
})

/** An id that is well-formed and names nothing: the shape a hallucinated citation has. */
const GHOST = { kind: 'plan', id: '9f1e0a10-0000-4000-8000-00000000dead' }

const inWorkspace = (node: ReactNode) => (
  <MemoryRouter initialEntries={['/workspace/acme/today']}>
    <Routes>
      <Route path="/workspace/:slug/*" element={node} />
    </Routes>
  </MemoryRouter>
)

const agent = (content: string, cited?: ChatReference[]): ChatMessage => ({
  id: 'a1',
  role: 'assistant',
  blocks: [{ id: 'b1', type: 'text', content }],
  timestamp: new Date(),
  ...(cited ? { cited } : {}),
})

describe('ChatMessageBubble — a citation the server says it cannot read', () => {
  it('draws plain text, and no link at all, for a citation that names nothing', () => {
    const token = `#plan:${GHOST.id}`
    const { container } = render(
      inWorkspace(
        <ChatMessageBubble message={agent(`voir ${token}`, [{ ...GHOST, resolution: 'not_found' }])} />,
      ),
    )
    // The token is still the text it was: the person reads what the agent wrote.
    expect(container.textContent).toContain(token)
    // …but nothing claims an entity: no chip, and above all no link to a page
    // that does not exist.
    expect(screen.queryByTestId('cited-ref')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('never tells a denied citation from a missing one: both read as plain text', () => {
    const token = `#plan:${GHOST.id}`
    const { container } = render(
      inWorkspace(
        <ChatMessageBubble message={agent(`voir ${token}`, [{ ...GHOST, resolution: 'forbidden' }])} />,
      ),
    )
    expect(container.textContent).toContain(token)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('still draws the chip, and the link, for a citation the server resolved', () => {
    const { container } = render(
      inWorkspace(
        <ChatMessageBubble
          message={agent(`voir ${a.token}`, [{ ...(a.ref as ChatReference), label: 'Plan A', resolution: 'ok' }])}
        />,
      ),
    )
    expect(screen.getByTestId('cited-ref')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/workspace/acme/plans/${a.ref.id}`)
    expect(container.textContent).toContain('Plan A')
  })
})
