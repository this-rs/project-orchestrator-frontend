import { useCallback, useRef } from 'react'
import { useNavigate, type NavigateOptions } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { useWorkspaceSlug } from './useWorkspace'
import { workspacePath } from '@/utils/paths'

/** Transition types for CSS targeting via data-attribute */
export type TransitionType = 'sidebar-nav' | 'card-click' | 'back-button' | 'default'

/** Whether the View Transitions API is supported */
const supportsViewTransitions =
  typeof document !== 'undefined' && 'startViewTransition' in document

/**
 * Hook that wraps React Router's `navigate()` with the View Transitions API.
 *
 * - Uses `document.startViewTransition()` for smooth page transitions
 * - Falls back to instant navigation when unsupported
 * - Uses `flushSync()` so React updates the DOM synchronously during snapshot capture
 * - Sets `data-transition-type` on `<html>` for CSS-targeted animations
 *
 * @example
 * const { navigate } = useViewTransition()
 * navigate('/plans')                              // default crossfade
 * navigate('/plans/123', { type: 'card-click' })  // card morph transition
 */
export function useViewTransition() {
  const routerNavigate = useNavigate()
  const activeTransition = useRef<ViewTransition | null>(null)

  const navigate = useCallback(
    (
      to: string,
      options?: NavigateOptions & { type?: TransitionType },
    ) => {
      const { type = 'default', ...navOptions } = options ?? {}

      // Fallback: direct navigation if View Transitions not supported
      if (!supportsViewTransitions) {
        routerNavigate(to, navOptions)
        return
      }

      // Skip transition if one is already running (avoid stacking)
      if (activeTransition.current) {
        activeTransition.current.skipTransition()
      }

      // Set transition type for CSS targeting
      document.documentElement.dataset.transitionType = type

      const transition = document.startViewTransition(() => {
        // flushSync ensures React updates DOM synchronously
        // so the View Transitions API captures the correct after-state
        flushSync(() => {
          routerNavigate(to, navOptions)
        })
      })

      activeTransition.current = transition

      // Clean up after transition completes
      transition.finished.then(() => {
        delete document.documentElement.dataset.transitionType
        activeTransition.current = null
      }).catch(() => {
        // Transition was skipped or errored — clean up anyway
        delete document.documentElement.dataset.transitionType
        activeTransition.current = null
      })
    },
    [routerNavigate],
  )

  return { navigate, supportsViewTransitions }
}

/**
 * Workspace-scoped variant that prefixes paths with `/workspace/:slug`.
 *
 * @example
 * const { navigate } = useWorkspaceViewTransition()
 * navigate('/plans')                              // → /workspace/my-ws/plans
 * navigate('/tasks/123', { type: 'card-click' })  // → /workspace/my-ws/tasks/123
 */
export function useWorkspaceViewTransition() {
  const slug = useWorkspaceSlug()
  const { navigate: vtNavigate, supportsViewTransitions: supported } = useViewTransition()

  const navigate = useCallback(
    (
      path: string,
      options?: NavigateOptions & { type?: TransitionType },
    ) => {
      vtNavigate(workspacePath(slug, path), options)
    },
    [slug, vtNavigate],
  )

  return { navigate, supportsViewTransitions: supported }
}
