/**
 * Dropping outside the columns (typically on the chat) must not move the card.
 *
 * Run with: npx vitest run src/components/kanban/__tests__/boardCollision.test.ts
 */
import { describe, expect, it } from 'vitest'
import type { CollisionDetection } from '@dnd-kit/core'
import { boardCollision } from '../boardCollision'

const rect = (left: number, top: number, w = 100, h = 200) => ({ left, top, width: w, height: h, right: left + w, bottom: top + h })
type Args = Parameters<CollisionDetection>[0]

function args(pointer: { x: number; y: number } | null): Args {
  const a = rect(0, 0)
  const b = rect(120, 0)
  return {
    active: { id: 'card', data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    collisionRect: rect(pointer?.x ?? 10, pointer?.y ?? 10, 50, 20),
    droppableRects: new Map([['a', a], ['b', b]]),
    droppableContainers: [
      { id: 'a', key: 'a', data: { current: undefined }, disabled: false, node: { current: null }, rect: { current: a } },
      { id: 'b', key: 'b', data: { current: undefined }, disabled: false, node: { current: null }, rect: { current: b } },
    ],
    pointerCoordinates: pointer,
  } as unknown as Args
}

describe('boardCollision', () => {
  it('pointer inside a column -> that column', () => {
    expect(boardCollision(args({ x: 150, y: 50 })).map((c) => c.id)).toEqual(['b'])
  })
  it('pointer far outside every column (over the chat) -> no target at all', () => {
    expect(boardCollision(args({ x: 900, y: 50 }))).toEqual([])
  })
  it('keyboard drag (no pointer) still lands on the nearest column', () => {
    expect(boardCollision(args(null))[0]?.id).toBe('a')
  })
})
