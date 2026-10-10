/** The room the full-screen chat makes for its timeline column: hidden, never covered. */
import { describe, expect, it } from 'vitest'
import { timelineRoom } from './timelineRoom'

const SIDEBAR = 288
const COLUMN = 320
const MIN_CONVERSATION = 384

/** Width the conversation keeps at `width` px, from what stays on screen. */
function conversation(width: number, treeOpen: boolean) {
  const lg = width >= 1024
  const xl = width >= 1280
  const { hideSidebar, hideTree } = timelineRoom({ timelineOpen: true, treeOpen, lg, xl })
  return width - (hideSidebar ? 0 : SIDEBAR) - COLUMN - (treeOpen && !hideTree ? COLUMN : 0)
}

describe('timelineRoom', () => {
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
    expect(conversation(width, false)).toBeGreaterThanOrEqual(MIN_CONVERSATION)
    expect(conversation(width, true)).toBeGreaterThanOrEqual(352)
  })
})
