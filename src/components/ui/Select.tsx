import { useState, useEffect, useRef, useId, type ReactNode, type CSSProperties } from 'react'
import { ChevronDown, Check } from 'lucide-react'

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
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const reactId = useId()
  const uid = reactId.replace(/:/g, '')
  const menuId = `sel-${uid}-listbox`
  const anchorName = `--sel-${uid}`
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder || ''
  const hasValue = options.some((o) => o.value === value)

  // Sync React state with native popover toggle events (light-dismiss, etc.)
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const handleToggle = (e: Event) => {
      const open = (e as ToggleEvent).newState === 'open'
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with native popover toggle
      setIsOpen(open)
      if (!open) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with native popover toggle
        setActiveIndex(-1)
      }
    }
    menu.addEventListener('toggle', handleToggle)
    return () => menu.removeEventListener('toggle', handleToggle)
  }, [])

  const openMenu = () => {
    try {
      menuRef.current?.showPopover()
    } catch {
      /* already open */
    }
    const idx = options.findIndex((o) => o.value === value)
    setActiveIndex(idx >= 0 ? idx : 0)
  }

  const closeMenu = () => {
    try {
      menuRef.current?.hidePopover()
    } catch {
      /* already closed */
    }
    setActiveIndex(-1)
  }

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue)
    closeMenu()
    triggerRef.current?.focus()
  }

  const handleTriggerClick = () => {
    if (disabled) return
    if (isOpen) closeMenu()
    else openMenu()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) {
          openMenu()
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
          openMenu()
        }
        break
      case 'Escape':
        e.preventDefault()
        closeMenu()
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

  const activeOptionId = activeIndex >= 0 ? `sel-${uid}-option-${activeIndex}` : undefined

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label id={`sel-${uid}-label`} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-activedescendant={isOpen ? activeOptionId : undefined}
        aria-labelledby={label ? `sel-${uid}-label` : undefined}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-full flex items-center gap-2 px-3 py-2 bg-surface-base border rounded-lg
          text-left text-sm transition-colors
          focus:outline-none input-focus-glow
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500' : error ? 'border-red-500' : 'border-border-default hover:border-white/[0.2]'}
        `}
        style={{ anchorName } as CSSProperties}
      >
        {icon && <span className="shrink-0 text-gray-500">{icon}</span>}
        <span className={`flex-1 truncate ${hasValue ? 'text-gray-100' : 'text-gray-500'}`}>
          {selectedLabel}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}

      {/* Popover dropdown — rendered in top layer, positioned via CSS anchor */}
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="listbox"
        aria-labelledby={label ? `sel-${uid}-label` : undefined}
        className="popover-dropdown glass-heavy rounded-lg shadow-md py-1 max-h-60 overflow-y-auto"
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value
          const isActive = index === activeIndex

          return (
            <button
              key={option.value}
              id={`sel-${uid}-option-${index}`}
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
      </div>
    </div>
  )
}
