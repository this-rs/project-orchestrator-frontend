import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { positionFloating } from './menuPosition'

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled])'

interface FloatingMenuProps {
  open: boolean
  /** Called with `true` when focus should go back to the trigger (Escape / selection). */
  onClose: (focusTrigger: boolean) => void
  triggerRef: RefObject<HTMLElement | null>
  id: string
  label: string
  align?: 'start' | 'end'
  className?: string
  children: ReactNode
}

/**
 * Low-level floating menu used by OverflowMenu and StatusMenu.
 * Portal + JS positioning (works without CSS Anchor Positioning), focus on
 * first/selected item, Arrow/Home/End navigation, Escape/Tab/outside-tap
 * dismissal, follows the trigger on scroll/resize. Events never bubble to
 * React ancestors (rows, links).
 */
export function FloatingMenu({ open, onClose, triggerRef, id, label, align = 'end', className = '', children }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const reposition = useCallback(() => {
    if (triggerRef.current && menuRef.current) positionFloating(triggerRef.current, menuRef.current, { align })
  }, [triggerRef, align])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const menu = menuRef.current
    const target =
      menu?.querySelector<HTMLElement>('[aria-checked="true"]:not([disabled])') ??
      menu?.querySelector<HTMLElement>(ITEM_SELECTOR)
    target?.focus({ preventScroll: true })
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, onClose, reposition, triggerRef])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    e.stopPropagation()
    const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])
    if (list.length === 0) return
    const idx = list.indexOf(document.activeElement as HTMLElement)
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        list[(idx + 1) % list.length].focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        list[(idx - 1 + list.length) % list.length].focus()
        break
      case 'Home':
        e.preventDefault()
        list[0].focus()
        break
      case 'End':
        e.preventDefault()
        list[list.length - 1].focus()
        break
      case 'Escape':
        e.preventDefault()
        onClose(true)
        break
      case 'Tab':
        onClose(false)
        break
    }
  }

  if (!open) return null
  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={`fixed z-[60] min-w-[168px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-white/[0.08] bg-surface-popover py-1 shadow-lg ${className}`}
      style={{ top: 0, left: 0 }}
    >
      {children}
    </div>,
    document.body,
  )
}

