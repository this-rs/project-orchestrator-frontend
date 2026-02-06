import { useState, useRef, useEffect, type ReactNode } from 'react'

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
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleSelect = (value: T) => {
    onSelect(value)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <div
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) setIsOpen(!isOpen)
        }}
        className={disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      >
        {trigger}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 min-w-[120px] rounded-lg bg-[#232733] border border-white/[0.1] shadow-[0_4px_12px_rgba(0,0,0,0.4)] py-1">
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
        </div>
      )}
    </div>
  )
}
