// ============================================================================
// useMilestoneGraphData — Assembles enriched MilestoneGraphData
// ============================================================================
//
// Phase 1: Uses already-fetched enriched MilestoneDetail (plans/tasks/steps)
// Phase 2: Fetches additional per-task data in parallel:
//   - Task details (affected_files, decisions)
//   - Commits (via tasksApi.getCommits)
//   - Notes (via notesApi.getEntityNotes)
//
// Returns MilestoneGraphData with all entity groups populated.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { tasksApi, commitsApi, notesApi } from '@/services'
import type { MilestonePlanSummary, MilestoneProgress, Decision, Commit } from '@/types'
import type { MilestoneGraphData, TaskEnrichment } from '@/adapters/MilestoneGraphAdapter'

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
}: UseMilestoneGraphDataParams): UseMilestoneGraphDataReturn {
  const [taskEnrichments, setTaskEnrichments] = useState<Map<string, TaskEnrichment>>(new Map())
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

  // Phase 2: fetch additional data per task (affected_files, commits, decisions, notes)
  const fetchEnrichments = useCallback(async () => {
    if (taskIds.length === 0) return
    setIsLoading(true)

    try {
      // Fetch all task enrichments in parallel (limit to 30 tasks to avoid overload)
      const tasksToEnrich = taskIds.slice(0, 30)
      const results = await Promise.all(
        tasksToEnrich.map(async (taskId) => {
          const [taskDetail, commitsData, notesData] = await Promise.all([
            // Task details → affected_files + decisions
            tasksApi.get(taskId).catch(() => null),
            // Commits linked to task
            tasksApi.getCommits(taskId).catch(() => []),
            // Notes linked to task
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

          // Fetch commit file maps (limit to 10 commits per task)
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

          const enrichment: TaskEnrichment = {
            affectedFiles,
            decisions,
            commits,
            notes: notesData,
            commitFilesMap,
          }

          return { taskId, enrichment }
        }),
      )

      const map = new Map<string, TaskEnrichment>()
      for (const { taskId, enrichment } of results) {
        // Only add if there's actually enrichment data
        const hasData = enrichment.affectedFiles.length > 0
          || enrichment.decisions.length > 0
          || enrichment.commits.length > 0
          || enrichment.notes.length > 0
        if (hasData) {
          map.set(taskId, enrichment)
        }
      }
      setTaskEnrichments(map)
    } catch (err) {
      console.error('Failed to fetch milestone graph enrichments:', err)
    } finally {
      setIsLoading(false)
    }
  }, [taskIds])

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
    }
  }, [milestoneId, milestoneTitle, milestoneStatus, plans, progress, taskEnrichments])

  return { data, isLoading }
}
