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
  /** Total count of active notes across all projects */
  totalActiveNotes: number
  /** Most recent chat sessions */
  recentSessions: ChatSession[]
  /** All tracked projects (for sync date display) */
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

export function useWelcomeData(): UseWelcomeDataReturn {
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

      // Fire all API calls in parallel — each one is independent
      // Promise.allSettled ensures a single failure doesn't crash the dashboard
      const results = await Promise.allSettled([
        plansApi.list({ status: 'draft,in_progress', limit: 10, sort_by: 'priority', sort_order: 'desc' }),
        notesApi.getNeedsReview(),
        notesApi.list({ status: 'active', limit: 1 }),
        chatApi.listSessions({ limit: 3 }),
        projectsApi.list({ limit: 50, sort_by: 'name', sort_order: 'asc' }),
      ])

      // Bail if component unmounted or request was aborted
      if (cancelled || controller.signal.aborted) return

      // Extract each result with safe fallbacks
      const plansResult = settled(results[0], { items: [], total: 0, limit: 10, offset: 0 })
      const reviewResult = settled(results[1], { items: [] })
      const activeNotesResult = settled(results[2], { items: [], total: 0, limit: 1, offset: 0 })
      const sessionsResult = settled(results[3], { items: [], total: 0, limit: 3, offset: 0 })
      const projectsResult = settled(results[4], { items: [], total: 0, limit: 50, offset: 0 })

      // Validate arrays at runtime before using them
      const activePlans = Array.isArray(plansResult.items) ? plansResult.items : []
      const notesNeedingReview = Array.isArray(reviewResult.items) ? reviewResult.items : []
      const totalActiveNotes = Number(activeNotesResult.total) || 0
      const recentSessions = Array.isArray(sessionsResult.items) ? sessionsResult.items : []
      const projects = Array.isArray(projectsResult.items) ? projectsResult.items : []

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
  }, [fetchKey])

  return { data, isLoading, refetch }
}
