import { useState, useEffect, useRef, type ReactNode, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from './Button'
import { useToast } from '@/hooks/useToast'
import { dialogVariants, backdropVariants, useReducedMotion } from '@/utils/motion'

export interface FormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: () => Promise<false | void> | false | void
  title: string
  children: ReactNode
  submitLabel?: string
  cancelLabel?: string
  /** @deprecated Prefer letting FormDialog manage loading internally. Kept for backward compat. */
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
  const reducedMotion = useReducedMotion()
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  const isLoading = loading || submitting

  // Reset submitting state when dialog closes (e.g. after auto-close or manual cancel)
  useEffect(() => {
    if (!open) setSubmitting(false)
  }, [open])

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, isLoading])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await onSubmit()
      if (result !== false) {
        onClose()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="form-dialog-title"
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={reducedMotion ? undefined : backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={isLoading ? undefined : onClose}
          />

          <motion.div
            className={`relative glass-medium rounded-xl shadow-xl ${sizeClasses[size]} w-full`}
            variants={reducedMotion ? undefined : dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="px-4 py-3 md:px-6 md:py-4 border-b border-border-subtle">
              <h3 id="form-dialog-title" className="text-lg font-semibold text-gray-100">
                {title}
              </h3>
            </div>

            <form onSubmit={handleSubmit}>
              <fieldset disabled={isLoading} className="contents">
                <div className="px-4 py-3 md:px-6 md:py-4 space-y-4 max-h-[70vh] md:max-h-[60vh] overflow-y-auto">{children}</div>
              </fieldset>

              <div className="flex justify-end gap-3 px-4 py-3 md:px-6 md:py-4 border-t border-border-subtle">
                <Button
                  ref={cancelRef}
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                  disabled={isLoading}
                  type="button"
                >
                  {cancelLabel}
                </Button>
                <Button variant="primary" size="sm" type="submit" loading={isLoading}>
                  {submitLabel}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
