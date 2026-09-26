/**
 * Regression tests for the chat flicker while stream events are received
 * ("scintillement sur la réception de stream events").
 *
 * 1. Auto-scroll must pin the view to the bottom IN THE SAME COMMIT as the
 *    content that grew (before the browser can paint). It used to run in a
 *    passive useEffect: each stream_delta painted one frame with the new
 *    line hanging below the viewport, then snapped — the bottom jittered.
 *
 * 2. A streaming block ending with "text\n-" must not flash the previous
 *    line as a setext <h2> (CommonMark reads a lone `-` line as a heading
 *    underline until the next delta turns it into a list item).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import type { ChatMessage } from '@/types'
import { ChatMessages } from './ChatMessages'
import { ChatMessageBubble } from './ChatMessageBubble'

// ---------------------------------------------------------------------------
// jsdom has no layout: give the scroll container a deterministic geometry.
// scrollHeight grows with the rendered text, so a stream_delta really makes
// the content taller, like in a browser.
// ---------------------------------------------------------------------------
const CLIENT_HEIGHT = 100
const scrollTops = new WeakMap<Element, number>()
const saved: Record<string, PropertyDescriptor | undefined> = {}

beforeAll(() => {
  for (const key of ['scrollHeight', 'clientHeight', 'scrollTop'] as const) {
    saved[key] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return CLIENT_HEIGHT + (this.textContent?.length ?? 0) * 10
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => CLIENT_HEIGHT,
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return scrollTops.get(this) ?? 0
    },
    set(this: HTMLElement, v: number) {
      const max = Math.max(0, this.scrollHeight - this.clientHeight)
      scrollTops.set(this, Math.min(Math.max(0, v), max))
    },
  })
})

afterAll(() => {
  for (const [key, desc] of Object.entries(saved)) {
    if (desc) Object.defineProperty(HTMLElement.prototype, key, desc)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
  }
})

const noop = () => {}

function msgs(streamed: string): ChatMessage[] {
  return [
    { id: 'u1', role: 'user', blocks: [{ id: 'ub1', type: 'text', content: 'go' }], timestamp: new Date(0) },
    { id: 'a1', role: 'assistant', blocks: [{ id: 'ab1', type: 'text', content: streamed }], timestamp: new Date(0) },
  ]
}

/**
 * Rendered AFTER ChatMessages: its layout effect runs at the end of the
 * commit — i.e. it sees exactly what the browser would paint if nothing
 * else ran before the next frame (passive effects are not guaranteed to).
 */
function PaintProbe({ onCommit }: { onCommit: () => void }) {
  useLayoutEffect(onCommit)
  return null
}

describe('ChatMessages — streaming does not flicker', () => {
  it('keeps the view pinned to the bottom in the very commit that grows the content', () => {
    const store = createStore()
    const gapsAtCommit: number[] = []
    const probe = () => {
      const el = document.querySelector('.overflow-y-auto') as HTMLElement | null
      if (el) gapsAtCommit.push(el.scrollHeight - el.scrollTop - el.clientHeight)
    }
    const view = (content: string): ReactNode => (
      <Provider store={store}>
        <ChatMessages
          messages={msgs(content)}
          isStreaming
          onRespondPermission={noop}
          onRespondInput={noop}
        />
        <PaintProbe onCommit={probe} />
      </Provider>
    )

    let text = 'Bonjour'
    const { rerender } = render(view(text))
    // Successive stream_delta events: each one grows the streamed block.
    for (const delta of [' le', ' monde', ', voici', ' la', ' suite.']) {
      text += delta
      rerender(view(text))
    }

    // One sample per commit; every painted frame must already be at the bottom.
    expect(gapsAtCommit.length).toBeGreaterThanOrEqual(6)
    expect(gapsAtCommit).toEqual(gapsAtCommit.map(() => 0))
  })
})

describe('ChatMessageBubble — ambiguous markdown tail while streaming', () => {
  const bubble = (content: string, isStreaming: boolean) => (
    <ChatMessageBubble
      message={msgs(content)[1]}
      isStreaming={isStreaming}
      onRespondPermission={noop}
      onRespondInput={noop}
    />
  )

  it('never renders "text\\n-" as a setext heading mid-stream', () => {
    const { container, rerender } = render(bubble('Voici les étapes :', true))
    const headingsSeen: number[] = []
    for (const snapshot of ['Voici les étapes :\n', 'Voici les étapes :\n-', 'Voici les étapes :\n- a', 'Voici les étapes :\n- a\n-', 'Voici les étapes :\n- a\n- b']) {
      rerender(bubble(snapshot, true))
      headingsSeen.push(container.querySelectorAll('h1,h2,h3,h4,h5,h6').length)
    }
    expect(headingsSeen).toEqual([0, 0, 0, 0, 0])
    expect(container.querySelectorAll('li')).toHaveLength(2)
    // The text itself is never lost.
    expect(container.textContent).toContain('Voici les étapes :')
  })

  it('still renders a real setext heading once the message is complete', () => {
    const { container } = render(bubble('Titre\n---', false))
    expect(container.querySelector('h2')?.textContent).toBe('Titre')
  })
})
