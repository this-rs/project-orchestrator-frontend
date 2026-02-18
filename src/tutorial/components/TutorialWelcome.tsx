import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { GraduationCap } from 'lucide-react'

interface TutorialWelcomeProps {
  open: boolean
  onStartTour: () => void
  onDismiss: () => void
}

/**
 * Full-screen welcome modal shown to first-time users.
 * Offers two options: start the main guided tour, or explore on your own.
 * Rendered via portal, with escape key, body scroll lock, and focus trap.
 */
export function TutorialWelcome({ open, onStartTour, onDismiss }: TutorialWelcomeProps) {
  const startRef = useRef<HTMLButtonElement>(null)

  // Focus the primary button on open
  useEffect(() => {
    if (open) {
      // Small delay to let animation start before focusing
      const id = setTimeout(() => startRef.current?.focus(), 100)
      return () => clearTimeout(id)
    }
  }, [open])

  // Escape key → dismiss
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onDismiss])

  // Lock body scroll
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
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

          {/* Content */}
          <motion.div
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Logo icon */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <GraduationCap className="w-16 h-16 text-indigo-400" />
              </div>
            </div>

            {/* Title */}
            <h2
              id="welcome-title"
              className="text-2xl font-bold text-zinc-100 text-center mb-2"
            >
              Bienvenue sur Project Orchestrator
            </h2>

            {/* Subtitle */}
            <p className="text-zinc-400 text-center mb-8">
              {"Découvrez l'interface en quelques étapes guidées"}
            </p>

            {/* Actions — staggered entrance */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
            >
              {/* Primary action */}
              <button
                ref={startRef}
                onClick={onStartTour}
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors text-base"
              >
                {'🚀 Démarrer le tour guidé'}
              </button>

              {/* Secondary action */}
              <button
                onClick={onDismiss}
                className="w-full mt-3 bg-transparent border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-300 font-medium py-2.5 px-6 rounded-xl transition-colors text-sm"
              >
                Explorer par moi-même
              </button>

              {/* Info text */}
              <p className="text-xs text-zinc-600 text-center mt-4">
                {'Vous pourrez relancer le tour à tout moment via le bouton 🎓 dans le header.'}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
