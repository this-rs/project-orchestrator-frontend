import { useState, useEffect, useCallback } from 'react'
import { useTutorial } from './useTutorial'
import {
  TOUR_DISPLAY_NAMES,
  TOUR_ICONS,
  SUGGESTION_DELAY,
  SUGGESTION_AUTO_HIDE,
  type TourName,
} from '@/tutorial/constants'
import type { LucideIcon } from 'lucide-react'

export interface UseTourSuggestionReturn {
  /** Should the toast be shown? */
  isVisible: boolean
  /** Tour name identifier */
  tourName: TourName
  /** French display name */
  displayName: string
  /** Lucide icon component for the tour */
  icon: LucideIcon
  /** Accept — launches the tour */
  accept: () => void
  /** Dismiss — persists refusal, hides toast */
  dismiss: () => void
}

/**
 * Hook that manages contextual tour suggestions for a page.
 *
 * When a user visits a page for the first time (after completing the main tour),
 * a toast suggests the micro-tour for that page after a short delay.
 * The suggestion auto-hides after `SUGGESTION_AUTO_HIDE` ms.
 * Dismissals are persisted in localStorage via the Jotai tutorial atom.
 *
 * @param tourName - The tour to suggest for this page
 * @param options.enabled - Whether the suggestion is enabled (default: true). Useful for conditional rendering (e.g. fullscreen-only).
 */
export function useTourSuggestion(tourName: TourName, options?: { enabled?: boolean }): UseTourSuggestionReturn {
  const enabled = options?.enabled ?? true
  const {
    startTour,
    isTourCompleted,
    isTourDismissed,
    dismissTour,
    isNextStepVisible,
  } = useTutorial()

  const [isVisible, setIsVisible] = useState(false)

  const shouldShow =
    enabled &&
    !isTourCompleted(tourName) &&
    !isTourDismissed(tourName) &&
    !isNextStepVisible

  // Show toast after SUGGESTION_DELAY if conditions are met
  useEffect(() => {
    if (!shouldShow) return

    const timer = setTimeout(() => {
      setIsVisible(true)
    }, SUGGESTION_DELAY)

    return () => clearTimeout(timer)
  }, [shouldShow])

  // Auto-hide after SUGGESTION_AUTO_HIDE
  useEffect(() => {
    if (!isVisible) return

    const timer = setTimeout(() => {
      setIsVisible(false)
      dismissTour(tourName)
    }, SUGGESTION_AUTO_HIDE)

    return () => clearTimeout(timer)
  }, [isVisible, dismissTour, tourName])

  // Hide if a tour starts while the toast is showing
  useEffect(() => {
    if (isNextStepVisible && isVisible) {
      setIsVisible(false)
    }
  }, [isNextStepVisible, isVisible])

  const accept = useCallback(() => {
    setIsVisible(false)
    startTour(tourName)
  }, [startTour, tourName])

  const dismiss = useCallback(() => {
    setIsVisible(false)
    dismissTour(tourName)
  }, [dismissTour, tourName])

  return {
    isVisible,
    tourName,
    displayName: TOUR_DISPLAY_NAMES[tourName],
    icon: TOUR_ICONS[tourName],
    accept,
    dismiss,
  }
}
