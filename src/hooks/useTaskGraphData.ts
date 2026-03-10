// ============================================================================
// useTaskGraphData — Assembles TaskGraphData for the TaskGraphAdapter
// ============================================================================
//
// Fetches and combines all data sources needed by TaskGraphAdapter:
//   - Task details (title, status, priority, affected_files)
//   - Steps (from task details)
//   - Decisions (from task details)
//   - Commits (via tasksApi.getCommits)
//   - Notes (via notesApi — linked to task entity)
//   - Commit file maps (via commitsApi)
//
// Returns raw TaskGraphData — the adapter does the transform, not the hook.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { tasksApi, commitsApi, notesApi } from '@/services'
import type { Step, Decision, Commit, Constraint } from '@/types'
import type { TaskGraphData } from '@/adapters/TaskGraphAdapter'

interface TaskNote {
  id: string
  content: string
  note_type: string
  importance?: string
}

interface UseTaskGraphDataReturn {
  /** Assembled data bundle for TaskGraphAdapter */
  data: TaskGraphData | null
  /** Loading state */
  isLoading: boolean
  /** Error message */
  error: string | null
  /** Refresh data */
  refresh: () => void
}

export function useTaskGraphData(
  taskId: string | undefined,
  planId?: string,
): UseTaskGraphDataReturn {
  const [steps, setSteps] = useState<Step[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [notes, setNotes] = useState<TaskNote[]>([])
  const [commitFilesMap, setCommitFilesMap] = useState<Map<string, string[]>>(new Map())
  const [taskTitle, setTaskTitle] = useState('Task')
  const [taskStatus, setTaskStatus] = useState('pending')
  const [taskPriority, setTaskPriority] = useState<number | undefined>()
  const [affectedFiles, setAffectedFiles] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchData = useCallback(async () => {
    if (!taskId) return
    setIsLoading(true)
    setError(null)

    try {
      // Phase 1: core task data (TaskDetails extends Task directly)
      const taskData = await tasksApi.get(taskId)
      setTaskTitle(taskData.title || taskData.description?.slice(0, 40) || 'Task')
      setTaskStatus(taskData.status || 'pending')
      setTaskPriority(taskData.priority)
      setAffectedFiles(taskData.affected_files || [])

      // Steps and decisions from task details
      const fetchedSteps: Step[] = taskData.steps || []
      setSteps(fetchedSteps)
      const fetchedDecisions: Decision[] = taskData.decisions || []
      setDecisions(fetchedDecisions)

      // Phase 2: secondary data (parallel)
      const [commitsData, notesData, constraintsData] = await Promise.all([
        // Commits linked to task
        tasksApi.getCommits(taskId).catch(() => []),
        // Notes linked to this task entity
        (async (): Promise<TaskNote[]> => {
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
        // Constraints (from plan context if plan_id available)
        (async (): Promise<Constraint[]> => {
          if (!planId) return []
          try {
            const ctx = await tasksApi.getContext(planId, taskId)
            return (ctx.constraints || []).map((c: { description: string; constraint_type: string }) => ({
              id: `c-${c.description.slice(0, 8)}`,
              description: c.description,
              constraint_type: c.constraint_type as Constraint['constraint_type'],
              severity: 'medium' as const,
            })) satisfies Constraint[]
          } catch { return [] }
        })(),
      ])

      const fetchedCommits: Commit[] = Array.isArray(commitsData) ? commitsData : commitsData.items || []
      setCommits(fetchedCommits)
      setNotes(notesData)
      setConstraints(constraintsData)

      // Phase 3: commit file maps
      if (fetchedCommits.length > 0) {
        try {
          const results = await Promise.all(
            fetchedCommits.slice(0, 20).map(async (c) => {
              try {
                const res = await commitsApi.getCommitFiles(c.sha)
                return { sha: c.sha, files: res.items.map((f: { file_path: string }) => f.file_path) }
              } catch { return { sha: c.sha, files: [] } }
            }),
          )
          const map = new Map<string, string[]>()
          for (const r of results) {
            if (r.files.length > 0) map.set(r.sha, r.files)
          }
          setCommitFilesMap(map)
        } catch {
          setCommitFilesMap(new Map())
        }
      } else {
        setCommitFilesMap(new Map())
      }
    } catch (err) {
      console.error('Failed to fetch task graph data:', err)
      setError('Failed to load task graph data')
    } finally {
      setIsLoading(false)
    }
  }, [taskId, planId, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const data = useMemo<TaskGraphData | null>(() => {
    if (!taskId) return null
    return {
      taskId,
      taskTitle,
      taskStatus,
      taskPriority,
      steps,
      decisions,
      constraints,
      commits,
      affectedFiles,
      notes,
      commitFilesMap,
    }
  }, [taskId, taskTitle, taskStatus, taskPriority, steps, decisions, constraints, commits, affectedFiles, notes, commitFilesMap])

  return { data, isLoading, error, refresh }
}
