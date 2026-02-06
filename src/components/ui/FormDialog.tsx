import { useEffect, useRef, type ReactNode, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

export interface FormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: () => Promise<void> | void
  title: string
  children: ReactNode
  submitLabel?: string
  cancelLabel?: string
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function FormDialog({
  open,
  onClose,
  onSubmit,
  title,
  children,
  submitLabel = 'Create',
  cancelLabel = 'Cancel',
  loading = false,
  size = 'md',
}: FormDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await onSubmit()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />

      <div
        className={`relative bg-[#232733] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] border border-white/[0.06] ${sizeClasses[size]} w-full animate-in fade-in zoom-in-95 duration-150`}
      >
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-white/[0.06]">
          <h3 id="form-dialog-title" className="text-lg font-semibold text-gray-100">
            {title}
          </h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-4 py-3 md:px-6 md:py-4 space-y-4 max-h-[70vh] md:max-h-[60vh] overflow-y-auto">{children}</div>

          <div className="flex justify-end gap-3 px-4 py-3 md:px-6 md:py-4 border-t border-white/[0.06]">
            <Button
              ref={cancelRef}
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={loading}
              type="button"
            >
              {cancelLabel}
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={loading}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
