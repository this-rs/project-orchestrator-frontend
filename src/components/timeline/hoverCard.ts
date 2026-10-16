/**
 * The state of the hover card of a view: the element carrying
 * `data-timeline-item` under the pointer (or taking the focus), its item found
 * in the view's own lookup, and where the card is drawn.
 */
import { useCallback, useState } from 'react'
import { hoverInfo, type HoverCard } from './hoverInfo'
import type { TimelineItem } from './model'
import type { TimelineLabels } from './status'

export function useHoverCard(labels: TimelineLabels, itemById: (id: string) => TimelineItem | undefined) {
  const [card, setCard] = useState<HoverCard | null>(null)

  const show = useCallback((el: Element | null, x: number, y: number) => {
    const id = el instanceof HTMLElement ? el.dataset.timelineItem : undefined
    const item = id ? itemById(id) : undefined
    setCard(item ? { info: hoverInfo(item, labels), x, y } : null)
  }, [itemById, labels])

  const hide = useCallback(() => setCard(null), [])

  return { card, show, hide }
}

/** The element of `target` that carries an item, if any. */
export function itemElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest<HTMLElement>('[data-timeline-item]') : null
}
