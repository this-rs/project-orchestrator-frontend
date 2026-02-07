import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight || 200
    const spaceBelow = window.innerHeight - rect.bottom
    const showAbove = spaceBelow < menuHeight && rect.top > menuHeight

    setPosition({
      top: showAbove ? rect.top + window.scrollY - menuHeight - 4 : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
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

  const handleSelect = async (newStatus: T) => {
    if (newStatus === status) {
      setIsOpen(false)
      return
    }
    setIsOpen(false)
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
    <div ref={triggerRef} className="relative inline-block">
      <button
        onClick={() => !loading && setIsOpen(!isOpen)}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${colors.bg} ${colors.text} hover:opacity-90`}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : (
          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
        )}
        {currentLabel}
        {!loading && (
          <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[160px] rounded-lg bg-[#232733] border border-white/[0.1] shadow-[0_4px_12px_rgba(0,0,0,0.4)] py-1"
            style={{ top: position.top, left: position.left, position: 'absolute' }}
          >
            {options.map((option) => {
              const optColors = colorMap[option.value]
              return (
                <button
                  key={option.value}
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
          </div>,
          document.body,
        )}
    </div>
  )
}
