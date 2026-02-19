import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDropdownPosition } from '@/hooks'

interface DropdownOption<T> {
  value: T
  label: string
  icon?: ReactNode
}

interface DropdownProps<T> {
  trigger: ReactNode
  options: DropdownOption<T>[]
  onSelect: (value: T) => void
  disabled?: boolean
  className?: string
}

export function Dropdown<T extends string>({
  trigger,
  options,
  onSelect,
  disabled = false,
  className = '',
}: DropdownProps<T>) {
  const { isOpen, toggle, close, position, triggerRef, menuRef } = useDropdownPosition()

  const handleSelect = (value: T) => {
    onSelect(value)
    close()
  }

  return (
    <div ref={triggerRef} className={`relative inline-block ${className}`}>
      <div
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) toggle()
        }}
        className={disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      >
        {trigger}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[120px] rounded-lg glass-heavy shadow-md py-1"
            style={{ top: position.top, left: position.left }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSelect(option.value)
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
