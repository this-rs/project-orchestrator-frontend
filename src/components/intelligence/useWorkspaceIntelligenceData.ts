import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAtom } from 'jotai'
import { intelligenceApi } from '@/services/intelligence'
import { intelligenceSummaryAtom } from '@/atoms/intelligence'
import type { IntelligenceSummary, ProjectIntelligenceSummary } from '@/types/intelligence'
import type { IntelligenceData } from './IntelligenceDashboard'

// ============================================================================
// Health score computation (workspace variant — no CodeHealth available)
// ============================================================================

function computeHealthScore(s: IntelligenceSummary): number {
  const scores: number[] = []

  if (s.code.files > 0) {
    const density = (s.knowledge.notes + s.knowledge.decisions) / s.code.files
    scores.push(Math.min(100, density * 50))
  }

  if (s.knowledge.notes > 0) {
    const freshRatio = 1 - s.knowledge.stale_count / s.knowledge.notes
    scores.push(freshRatio * 100)
  }

  const energyScore = s.neural.avg_energy * 100
  const synapseQuality = (1 - s.neural.weak_synapses_ratio) * 100
  scores.push((energyScore + synapseQuality) / 2)

  if (s.skills.total > 0) {
    scores.push((s.skills.active / s.skills.total) * 100)
  }

  if (s.code.files > 0) {
    const nonOrphanRatio = 1 - s.code.orphans / s.code.files
    scores.push(nonOrphanRatio * 100)
  }

  if (scores.length === 0) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

// ============================================================================
// WORKSPACE INTELLIGENCE DATA HOOK
// ============================================================================

export interface WorkspaceIntelligenceData extends IntelligenceData {
  perProject: ProjectIntelligenceSummary[]
}

interface ActionResult {
  key: string
  status: 'idle' | 'running' | 'success' | 'error'
  message?: string
}

export function useWorkspaceIntelligenceData(workspaceSlug: string): WorkspaceIntelligenceData {
  const [summary, setSummary] = useAtom(intelligenceSummaryAtom)
  const [perProject, setPerProject] = useState<ProjectIntelligenceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actions, setActions] = useState<Record<string, ActionResult>>({})

  const getAction = useCallback(
    (key: string): ActionResult => actions[key] ?? { key, status: 'idle' },
    [actions],
  )

  const runAction = useCallback(
    async (key: string, fn: () => Promise<string>) => {
      setActions((prev) => ({ ...prev, [key]: { key, status: 'running' } }))
      try {
        const message = await fn()
        setActions((prev) => ({ ...prev, [key]: { key, status: 'success', message } }))
        setTimeout(() => {
          setActions((prev) => ({ ...prev, [key]: { key, status: 'idle' } }))
        }, 4000)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed'
        setActions((prev) => ({ ...prev, [key]: { key, status: 'error', message } }))
      }
    },
    [],
  )

  const fetchAll = useCallback(async () => {
    if (!workspaceSlug) return
    setError(null)
    try {
      const wsData = await intelligenceApi.getWorkspaceSummary(workspaceSlug)
      setSummary(wsData.aggregated)
      setPerProject(wsData.per_project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace intelligence data')
    }
  }, [workspaceSlug, setSummary])

  useEffect(() => {
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
  }, [fetchAll])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  const healthScore = useMemo(() => {
    if (!summary) return 0
    return computeHealthScore(summary as IntelligenceSummary)
  }, [summary])

  return {
    summary: summary as IntelligenceSummary | null,
    health: null, // No CodeHealth at workspace level
    project: null, // No single project context
    loading,
    error,
    refreshing,
    healthScore,
    handleRefresh,
    getAction,
    runAction,
    // Workspace-specific
    perProject,
  }
}
