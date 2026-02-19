import { atomWithStorage } from 'jotai/utils'
import { DEFAULT_TUTORIAL_STATE } from '@/tutorial/constants'
import type { TutorialState } from '@/tutorial/constants'

/**
 * Persisted tutorial state — tracks which tours have been completed/skipped.
 * Synced to localStorage under key 'po-tutorials'.
 */
export const tutorialStateAtom = atomWithStorage<TutorialState>(
  'po-tutorials',
  DEFAULT_TUTORIAL_STATE,
  undefined, // use default JSON storage (localStorage)
  { getOnInit: true }, // read localStorage synchronously on first render — avoids flash of welcome modal
)
