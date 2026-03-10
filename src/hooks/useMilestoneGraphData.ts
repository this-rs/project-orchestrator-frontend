// ============================================================================
// useMilestoneGraphData — Assembles enriched MilestoneGraphData
// ============================================================================
//
// Phase 1: Uses already-fetched enriched MilestoneDetail (plans/tasks/steps)
// Phase 2: Fetches additional per-task data in parallel:
//   - Task details (affected_files, decisions)
//   - Commits (via tasksApi.getCommits)
//   - Notes (via notesApi.getEntityNotes)
// Phase 3: Fetches plan-level data:
//   - Constraints per plan (via plansApi.listConstraints)
//   - Plan-level commits (via plansApi.getCommits)
// Phase 4: Fetches project-level data (if projectSlug provided):
//   - Chat sessions (via chatApi.listSessions)
//   - Feature graphs (via featureGraphsApi)
//
// Returns MilestoneGraphData with all entity groups populated.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { tasksApi, plansApi, commitsApi, notesApi, chatApi, featureGraphsApi } from '@/services'
import type { MilestonePlanSummary, MilestoneProgress, Decision, Commit, Constraint, ChatSession, FeatureGraphDetail } from '@/types'
import type { MilestoneGraphData, TaskEnrichment, PlanEnrichment } from '@/adapters/MilestoneGraphAdapter'

interface MilestoneNote {
  id: string
  content: string
  note_type: string
  importance?: string
}

interface UseMilestoneGraphDataParams {
  milestoneId: string | undefined
  milestoneTitle: string
  milestoneStatus: string
  plans: MilestonePlanSummary[]
  progress: MilestoneProgress | null
  /** Project slug — enables chat sessions + feature graph fetching */
  projectSlug?: string
  /** Project ID — enables feature graph fetching */
  projectId?: string
}

interface UseMilestoneGraphDataReturn {
  data: MilestoneGraphData | null
  isLoading: boolean
}

