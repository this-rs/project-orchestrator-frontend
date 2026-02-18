import { useState, useRef, useEffect, useCallback } from 'react'

interface UseDropdownPositionOptions {
  /** Close when user scrolls (default: true) */
  closeOnScroll?: boolean
}

interface UseDropdownPositionReturn {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toggle: () => void
  close: () => void
  position: { top: number; left: number; width: number }
  triggerRef: React.RefObject<HTMLDivElement | null>
  menuRef: React.RefObject<HTMLDivElement | null>
}

export function useDropdownPosition(
  options: UseDropdownPositionOptions = {},
): UseDropdownPositionReturn {
  const { closeOnScroll = true } = options
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight || 200
    const menuWidth = menuRef.current?.offsetWidth || rect.width
    const spaceBelow = window.innerHeight - rect.bottom
    const showAbove = spaceBelow < menuHeight && rect.top > menuHeight

    // Use fixed positioning (no scrollY/scrollX) — menu is rendered in a portal with position:fixed
    const PAD = 8
    let top = showAbove ? rect.top - menuHeight - 4 : rect.bottom + 4
    let left = rect.left

    // Clamp to viewport bounds
    top = Math.max(PAD, Math.min(top, window.innerHeight - menuHeight - PAD))
    left = Math.max(PAD, Math.min(left, window.innerWidth - menuWidth - PAD))

    setPosition({ top, left, width: rect.width })
  }, [])

  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  useEffect(() => {
    if (!isOpen) return

    updatePosition()

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    function handleScroll(event: Event) {
      if (!closeOnScroll) return
      // Don't close when scrolling inside the dropdown menu itself
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return
      }
      // Only close if the scroll happened in an ancestor of the trigger.
      // Scrolls in unrelated containers (e.g. a sibling chat messages area
      // auto-scrolling during streaming) should NOT close the dropdown.
      if (triggerRef.current && event.target instanceof Node) {
        if (!event.target.contains(triggerRef.current)) {
          return
        }
      }
      // Ancestor of the trigger scrolled — reposition instead of closing.
      // This keeps the dropdown open and visually attached to the trigger.
      updatePosition()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen, updatePosition, closeOnScroll])

  return { isOpen, setIsOpen, toggle, close, position, triggerRef, menuRef }
}
