import { useState, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { useDropdownPosition } from '@/hooks'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  label?: string
  error?: string
  disabled?: boolean
  className?: string
  placeholder?: string
  icon?: ReactNode
}

export function Select({
  options,
  value,
  onChange,
  label,
  error,
  disabled = false,
  className = '',
  placeholder,
  icon,
}: SelectProps) {
  const { isOpen, toggle, close, position, triggerRef, menuRef } = useDropdownPosition()
  const [activeIndex, setActiveIndex] = useState(-1)
  const id = useId()
  const listboxId = `${id}-listbox`

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder || ''
  const hasValue = options.some((o) => o.value === value)

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue)
    close()
    setActiveIndex(-1)
  }

  const handleTriggerClick = () => {
    if (!disabled) {
      toggle()
      // Reset active index to selected item when opening
      if (!isOpen) {
        const idx = options.findIndex((o) => o.value === value)
        setActiveIndex(idx >= 0 ? idx : 0)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) {
          toggle()
          const idx = options.findIndex((o) => o.value === value)
          setActiveIndex(idx >= 0 ? idx : 0)
        } else {
          setActiveIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0))
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (isOpen) {
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1))
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (isOpen && activeIndex >= 0 && activeIndex < options.length) {
          handleSelect(options[activeIndex].value)
        } else if (!isOpen) {
          handleTriggerClick()
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        setActiveIndex(-1)
        break
      case 'Home':
        if (isOpen) {
          e.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (isOpen) {
          e.preventDefault()
          setActiveIndex(options.length - 1)
        }
        break
    }
  }

  const activeOptionId = activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label id={`${id}-label`} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div ref={triggerRef} className="relative">
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={isOpen ? activeOptionId : undefined}
          aria-labelledby={label ? `${id}-label` : undefined}
          onClick={handleTriggerClick}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`
            w-full flex items-center gap-2 px-3 py-2 bg-surface-base border rounded-lg
            text-left text-sm transition-colors
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500' : error ? 'border-red-500' : 'border-border-default hover:border-white/[0.2]'}
          `}
        >
          {icon && <span className="shrink-0 text-gray-500">{icon}</span>}
          <span className={`flex-1 truncate ${hasValue ? 'text-gray-100' : 'text-gray-500'}`}>
            {selectedLabel}
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? `${id}-label` : undefined}
            className="fixed z-[9999] rounded-lg glass-heavy shadow-md py-1 max-h-60 overflow-y-auto"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              minWidth: 120,
            }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value
              const isActive = index === activeIndex

              return (
                <button
                  key={option.value}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSelect(option.value)
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`
                    w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                    ${isActive ? 'bg-white/[0.06]' : ''}
                    ${isSelected ? 'text-indigo-400 font-medium' : 'text-gray-200'}
                  `}
                >
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 shrink-0 text-indigo-400" strokeWidth={2.5} />
                  )}
                  {!isSelected && <span className="w-3.5 shrink-0" />}
                  {option.label}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
