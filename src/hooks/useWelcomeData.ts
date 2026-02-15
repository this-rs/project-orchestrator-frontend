import { useState, useEffect, useCallback } from 'react'
import { plansApi, notesApi, chatApi, projectsApi } from '@/services'
import type { Plan, Note, ChatSession, Project } from '@/types'

// ============================================================================
// TYPES
// ============================================================================

export interface WelcomeData {
  /** Plans with status draft or in_progress */
  activePlans: Plan[]
  /** Notes flagged as needing review (stale, needs_review) */
  notesNeedingReview: Note[]
  /** Total count of active notes (scoped to project when selected) */
  totalActiveNotes: number
  /** Most recent chat sessions */
  recentSessions: ChatSession[]
  /** All tracked projects (for sync date display — only used in global mode) */
  projects: Project[]
}

interface UseWelcomeDataReturn {
  data: WelcomeData
  isLoading: boolean
  /** Refetch all data (e.g. on manual refresh) */
  refetch: () => void
}

// ============================================================================
// DEFAULTS (used as fallbacks when an API call fails)
// ============================================================================

const EMPTY_DATA: WelcomeData = {
  activePlans: [],
  notesNeedingReview: [],
  totalActiveNotes: 0,
  recentSessions: [],
  projects: [],
}

// ============================================================================
// HELPER: safely extract a fulfilled result or return a fallback
// ============================================================================

function settled<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
): T {
  return result.status === 'fulfilled' ? result.value : fallback
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Fetch welcome screen data. When a project is selected, data is scoped
 * to that project (plans filtered client-side, sessions/notes by API).
 * When no project is selected, shows global aggregated data.
 */
export function useWelcomeData(selectedProject?: Project | null): UseWelcomeDataReturn {
  const [data, setData] = useState<WelcomeData>(EMPTY_DATA)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function fetchAll() {
      setIsLoading(true)

      const projectId = selectedProject?.id
      const projectSlug = selectedProject?.slug

      // Fire all API calls in parallel — each one is independent
      // Promise.allSettled ensures a single failure doesn't crash the dashboard
      const results = await Promise.allSettled([
        // Plans: always fetch all active, filter client-side (backend doesn't support project filter)
        plansApi.list({ status: 'draft,in_progress', limit: 10, sort_by: 'priority', sort_order: 'desc' }),
        // Notes needing review: scoped to project when selected
        notesApi.getNeedsReview(projectId ?? undefined),
        // Active notes count: scoped to project when selected
        notesApi.list({ status: 'active', limit: 1, ...(projectId ? { project_id: projectId } : {}) }),
        // Sessions: scoped to project when selected
        chatApi.listSessions({ limit: 5, ...(projectSlug ? { project_slug: projectSlug } : {}) }),
        // Projects list: only needed in global mode (for sync date display)
        ...(projectId ? [] : [projectsApi.list({ limit: 50, sort_by: 'name', sort_order: 'asc' })]),
      ])

      // Bail if component unmounted or request was aborted
      if (cancelled || controller.signal.aborted) return

      // Extract each result with safe fallbacks
      const plansResult = settled(results[0], { items: [], total: 0, limit: 10, offset: 0 })
      const reviewResult = settled(results[1], { items: [] })
      const activeNotesResult = settled(results[2], { items: [], total: 0, limit: 1, offset: 0 })
      const sessionsResult = settled(results[3], { items: [], total: 0, limit: 5, offset: 0 })

      // Validate arrays at runtime before using them
      let activePlans = Array.isArray(plansResult.items) ? plansResult.items : []
      const notesNeedingReview = Array.isArray(reviewResult.items) ? reviewResult.items : []
      const totalActiveNotes = Number(activeNotesResult.total) || 0
      const recentSessions = Array.isArray(sessionsResult.items) ? sessionsResult.items : []

      // Client-side filter: only show plans linked to the selected project
      if (projectId) {
        activePlans = activePlans.filter((p) => p.project_id === projectId)
      }

      // Projects list: only populated in global mode
      let projects: Project[] = []
      if (!projectId && results[4]) {
        const projectsResult = settled(results[4], { items: [], total: 0, limit: 50, offset: 0 })
        projects = Array.isArray(projectsResult.items) ? projectsResult.items : []
      }

      setData({
        activePlans,
        notesNeedingReview,
        totalActiveNotes,
        recentSessions,
        projects,
      })
      setIsLoading(false)
    }

    fetchAll()

    return () => {
      cancelled = true
      controller.abort()
    }
  // Re-fetch when selected project changes or manual refetch is triggered
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedProject?.slug not needed; selectedProject?.id already covers identity changes
  }, [fetchKey, selectedProject?.id])

  return { data, isLoading, refetch }
}
