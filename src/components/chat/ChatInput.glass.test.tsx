/**
 * The composer is glass: no container background behind it, and the box itself is translucent
 * with a blur, so the transcript scrolling under it stays legible but soft.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ChatInput } from './ChatInput'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

function mount() {
  render(
    <Provider store={createStore()}>
      <ChatInput onSend={() => {}} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
    </Provider>,
  )
  const box = screen.getByRole('textbox').parentElement as HTMLElement
  return { box, root: box.parentElement as HTMLElement }
}

describe('ChatInput — glass composer', () => {
  it('the box blurs what scrolls under it, and its fill is translucent', () => {
    const { box } = mount()
    expect(box.className).toContain('backdrop-blur')
    expect(box.className).toMatch(/\bbg-[a-z-]+\/\d+\b/) // a fill with an alpha, e.g. bg-surface-base/55
    expect(box.className).not.toContain('bg-white/[0.04]') // the old flat fill
  })

  it('has no background of its own around the box (the transcript shows through)', () => {
    const { root } = mount()
    expect(root.className).not.toMatch(/(^|\s)bg-/)
    expect(root.className).not.toMatch(/backdrop-/)
  })

  it('does not swallow clicks aimed at the transcript through its margins', () => {
    const { root, box } = mount()
    expect(root.className).toContain('pointer-events-none')
    expect(root.className).toContain('[&>*]:pointer-events-auto')
    expect(box.parentElement).toBe(root)
  })
})