export function useMilestoneGraphData({
  milestoneId,
  milestoneTitle,
  milestoneStatus,
  plans,
  progress,
  projectSlug,
  projectId,
}: UseMilestoneGraphDataParams): UseMilestoneGraphDataReturn {
  const [taskEnrichments, setTaskEnrichments] = useState<Map<string, TaskEnrichment>>(new Map())
  const [planEnrichments, setPlanEnrichments] = useState<Map<string, PlanEnrichment>>(new Map())
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [featureGraphs, setFeatureGraphs] = useState<FeatureGraphDetail[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Collect all task IDs from plans
  const taskIds = useMemo(() => {
    const ids: string[] = []
    for (const plan of plans) {
      for (const task of plan.tasks) {
        ids.push(task.id)
      }
    }
    return ids
  }, [plans])

  // Plan IDs for plan-level enrichment
  const planIds = useMemo(() => plans.map((p) => p.id), [plans])

  // Phase 2+3+4: fetch all enrichment data
  const fetchEnrichments = useCallback(async () => {
    if (taskIds.length === 0 && planIds.length === 0) return
    setIsLoading(true)

    try {
      // ── Phase 2: Per-task enrichments (affected_files, commits, decisions, notes)
      const taskEnrichmentPromise = (async () => {
        if (taskIds.length === 0) return new Map<string, TaskEnrichment>()
        const tasksToEnrich = taskIds.slice(0, 30)
        const results = await Promise.all(
          tasksToEnrich.map(async (taskId) => {
            const [taskDetail, commitsData, notesData] = await Promise.all([
              tasksApi.get(taskId).catch(() => null),
              tasksApi.getCommits(taskId).catch(() => []),
              (async (): Promise<MilestoneNote[]> => {
                try {
                  const result = await notesApi.getEntityNotes('task', taskId)
                  const items = result.items || []
                  return (Array.isArray(items) ? items : []).map((n) => ({
                    id: n.id,
                    content: n.content || '',
                    note_type: n.note_type || 'observation',
                    importance: n.importance,
                  }))
                } catch { return [] }
              })(),
            ])

            const commits: Commit[] = Array.isArray(commitsData) ? commitsData : (commitsData as { items?: Commit[] }).items || []
            const decisions: Decision[] = taskDetail?.decisions || []
            const affectedFiles: string[] = taskDetail?.affected_files || []

            const commitFilesMap = new Map<string, string[]>()
            if (commits.length > 0) {
              try {
                const fileResults = await Promise.all(
                  commits.slice(0, 10).map(async (c) => {
                    try {
                      const res = await commitsApi.getCommitFiles(c.sha)
                      return { sha: c.sha, files: res.items.map((f: { file_path: string }) => f.file_path) }
                    } catch { return { sha: c.sha, files: [] } }
                  }),
                )
                for (const r of fileResults) {
                  if (r.files.length > 0) commitFilesMap.set(r.sha, r.files)
                }
              } catch { /* ignore */ }
            }

            return { taskId, enrichment: { affectedFiles, decisions, commits, notes: notesData, commitFilesMap } }
          }),
        )

        const map = new Map<string, TaskEnrichment>()
        for (const { taskId, enrichment } of results) {
          const hasData = enrichment.affectedFiles.length > 0
            || enrichment.decisions.length > 0
            || enrichment.commits.length > 0
            || enrichment.notes.length > 0
          if (hasData) map.set(taskId, enrichment)
        }
        return map
      })()

      // ── Phase 3: Per-plan enrichments (constraints, plan-level commits)
      const planEnrichmentPromise = (async () => {
        if (planIds.length === 0) return new Map<string, PlanEnrichment>()
        const results = await Promise.all(
          planIds.slice(0, 20).map(async (planId) => {
            const [constraintsData, commitsData] = await Promise.all([
              plansApi.listConstraints(planId).catch(() => []),
              plansApi.getCommits(planId).catch(() => ({ items: [] })),
            ])

            const constraints: Constraint[] = Array.isArray(constraintsData) ? constraintsData : []
            const commits: Commit[] = commitsData.items || []

            // Fetch commit file maps for plan-level commits
            const commitFilesMap = new Map<string, string[]>()
            if (commits.length > 0) {
              try {
                const fileResults = await Promise.all(
                  commits.slice(0, 15).map(async (c) => {
                    try {
                      const res = await commitsApi.getCommitFiles(c.sha)
                      return { sha: c.sha, files: res.items.map((f: { file_path: string }) => f.file_path) }
                    } catch { return { sha: c.sha, files: [] } }
                  }),
                )
                for (const r of fileResults) {
                  if (r.files.length > 0) commitFilesMap.set(r.sha, r.files)
                }
              } catch { /* ignore */ }
            }

            return { planId, enrichment: { constraints, commits, commitFilesMap } }
          }),
        )

        const map = new Map<string, PlanEnrichment>()
        for (const { planId, enrichment } of results) {
          const hasData = enrichment.constraints.length > 0 || enrichment.commits.length > 0
          if (hasData) map.set(planId, enrichment)
        }
        return map
      })()

      // ── Phase 4: Project-level data (chat sessions + feature graphs)
      const sessionsPromise = (async (): Promise<ChatSession[]> => {
        if (!projectSlug) return []
        try {
          const result = await chatApi.listSessions({ project_slug: projectSlug, limit: 20 })
          return result.items || []
        } catch { return [] }
      })()

      const featureGraphsPromise = (async (): Promise<FeatureGraphDetail[]> => {
        if (!projectId) return []
        try {
          const fgList = await featureGraphsApi.list({ project_id: projectId })
          const fgs = fgList.feature_graphs || []
          if (fgs.length === 0) return []
          const details = await Promise.all(
            fgs.slice(0, 10).map((fg) => featureGraphsApi.get(fg.id).catch(() => null)),
          )
          return details.filter((d): d is FeatureGraphDetail => d !== null)
        } catch { return [] }
      })()

      // Wait for all phases in parallel
      const [taskMap, planMap, sessions, fgDetails] = await Promise.all([
        taskEnrichmentPromise,
        planEnrichmentPromise,
        sessionsPromise,
        featureGraphsPromise,
      ])

      setTaskEnrichments(taskMap)
      setPlanEnrichments(planMap)
      setChatSessions(sessions)
      setFeatureGraphs(fgDetails)
    } catch (err) {
      console.error('Failed to fetch milestone graph enrichments:', err)
    } finally {
      setIsLoading(false)
    }
  }, [taskIds, planIds, projectSlug, projectId])

  useEffect(() => {
    fetchEnrichments()
  }, [fetchEnrichments])

  const data = useMemo<MilestoneGraphData | null>(() => {
    if (!milestoneId || !progress) return null
    return {
      milestoneId,
      milestoneTitle,
      milestoneStatus,
      plans,
      progress,
      taskEnrichments,
      planEnrichments,
      chatSessions,
      featureGraphs,
    }
  }, [milestoneId, milestoneTitle, milestoneStatus, plans, progress, taskEnrichments, planEnrichments, chatSessions, featureGraphs])

  return { data, isLoading }
}
