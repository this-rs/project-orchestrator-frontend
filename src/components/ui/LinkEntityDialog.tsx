import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { Button } from './Button'
import { Spinner } from './Spinner'
import type { LinkOption } from '@/hooks/useLinkDialog'

export interface LinkEntityDialogProps {
  open: boolean
  onClose: () => void
  title: string
  submitLabel?: string
  options: LinkOption[]
  selectedId: string
  onSelect: (id: string) => void
  onSubmit: () => Promise<void>
  loading: boolean
  fetching: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function LinkEntityDialog({
  open,
  onClose,
  title,
  submitLabel = 'Link',
  options,
  selectedId,
  onSelect,
  onSubmit,
  loading,
  fetching,
  searchQuery,
  onSearchChange,
}: LinkEntityDialogProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, loading])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />

      <div className="relative bg-surface-overlay rounded-xl shadow-xl border border-border-subtle max-w-lg w-full animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-border-subtle">
          <h3 id="link-dialog-title" className="text-lg font-semibold text-gray-100">
            {title}
          </h3>
        </div>

        <div className="px-4 py-3 md:px-6 md:py-4">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              ref={searchRef}
              className="w-full pl-10 pr-3 py-2 bg-surface-base border border-border-default rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Options list */}
          <div className="max-h-[50vh] md:max-h-[40vh] overflow-y-auto space-y-1">
            {fetching ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : options.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                No items available
              </div>
            ) : (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelect(option.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                    selectedId === option.value
                      ? 'bg-indigo-500/20 ring-2 ring-indigo-500'
                      : 'bg-white/[0.04] hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="font-medium text-gray-200 text-sm">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-4 py-3 md:px-6 md:py-4 border-t border-border-subtle">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSubmit}
            loading={loading}
            disabled={!selectedId || loading}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
