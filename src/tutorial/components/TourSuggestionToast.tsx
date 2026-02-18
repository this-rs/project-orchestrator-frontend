import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SUGGESTION_AUTO_HIDE, type TourName } from '@/tutorial/constants'

/**
 * Non-blocking toast that suggests a micro-tour for the current page.
 *
 * **Usage**: Wrap with `<AnimatePresence>` for exit animations:
 * ```tsx
 * <AnimatePresence>
 *   {suggestion.isVisible && (
 *     <TourSuggestionToast key="tour-suggestion" {...suggestion} />
 *   )}
 * </AnimatePresence>
 * ```
 *
 * - Position: fixed bottom-right, z-50 (below modals z-[100])
 * - Does NOT block pointer events on the page
 * - Escape key dismisses the toast
 * - Progress bar shows time remaining before auto-dismiss
 */

interface TourSuggestionToastProps {
  tourName: TourName
  displayName: string
  icon: LucideIcon
  onAccept: () => void
  onDismiss: () => void
  autoHideMs?: number
}

export function TourSuggestionToast({
  displayName,
  icon: Icon,
  onAccept,
  onDismiss,
  autoHideMs = SUGGESTION_AUTO_HIDE,
}: TourSuggestionToastProps) {
  // CSS transition trick: start at 100%, then animate to 0% on next frame
  const [startAnimation, setStartAnimation] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setStartAnimation(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Escape key to dismiss
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  return (
    <div className="fixed bottom-4 right-4 z-50" role="status" aria-live="polite">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-80 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 pb-2 flex items-center gap-3">
          <Icon className="w-5 h-5 text-indigo-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-zinc-100 flex-1 truncate">
            {displayName}
          </span>
          <button
            onClick={onDismiss}
            className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Fermer la suggestion"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-3">
          <p className="text-xs text-zinc-400">
            Découvrez les fonctionnalités de cette section avec un tour guidé
            interactif.
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium py-1.5 rounded-lg transition-colors"
          >
            Commencer
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-medium py-1.5 rounded-lg transition-colors"
          >
            Plus tard
          </button>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="h-0.5 bg-zinc-700/50">
          <div
            className="h-full bg-indigo-500 transition-[width]"
            style={{
              width: startAnimation ? '0%' : '100%',
              transitionDuration: `${autoHideMs}ms`,
              transitionTimingFunction: 'linear',
            }}
          />
        </div>
      </motion.div>
    </div>
  )
}
