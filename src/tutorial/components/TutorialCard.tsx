import { motion, AnimatePresence } from 'motion/react'
import type { CardComponentProps } from 'nextstepjs'
import { useNextStep } from 'nextstepjs'
import { TutorialProgress } from './TutorialProgress'
import { TOUR_ICONS } from '@/tutorial/constants'
import type { TourName } from '@/tutorial/constants'
import { useIsMobile } from '@/hooks'

/**
 * Custom card component for NextStepjs tours.
 * Replaces the default tooltip with a dark-themed card matching
 * the Project Orchestrator design system.
 *
 * Receives props from NextStepjs: step, currentStep, totalSteps,
 * nextStep, prevStep, skipTour, arrow.
 */
export function TutorialCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const { currentTour } = useNextStep()
  const isMobile = useIsMobile()
  const isFirst = currentStep === 0
  const isLast = currentStep === totalSteps - 1

  // Resolve tour icon from constants
  const TourIcon = currentTour
    ? TOUR_ICONS[currentTour as TourName]
    : undefined

  // Resolve step icon — could be a string emoji or React node
  const stepIcon = step.icon

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5 w-80 max-w-[calc(100vw-2rem)]"
      >
        {/* Arrow from NextStepjs positioning */}
        {arrow}

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          {/* Icon: prefer step.icon, fallback to tour icon */}
          {stepIcon ? (
            <span className="text-indigo-400 w-5 h-5 flex-shrink-0 flex items-center justify-center text-base">
              {stepIcon}
            </span>
          ) : TourIcon ? (
            <TourIcon className="text-indigo-400 w-5 h-5 flex-shrink-0" />
          ) : null}
          <h3 className="text-sm font-semibold text-zinc-100">{step.title}</h3>
        </div>

        {/* Body */}
        <div className="text-sm text-zinc-300 leading-relaxed mb-4">
          {step.content}
        </div>

        {/* Progress bar */}
        <TutorialProgress currentStep={currentStep} totalSteps={totalSteps} />

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Previous button */}
          {!isFirst ? (
            <button
              onClick={prevStep}
              aria-label="Étape précédente"
              className={`text-zinc-400 hover:text-zinc-200 text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors ${isMobile ? 'px-4 py-2.5' : 'px-3 py-1.5'}`}
            >
              ← Précédent
            </button>
          ) : (
            <div />
          )}

          {/* Next / Finish button */}
          <button
            onClick={nextStep}
            aria-label={isLast ? 'Terminer le tour' : 'Étape suivante'}
            className={`bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors ${isMobile ? 'px-5 py-2.5' : 'px-4 py-1.5'}`}
          >
            {isLast ? 'Terminer ✓' : 'Suivant →'}
          </button>
        </div>

        {/* Skip link */}
        {skipTour && (
          <div className="mt-3 text-center">
            <button
              onClick={skipTour}
              aria-label="Passer le tour"
              className="text-zinc-500 hover:text-zinc-300 text-xs underline underline-offset-2 cursor-pointer transition-colors"
            >
              Passer le tour
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
