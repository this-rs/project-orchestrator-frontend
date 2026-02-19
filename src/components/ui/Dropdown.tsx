import { useState, useRef, useEffect, useId, type ReactNode, type CSSProperties } from 'react'

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
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const uid = reactId.replace(/:/g, '')
  const anchorName = `--dd-${uid}`
  const menuId = `dd-${uid}-menu`

  // Sync React state with native popover toggle events (light-dismiss, etc.)
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const handleToggle = (e: Event) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with native popover toggle
      setIsOpen((e as ToggleEvent).newState === 'open')
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
  }

  const closeMenu = () => {
    try {
      menuRef.current?.hidePopover()
    } catch {
      /* already closed */
    }
  }

  const handleSelect = (value: T) => {
    onSelect(value)
    closeMenu()
  }

  return (
    <div ref={triggerRef} className={`relative inline-block ${className}`}>
      <div
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!disabled) {
            if (isOpen) closeMenu()
            else openMenu()
          }
        }}
        className={disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        style={{ anchorName } as CSSProperties}
      >
        {trigger}
      </div>

      {/* Popover dropdown — rendered in top layer, positioned via CSS anchor */}
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        className="popover-dropdown glass-heavy rounded-lg shadow-md py-1 min-w-[120px]"
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        {options.map((option) => (
          <button
            key={option.value}
            role="menuitem"
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
    </div>
  )
}
