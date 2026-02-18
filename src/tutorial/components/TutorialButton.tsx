import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HelpCircle, Check, Play, RotateCcw, RefreshCw } from 'lucide-react'
import { useTutorial } from '@/tutorial/hooks'
import {
  ALL_TOUR_NAMES,
  TOUR_DISPLAY_NAMES,
  TOUR_ICONS,
  TOUR_NAMES,
  type TourName,
} from '@/tutorial/constants'

/**
 * Persistent header button that gives access to all guided tours.
 * Shows a pulsing indigo dot when uncompleted tours exist.
 * Dropdown lists all 11 tours with completion status, plus reset actions.
 */
export function TutorialButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    startTour,
    resetAllTours,
    isTourCompleted,
    completedTours,
  } = useTutorial()

  const hasUncompletedTours = completedTours.length < ALL_TOUR_NAMES.length

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setConfirmReset(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Close dropdown on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setConfirmReset(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  const handleTourClick = useCallback(
    (tourName: TourName) => {
      startTour(tourName)
      setIsOpen(false)
    },
    [startTour],
  )

  const handleResetAll = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    resetAllTours()
    setConfirmReset(false)
    setIsOpen(false)
  }, [confirmReset, resetAllTours])

  return (
    <div ref={containerRef} className="relative hidden sm:flex">
      {/* Trigger button */}
      <button
        data-tour="tutorial-button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:border-indigo-500/50 transition-all flex items-center justify-center"
        aria-label="Didacticiel — Tours guidés disponibles"
      >
        <HelpCircle className="w-4 h-4 text-zinc-400" />

        {/* Pulsing dot for uncompleted tours */}
        {hasUncompletedTours && (
          <>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          </>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="text-sm font-semibold text-zinc-200">Tours guidés</div>
              <div className="text-xs text-zinc-500">
                {completedTours.length}/{ALL_TOUR_NAMES.length} complétés
              </div>
            </div>

            {/* Tour list */}
            <div className="max-h-64 overflow-y-auto py-1">
              {ALL_TOUR_NAMES.map((tourName) => {
                const TourIcon = TOUR_ICONS[tourName]
                const completed = isTourCompleted(tourName)
                return (
                  <button
                    key={tourName}
                    onClick={() => handleTourClick(tourName)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-800/70 transition-colors"
                  >
                    <TourIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    <span className="text-sm text-zinc-300 flex-1 text-left truncate">
                      {TOUR_DISPLAY_NAMES[tourName]}
                    </span>
                    {completed ? (
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <Play className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Separator + actions */}
            <div className="border-t border-zinc-800 py-1">
              <button
                onClick={() => handleTourClick(TOUR_NAMES.MAIN)}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-800/70 transition-colors"
              >
                <RotateCcw className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-400">Relancer le tour principal</span>
              </button>
              <button
                onClick={handleResetAll}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-zinc-800/70 transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-red-400/70 flex-shrink-0" />
                <span className={`text-sm ${confirmReset ? 'text-red-300 font-medium' : 'text-red-400'}`}>
                  {confirmReset ? 'Confirmer la réinitialisation ?' : 'Réinitialiser tous les tours'}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
