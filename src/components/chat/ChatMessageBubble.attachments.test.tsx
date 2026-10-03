import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessageBubble } from './ChatMessageBubble'
import type { ChatMessage } from '@/types'

const msg = (attachments?: ChatMessage['attachments']): ChatMessage => ({
  id: 'm1',
  role: 'user',
  blocks: [{ id: 'b1', type: 'text', content: 'see the file' }],
  timestamp: new Date(),
  attachments,
})

describe('ChatMessageBubble attachments', () => {
  it('draws one chip per attached document under the text', () => {
    render(
      <ChatMessageBubble
        message={msg([
          { id: 'd1', filename: 'report.pdf', mime_type: 'application/pdf', size_bytes: 2048 },
          { id: 'd2', filename: 'shot.png', mime_type: 'image/png', size_bytes: 10 },
        ])}
      />,
    )
    const chips = screen.getAllByTestId('message-attachment')
    expect(chips).toHaveLength(2)
    expect(chips[0].textContent).toContain('report.pdf')
    expect(screen.getByText('see the file')).toBeTruthy()
  })

  it('draws no chip row for a plain message', () => {
    render(<ChatMessageBubble message={msg()} />)
    expect(screen.queryByTestId('message-attachment')).toBeNull()
  })
})
