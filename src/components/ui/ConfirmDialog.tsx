import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { ProgressBar } from './ProgressBar'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  progress?: { current: number; total: number } | null
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  progress,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel button on open
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus()
    }
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, loading])

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  if (!open) return null

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } catch (error) {
      console.error('Confirm action failed:', error)
    } finally {
      setLoading(false)
      onClose()
    }
  }

  const iconColor = variant === 'danger' ? 'text-red-400' : 'text-yellow-400'
  const iconBg = variant === 'danger' ? 'bg-red-500/10' : 'bg-yellow-500/10'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-overlay rounded-xl shadow-xl max-w-md w-full px-4 py-4 md:p-6 animate-in fade-in zoom-in-95 duration-150 border border-border-subtle">
        <div className="flex gap-3 md:gap-4">
          {/* Icon */}
          <div className={`shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full ${iconBg} flex items-center justify-center`}>
            <svg className={`w-5 h-5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 id="confirm-title" className="text-lg font-semibold text-gray-100">
              {title}
            </h3>
            {description && (
              <p className="mt-2 text-sm text-gray-400">{description}</p>
            )}
            {loading && progress && progress.total > 0 && (
              <div className="mt-3">
                <ProgressBar value={progress.current} max={progress.total} size="sm" />
                <p className="text-xs text-gray-500 mt-1">
                  {progress.current} / {progress.total}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-4 md:mt-6">
          <Button
            ref={cancelRef}
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
