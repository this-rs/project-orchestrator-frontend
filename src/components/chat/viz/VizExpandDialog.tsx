/**
 * VizExpandDialog — Full-screen modal for expanded visualization.
 *
 * Reuses the project's Dialog pattern (motion, backdrop blur, Escape key, body scroll lock).
 * The expanded view removes the max-height constraint and allows full interaction.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X, Minimize2 } from 'lucide-react'
import { dialogVariants, backdropVariants, useReducedMotion } from '@/utils/motion'

interface VizExpandDialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function VizExpandDialog({ open, onClose, title, children }: VizExpandDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="viz-dialog-title"
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={reducedMotion ? undefined : backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
          />

          <motion.div
            className="relative glass-medium rounded-xl shadow-xl max-w-5xl w-full max-h-[85vh] flex flex-col"
            variants={reducedMotion ? undefined : dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
              <h3 id="viz-dialog-title" className="text-sm font-semibold text-gray-100 truncate pr-4">
                {title ?? 'Visualization'}
              </h3>
              <button
                ref={closeRef}
                onClick={onClose}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                aria-label="Close"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Collapse</span>
                <X className="w-3.5 h-3.5 ml-1" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
