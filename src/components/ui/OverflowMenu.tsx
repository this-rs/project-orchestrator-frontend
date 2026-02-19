import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

export interface OverflowMenuAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}

interface OverflowMenuProps {
  actions: OverflowMenuAction[]
  className?: string
}

export function OverflowMenu({ actions, className = '' }: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuWidth = menuRef.current?.offsetWidth || 140
    const menuHeight = menuRef.current?.offsetHeight || 200
    const spaceBelow = window.innerHeight - rect.bottom
    const showAbove = spaceBelow < menuHeight && rect.top > menuHeight

    setPosition({
      top: showAbove ? rect.top + window.scrollY - menuHeight - 4 : rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX - menuWidth,
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return

    updatePosition()

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    function handleScroll() {
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen, updatePosition])

  return (
    <div ref={triggerRef} className={`relative inline-block ${className}`}>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
        aria-label="More actions"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[140px] rounded-lg glass-heavy shadow-md py-1"
            style={{ top: position.top, left: position.left }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsOpen(false)
                  action.onClick()
                }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  action.variant === 'danger'
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-gray-200 hover:bg-white/[0.06]'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
