/** The room the full-screen chat makes for its timeline column: hidden, never covered. */
import { describe, expect, it } from 'vitest'
import { CHAT_COLUMN_WIDTH, CHAT_SIDEBAR_WIDTH, timelineRoom } from './timelineRoom'

/** Width the conversation keeps at `width` px, from what stays on screen (the widths the chat renders with). */
function conversation(width: number, treeOpen: boolean) {
  const { hideSidebar, hideTree } = timelineRoom({ timelineOpen: true, treeOpen, lg: width >= 1024, xl: width >= 1280 })
  return width - (hideSidebar ? 0 : CHAT_SIDEBAR_WIDTH.px) - CHAT_COLUMN_WIDTH.px - (treeOpen && !hideTree ? CHAT_COLUMN_WIDTH.px : 0)
}

describe('timelineRoom', () => {
  it('declares widths that match their Tailwind classes (w-N is N × 4 px)', () => {
    for (const w of [CHAT_SIDEBAR_WIDTH, CHAT_COLUMN_WIDTH]) {
      expect(w.className).toMatch(/^w-\d+$/)
      expect(Number(w.className.slice(2)) * 4).toBe(w.px)
    }
  })

  it('hides nothing while the timeline is closed', () => {
    expect(timelineRoom({ timelineOpen: false, treeOpen: true, lg: false, xl: false })).toEqual({ hideSidebar: false, hideTree: false })
  })

  it.each([
    [768, false, { hideSidebar: true, hideTree: false }],
    [800, true, { hideSidebar: true, hideTree: true }],
    [1024, false, { hideSidebar: false, hideTree: false }],
    [1024, true, { hideSidebar: true, hideTree: false }],
    [1280, true, { hideSidebar: false, hideTree: false }],
  ])('at %i px (tree open: %s)', (width, treeOpen, expected) => {
    expect(timelineRoom({ timelineOpen: true, treeOpen, lg: width >= 1024, xl: width >= 1280 })).toEqual(expected)
  })

  it.each([768, 800, 900, 1024, 1100, 1280, 1440])('leaves the conversation at least 352 px at %i px, tree open or not', (width) => {
    expect(conversation(width, false)).toBeGreaterThanOrEqual(384)
    expect(conversation(width, true)).toBeGreaterThanOrEqual(352)
  })
})
