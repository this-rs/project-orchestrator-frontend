import { useCallback, useMemo } from 'react'
import { useAtom } from 'jotai'
import { useNextStep } from 'nextstepjs'
import { tutorialStateAtom } from '@/atoms/tutorial'
import {
  TOUR_DISPLAY_NAMES,
  DEFAULT_TUTORIAL_STATE,
  type TourName,
  type TourState,
} from '@/tutorial/constants'

/**
 * Central hook for managing the tutorial/onboarding system.
 *
 * Orchestrates NextStepjs tour triggers with Jotai-persisted state
 * (localStorage key: 'po-tutorials'). All tutorial components should
 * use this hook instead of accessing the atom directly.
 */
export function useTutorial() {
  const [state, setState] = useAtom(tutorialStateAtom)
  const { startNextStep, closeNextStep, currentTour, isNextStepVisible } =
    useNextStep()

  // ---------------------------------------------------------------------------
  // Tour control
  // ---------------------------------------------------------------------------

  /** Launch a guided tour by name */
  const startTour = useCallback(
    (tourName: TourName) => {
      startNextStep(tourName)
    },
    [startNextStep],
  )

  /** Programmatically close the currently running tour */
  const closeTour = useCallback(() => {
    closeNextStep()
  }, [closeNextStep])

  // ---------------------------------------------------------------------------
  // State mutations
  // ---------------------------------------------------------------------------

  /** Mark a tour as completed */
  const completeTour = useCallback(
    (tourName: TourName) => {
      setState((prev) => ({
        ...prev,
        tours: {
          ...prev.tours,
          [tourName]: {
            completed: true,
            completedAt: new Date().toISOString(),
            skippedAt: null,
          },
        },
      }))
    },
    [setState],
  )

  /** Mark a tour as skipped (not completed) */
  const skipTour = useCallback(
    (tourName: TourName) => {
      setState((prev) => ({
        ...prev,
        tours: {
          ...prev.tours,
          [tourName]: {
            completed: false,
            completedAt: null,
            skippedAt: new Date().toISOString(),
          },
        },
      }))
    },
    [setState],
  )

  /** Reset a single tour (remove from state, making it "not seen") */
  const resetTour = useCallback(
    (tourName: TourName) => {
      setState((prev) => {
        const { [tourName]: _, ...remainingTours } = prev.tours
        const { [tourName]: __, ...remainingDismissed } = prev.dismissed
        return {
          tours: remainingTours,
          dismissed: remainingDismissed,
        }
      })
    },
    [setState],
  )

  /** Reset all tours — complete clean slate */
  const resetAllTours = useCallback(() => {
    setState(DEFAULT_TUTORIAL_STATE)
  }, [setState])

  /** Dismiss a suggestion for a tour (don't show again until reset) */
  const dismissTour = useCallback(
    (tourName: TourName) => {
      setState((prev) => ({
        ...prev,
        dismissed: {
          ...prev.dismissed,
          [tourName]: true,
        },
      }))
    },
    [setState],
  )

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  /** Check if a specific tour has been completed */
  const isTourCompleted = useCallback(
    (tourName: TourName): boolean => {
      return state.tours[tourName]?.completed === true
    },
    [state.tours],
  )

  /** Check if a specific tour suggestion has been dismissed */
  const isTourDismissed = useCallback(
    (tourName: TourName): boolean => {
      return state.dismissed[tourName] === true
    },
    [state.dismissed],
  )

  /** Get the state of a specific tour */
  const getTourState = useCallback(
    (tourName: TourName): TourState | undefined => {
      return state.tours[tourName]
    },
    [state.tours],
  )

  /** Get the French display name for a tour */
  const getTourDisplayName = useCallback(
    (tourName: TourName): string => {
      return TOUR_DISPLAY_NAMES[tourName] ?? tourName
    },
    [],
  )

  /** List of completed tour names */
  const completedTours = useMemo<TourName[]>(() => {
    return (Object.entries(state.tours) as [TourName, TourState][])
      .filter(([, s]) => s.completed)
      .map(([name]) => name)
  }, [state.tours])

  /** True if no tour has ever been completed — brand new user */
  const isFirstTimeUser = useMemo(() => {
    return completedTours.length === 0
  }, [completedTours])

  return {
    // Tour control
    startTour,
    closeTour,
    currentTour,
    isNextStepVisible,

    // State mutations
    completeTour,
    skipTour,
    resetTour,
    resetAllTours,
    dismissTour,

    // Derived state
    isTourCompleted,
    isTourDismissed,
    getTourState,
    getTourDisplayName,
    completedTours,
    isFirstTimeUser,
  }
}
