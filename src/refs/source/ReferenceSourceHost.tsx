import { useEffect } from 'react'
import { useAtomValue, useStore } from 'jotai'
import { refsEnabledAtom } from '@/atoms/chat'
import { addRefToChatAtom, draggingRefAtom, refsAddAnnouncementAtom } from './addToChat'
import {
  REF_ATTR,
  REF_DRAG_ATTR,
  REF_LABEL_ATTR,
  REF_SELECTOR,
  parseRefAttr,
  writeRefToDataTransfer,
} from './refSource'

/** Keyboard equivalent of a drag: focus an element that represents an entity, press this. */
export const ADD_TO_CHAT_SHORTCUT = 'Alt+Shift+A'

const isEditable = (el: Element): boolean =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLElement && el.isContentEditable)

/**
 * Mounted ONCE (MainLayout). The only `dragstart` listener of the app for
 * references: it reads the closest ancestor carrying `data-po-ref`, so a
 * screen declares an element and never writes a handler. Also owns the
 * keyboard shortcut and the screen-reader live region of the add path.
 *
 * Off (no listener, no node) unless the server announced refs_v1.
 */
export function ReferenceSourceHost() {
  const enabled = useAtomValue(refsEnabledAtom)
  const store = useStore()
  const announcement = useAtomValue(refsAddAnnouncementAtom)

  useEffect(() => {
    if (!enabled) return
    const onDragStart = (e: DragEvent) => {
      // A text selection being dragged has a Text node as target: not an entity, left alone.
      if (!(e.target instanceof Element) || !e.dataTransfer) return
      const carrier = e.target.closest(REF_SELECTOR)
      if (!carrier || carrier.getAttribute(REF_DRAG_ATTR) === 'off') return
      const ref = parseRefAttr(carrier.getAttribute(REF_ATTR))
      if (!ref) return
      writeRefToDataTransfer(e.dataTransfer, ref)
      store.set(draggingRefAtom, { ...ref, label: carrier.getAttribute(REF_LABEL_ATTR) ?? undefined })
    }
    const onDragEnd = () => store.set(draggingRefAtom, null)
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.altKey && e.shiftKey && e.code === 'KeyA') || e.ctrlKey || e.metaKey) return
      if (!(e.target instanceof Element) || isEditable(e.target)) return
      const carrier = e.target.closest(REF_SELECTOR)
      const ref = carrier ? parseRefAttr(carrier.getAttribute(REF_ATTR)) : null
      if (!carrier || !ref) return
      e.preventDefault()
      store.set(addRefToChatAtom, { ref, label: carrier.getAttribute(REF_LABEL_ATTR) ?? undefined, via: 'keyboard' })
    }
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragend', onDragEnd)
    // A drop that lands nowhere of ours still ends the drag (bubble phase: the zones read the payload first) (the source may have been unmounted: no dragend).
    document.addEventListener('drop', onDragEnd)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragend', onDragEnd)
      document.removeEventListener('drop', onDragEnd)
      document.removeEventListener('keydown', onKeyDown)
      store.set(draggingRefAtom, null)
    }
  }, [enabled, store])

  if (!enabled) return null
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="refs-add-announcer">
      {announcement.text}
      {announcement.n % 2 === 1 ? ' ' : ''}
    </div>
  )
}
