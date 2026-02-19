import { useState, useRef, useEffect, useId, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { Spinner } from './Spinner'

interface StatusSelectProps<T extends string> {
  status: T
  options: { value: T; label: string }[]
  colorMap: Record<T, { bg: string; text: string; dot: string }>
  onStatusChange: (newStatus: T) => Promise<void>
}

export function StatusSelect<T extends string>({
  status,
  options,
  colorMap,
  onStatusChange,
}: StatusSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reactId = useId()
  const uid = reactId.replace(/:/g, '')
  const anchorName = `--ss-${uid}`
  const menuId = `ss-${uid}-menu`

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

  const handleSelect = async (newStatus: T) => {
    if (newStatus === status) {
      closeMenu()
      return
    }
    closeMenu()
    setLoading(true)
    try {
      await onStatusChange(newStatus)
    } finally {
      setLoading(false)
    }
  }

  const colors = colorMap[status] || { bg: 'bg-white/[0.08]', text: 'text-gray-200', dot: 'bg-gray-400' }
  const currentLabel = options.find((o) => o.value === status)?.label || status

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={() => !loading && (isOpen ? closeMenu() : openMenu())}
        disabled={loading}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={menuId}
        className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${colors.bg} ${colors.text} hover:opacity-90`}
        style={{ anchorName } as CSSProperties}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : (
          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
        )}
        {currentLabel}
        {!loading && (
          <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Popover dropdown — rendered in top layer, positioned via CSS anchor */}
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="listbox"
        className="popover-dropdown glass-heavy rounded-lg shadow-md py-1 min-w-[160px]"
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        {options.map((option) => {
          const optColors = colorMap[option.value]
          return (
            <button
              key={option.value}
              role="option"
              aria-selected={option.value === status}
              onClick={() => handleSelect(option.value)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-white/[0.06] ${
                option.value === status ? 'text-white font-medium' : 'text-gray-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${optColors?.dot || 'bg-gray-400'}`} />
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
