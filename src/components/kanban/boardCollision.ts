import { closestCenter, pointerWithin, type CollisionDetection } from '@dnd-kit/core'

/**
 * Collision of the boards. With a pointer, a card is over a column only while
 * the pointer is inside it: a drop anywhere else (the chat, the sidebar...)
 * resolves to no target and moves nothing. `closestCenter` alone picks the
 * nearest column wherever the pointer is, which turned "drop on the chat"
 * into a status change. The keyboard has no pointer: nearest column, as before.
 */
export const boardCollision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
