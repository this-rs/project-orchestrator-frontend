import { useState, useRef, useEffect } from 'react'

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
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div ref={menuRef} className={`relative inline-block ${className}`}>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
        aria-label="More actions"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 min-w-[140px] rounded-lg bg-[#232733] border border-white/[0.1] shadow-[0_4px_12px_rgba(0,0,0,0.4)] py-1">
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
        </div>
      )}
    </div>
  )
}
