import { useState, useRef, useEffect, useId, type CSSProperties } from 'react'
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
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reactId = useId()
  const uid = reactId.replace(/:/g, '')
  const anchorName = `--om-${uid}`
  const menuId = `om-${uid}-menu`

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

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isOpen) closeMenu()
    else openMenu()
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        className="flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
        aria-label="More actions"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        style={{ anchorName } as CSSProperties}
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {/* Popover dropdown — rendered in top layer, positioned via CSS anchor */}
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        className="popover-dropdown glass-heavy rounded-lg shadow-md py-1 min-w-[140px]"
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            role="menuitem"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              closeMenu()
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
    </div>
  )
}
