import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { DIALOG_MOTION, useVariants } from '@/utils/motion'
import { useT } from '@/i18n'
import { useModalFocus } from '@/hooks/useModalFocus'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Dialog({ open, onClose, title, children, size = 'sm' }: DialogProps) {
  const { t } = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const variants = useVariants(DIALOG_MOTION)

  // Focus on the close button, Tab kept inside, the page behind inert, focus back to the trigger.
  // Escape closes it, when it is the topmost view (a dialog over another view closes alone).
  useModalFocus(containerRef, { active: open, initialFocus: closeRef, onEscape: onClose })

  // Body scroll lock
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
          ref={containerRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={variants.backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
          />

          <motion.div
            className={`relative glass-medium rounded-xl shadow-xl ${sizeClasses[size]} w-full`}
            variants={variants.dialog}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-border-subtle">
              <h3 id="dialog-title" className="text-lg font-semibold text-gray-100 truncate pr-4">
                {title}
              </h3>
              <button
                ref={closeRef}
                onClick={onClose}
                className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                aria-label={t('ui.close')}
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="px-4 py-3 md:px-6 md:py-4 max-h-[70vh] md:max-h-[60vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
