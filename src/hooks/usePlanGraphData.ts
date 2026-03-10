// ============================================================================
// usePlanGraphData — Assembles PlanGraphData for the PlanGraphAdapter
// ============================================================================
//
// Fetches and combines all data sources needed by PlanGraphAdapter:
//   - Dependency graph (tasks, edges, conflicts, feature_graphs)
//   - Constraints, decisions, commits
//   - Chat sessions, commit file maps
//   - Feature graph details (fully loaded)
//
// This replaces usePlanUniverse's data fetching logic, but returns raw
// PlanGraphData instead of pre-built UniverseNode[]/UniverseLink[].
// The adapter does the transform, not the hook.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { plansApi, featureGraphsApi, chatApi, commitsApi } from '@/services'
import type {
  DependencyGraph,
  Constraint,
  Decision,
  Commit,
  FeatureGraphDetail,
  ChatSession,
  DependencyGraphNode,
  WaveComputationResult,
} from '@/types'
import type { PlanGraphData } from '@/adapters/PlanGraphAdapter'

interface UsePlanGraphDataReturn {
  /** Assembled data bundle for PlanGraphAdapter */
  data: PlanGraphData | null
  /** Raw dependency graph (for DAG view passthrough) */
  graph: DependencyGraph | null
  /** Wave computation result (lazily fetched) */
  waves: WaveComputationResult | null
  /** Fetch waves on demand */
  fetchWaves: () => Promise<void>
  /** Waves loading state */
  wavesLoading: boolean
  /** Toggle a feature graph on/off */
  toggleFeatureGraph: (fgId: string) => void
  /** Currently active feature graph IDs */
  activeFeatureGraphIds: Set<string>
  /** Loading state */
  isLoading: boolean
  /** Error message */
  error: string | null
}

export function usePlanGraphData(
  planId: string | undefined,
  planTitle?: string,
  projectSlug?: string,
): UsePlanGraphDataReturn {
  const [graph, setGraph] = useState<DependencyGraph | null>(null)
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [commitFilesMap, setCommitFilesMap] = useState<Map<string, string[]>>(new Map())
  const [featureGraphs, setFeatureGraphs] = useState<FeatureGraphDetail[]>([])
  const [activeFeatureGraphIds, setActiveFeatureGraphIds] = useState<Set<string>>(new Set())
  const [waves, setWaves] = useState<WaveComputationResult | null>(null)
  const [wavesLoading, setWavesLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedTitle, setResolvedTitle] = useState(planTitle ?? 'Plan')

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!planId) return
    setIsLoading(true)
    setError(null)

    try {
      // Phase 1: core data (parallel)
      const [graphData, constraintsData, commitsData, planResponse] = await Promise.all([
        plansApi.getDependencyGraph(planId).catch(() => null),
        plansApi.listConstraints(planId).catch(() => []),
        plansApi.getCommits(planId).catch(() => ({ items: [] })),
        plansApi.get(planId),
      ])

      if (!graphData || (graphData.nodes || []).length === 0) {
        setGraph(graphData)
        return
      }

      setGraph(graphData)
      const fetchedConstraints: Constraint[] = Array.isArray(constraintsData) ? constraintsData : []
      setConstraints(fetchedConstraints)

      const fetchedCommits: Commit[] = commitsData.items || []
      setCommits(fetchedCommits)

      // Extract decisions from plan response
      const rawTasks = (planResponse as unknown as { tasks?: { task?: DependencyGraphNode; decisions?: Decision[] }[] }).tasks || []
      const allDecisions: Decision[] = rawTasks.flatMap((td) => td.decisions || [])
      setDecisions(allDecisions)

      const title = planTitle || (planResponse as unknown as { plan?: { title?: string } }).plan?.title || 'Plan'
      setResolvedTitle(title)
      const projectId = (planResponse as unknown as { plan?: { project_id?: string } }).plan?.project_id

      // Phase 2: secondary data (parallel)
      const [featureGraphDetails, sessions, filesMap] = await Promise.all([
        // Feature graphs
        (async () => {
          try {
            const fgSummaries = graphData.feature_graphs || []
            if (fgSummaries.length > 0) {
              const details = await Promise.all(
                fgSummaries.slice(0, 10).map((fg) => featureGraphsApi.get(fg.id).catch(() => null)),
              )
              return details.filter((d): d is FeatureGraphDetail => d !== null)
            }
            if (projectId) {
              const fgList = await featureGraphsApi.list({ project_id: projectId })
              const fgs = fgList.feature_graphs || []
              if (fgs.length === 0) return []
              const details = await Promise.all(
                fgs.slice(0, 10).map((fg) => featureGraphsApi.get(fg.id).catch(() => null)),
              )
              return details.filter((d): d is FeatureGraphDetail => d !== null)
            }
            return []
          } catch { return [] }
        })(),
        // Chat sessions
        (async () => {
          if (!projectSlug) return []
          try {
            const result = await chatApi.listSessions({ project_slug: projectSlug, limit: 20 })
            return result.items || []
          } catch { return [] }
        })(),
        // Commit file maps
        (async (): Promise<Map<string, string[]>> => {
          const map = new Map<string, string[]>()
          if (fetchedCommits.length === 0) return map
          try {
            const results = await Promise.all(
              fetchedCommits.slice(0, 20).map(async (c) => {
                try {
                  const res = await commitsApi.getCommitFiles(c.sha)
                  return { sha: c.sha, files: res.items.map((f) => f.file_path) }
                } catch { return { sha: c.sha, files: [] } }
              }),
            )
            for (const r of results) {
              if (r.files.length > 0) map.set(r.sha, r.files)
            }
          } catch { /* ignore */ }
          return map
        })(),
      ])

      setFeatureGraphs(featureGraphDetails)
      setChatSessions(sessions)
      setCommitFilesMap(filesMap)
    } catch (err) {
      console.error('Failed to fetch plan graph data:', err)
      setError('Failed to load plan graph data')
    } finally {
      setIsLoading(false)
    }
  }, [planId, planTitle, projectSlug])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset active FGs when plan changes
  useEffect(() => {
    setActiveFeatureGraphIds(new Set())
    setWaves(null)
  }, [planId])

  // Fetch waves on demand
  const fetchWaves = useCallback(async () => {
    if (!planId) return
    setWavesLoading(true)
    try {
      const result = await plansApi.getWaves(planId)
      setWaves(result)
    } catch (err) {
      console.error('Failed to compute waves:', err)
    } finally {
      setWavesLoading(false)
    }
  }, [planId])

  // Toggle feature graph
  const toggleFeatureGraph = useCallback((fgId: string) => {
    setActiveFeatureGraphIds((prev) => {
      const next = new Set(prev)
      if (next.has(fgId)) next.delete(fgId)
      else next.add(fgId)
      return next
    })
  }, [])

  // Assemble PlanGraphData
  const data = useMemo<PlanGraphData | null>(() => {
    if (!planId || !graph) return null
    return {
      planId,
      planTitle: resolvedTitle,
      graph,
      constraints,
      decisions,
      commits,
      chatSessions,
      commitFilesMap,
      featureGraphs,
      activeFeatureGraphIds,
    }
  }, [planId, resolvedTitle, graph, constraints, decisions, commits, chatSessions, commitFilesMap, featureGraphs, activeFeatureGraphIds])

  return {
    data,
    graph,
    waves,
    fetchWaves,
    wavesLoading,
    toggleFeatureGraph,
    activeFeatureGraphIds,
    isLoading,
    error,
  }
}
