import { useEffect } from 'react'
import { useAtomValue, useStore } from 'jotai'
import { refsEnabledAtom } from '@/atoms/chat'
import { addRefToChatAtom, draggingRefAtom, refsAddAnnouncementAtom } from './addToChat'
import { REF_SELECTOR, resolveSource, writeRefToDataTransfer } from './refSource'

/** Keyboard equivalent of a drag: focus an element that represents an entity, press this. */
export const ADD_TO_CHAT_SHORTCUT = 'Alt+Shift+A'

/** How long a finger must stay down on an entity to add it to the chat. */
export const LONG_PRESS_MS = 500
/** A finger that travels further than this is scrolling, not pressing. */
const LONG_PRESS_SLOP_PX = 10
/** Controls with a gesture of their own: a press that lands on one is theirs. A link is not on the list: its tap navigates, its long press adds. */
const OWN_GESTURE = 'button,input,textarea,select,summary,[role="button"],[contenteditable="true"]'

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
      const source = resolveSource(e.target)
      if (!source || !source.draggable) return
      writeRefToDataTransfer(e.dataTransfer, source.ref)
      store.set(draggingRefAtom, { ...source.ref, label: source.label })
    }
    const onDragEnd = () => store.set(draggingRefAtom, null)
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.altKey && e.shiftKey && e.code === 'KeyA') || e.ctrlKey || e.metaKey) return
      if (!(e.target instanceof Element) || isEditable(e.target)) return
      const source = resolveSource(e.target)
      if (!source) return
      e.preventDefault()
      store.set(addRefToChatAtom, { ref: source.ref, label: source.label, via: 'keyboard' })
    }

    // Long press: the one-finger equivalent of the drag (touch has none that coexists with scrolling).
    // Elements that keep their own drag (`data-po-ref-drag="off"`: the kanban card, dnd-kit's TouchSensor
    // owns the long press there) are left alone; they have the visible "Add to chat" button.
    let press: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null
    let firedAt = -Infinity
    const cancelPress = () => {
      if (press) clearTimeout(press.timer)
      press = null
    }
    const onPointerDown = (e: PointerEvent) => {
      if (press) return cancelPress() // a second finger: pinch / zoom, not a press
      if (e.pointerType !== 'touch' || !(e.target instanceof Element)) return
      const source = resolveSource(e.target)
      if (!source || !source.draggable) return
      const own = e.target.closest(OWN_GESTURE)
      // The control's own gesture wins, except inside the element that carries the reference.
      if (own && (source.via === 'annotation' ? e.target.closest(REF_SELECTOR)?.contains(own) : e.target.closest('a[href]')?.contains(own))) return
      const { ref, label } = source
      press = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(() => {
          press = null
          firedAt = Date.now()
          navigator.vibrate?.(15)
          store.set(addRefToChatAtom, { ref, label, via: 'longpress' })
        }, LONG_PRESS_MS),
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX) cancelPress()
    }
    // The context menu / link preview a long press raises, and the click that may follow it, are not wanted once we fired.
    const recent = () => Date.now() - firedAt < 1500
    const swallow = (e: Event) => {
      if (!recent()) return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', cancelPress)
    document.addEventListener('pointercancel', cancelPress)
    document.addEventListener('scroll', cancelPress, true)
    document.addEventListener('dragstart', cancelPress, true)
    document.addEventListener('contextmenu', swallow, true)
    document.addEventListener('click', swallow, true)

    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragend', onDragEnd)
    // A drop that lands nowhere of ours still ends the drag (bubble phase: the zones read the payload first) (the source may have been unmounted: no dragend).
    document.addEventListener('drop', onDragEnd)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelPress()
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', cancelPress)
      document.removeEventListener('pointercancel', cancelPress)
      document.removeEventListener('scroll', cancelPress, true)
      document.removeEventListener('dragstart', cancelPress, true)
      document.removeEventListener('contextmenu', swallow, true)
      document.removeEventListener('click', swallow, true)
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
