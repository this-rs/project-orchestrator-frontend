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
    const spaceBelow = window.innerHeight - rect.bottom
    const showAbove = spaceBelow < menuHeight && rect.top > menuHeight

    setPosition({
      top: showAbove
        ? rect.top + window.scrollY - menuHeight - 4
        : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    })
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

    function handleScroll() {
      if (closeOnScroll) setIsOpen(false)
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
