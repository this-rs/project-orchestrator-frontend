/**
 * RunnerDashboard — real-time view of a plan's runner execution.
 *
 *   Pipelines
 *   <Plan title>                              [Cancel run | Retry] [⋯]
 *   ● Running · 3/8 tasks · 04:12 · wave 2/3 · run 1a2b3c4d
 *   progress · budget · agents · wave          (StatsRow)
 *   [Waves] [Discussion tree]                   (ViewTabs)
 *   Wave 1 ▸ … / Wave 2 ▾ agents as rows, conversation inline
 *
 * Composition-only orchestrator: data comes from the runner hooks, the
 * page scrolls normally (no inner scroll area), one column at every width.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, EntityListSkeleton, ErrorState, PageContainer } from '@/components/ui'
import { RunnerHeader } from '@/components/runner/RunnerHeader'
import { StatsRow } from '@/components/runner/StatsRow'
import { WaveSection } from '@/components/runner/WaveSection'
import { getWaveStatus } from '@/components/runner/shared'
import { ViewTabs } from '@/components/ui'
import { Explainer } from '@/components/protocols/Explainer'
import { LinkedDiscussions } from '@/components/discussions/LinkedDiscussions'
import { runnerApi, useRunnerStatus } from '@/services/runner'
import type { ActiveAgentSnapshot, RunSnapshot } from '@/services/runner'
import { plansApi } from '@/services/plans'
import { projectsApi } from '@/services/projects'
import type { Project } from '@/types'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { useAgentExecutionsMap, useLatestPlanRun, useWavesData } from '@/hooks/runner'

type DashboardTab = 'waves' | 'discussions'

export function RunnerDashboard() {
  const { planId } = useParams<{ planId: string }>()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const { snapshot, isRunning, error, refresh } = useRunnerStatus(planId)
  const latestRun = useLatestPlanRun(planId)
  const { waves: wavesData, loading: wavesLoading } = useWavesData(planId, isRunning)

  // Plan title (the snapshot only carries the current *task* title)
  const [planTitle, setPlanTitle] = useState<string | null>(null)
  // The plan's project: where a resumed run starts, and which plans/tasks "Rattacher à…" offers.
  const [project, setProject] = useState<Project | null>(null)
  useEffect(() => {
    if (!planId) return
    let cancelled = false
    plansApi
      .get(planId)
      .then(async (p) => {
        if (cancelled) return
        setPlanTitle(p.title)
        if (p.project_id) {
          const found = ((await projectsApi.list()).items || []).find((x) => x.id === p.project_id) ?? null
          if (!cancelled) setProject(found)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [planId])

  const effectiveSnapshot: RunSnapshot | null = useMemo(() => {
    if (!snapshot) return null
    if (snapshot.running || snapshot.run_id) return snapshot
    if (latestRun) {
      const elapsed = latestRun.completed_at
        ? (new Date(latestRun.completed_at).getTime() - new Date(latestRun.started_at).getTime()) / 1000
        : 0
      const totalDone = latestRun.completed_tasks.length + latestRun.failed_tasks.length
      return {
        running: false, run_id: latestRun.run_id, plan_id: latestRun.plan_id,
        status: latestRun.status as RunSnapshot['status'],
        current_wave: latestRun.current_wave,
        current_task_id: latestRun.current_task_id,
        current_task_title: latestRun.current_task_title,
        active_agents: latestRun.active_agents ?? [],
        progress_pct: latestRun.total_tasks > 0 ? (totalDone / latestRun.total_tasks) * 100 : 0,
        tasks_completed: latestRun.completed_tasks.length,
        tasks_total: latestRun.total_tasks,
        elapsed_secs: elapsed, cost_usd: latestRun.cost_usd ?? 0, max_cost_usd: 0,
      }
    }
    return snapshot
  }, [snapshot, latestRun])

  const effectiveRunId = effectiveSnapshot?.run_id ?? null
  const executionsMap = useAgentExecutionsMap(effectiveRunId, isRunning)

  const [activeTab, setActiveTab] = useState<DashboardTab>('waves')
  const [selectedConversation, setSelectedConversation] = useState<{ sessionId: string; taskTitle: string } | null>(null)

  const handleBudgetSave = useCallback(async (_planId: string, value: number) => {
    if (!planId) return
    try {
      await runnerApi.updateBudget(planId, value)
      toast.success('Budget updated')
      refresh()
    } catch {
      toast.error('Failed to update the budget')
      throw new Error('budget')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
  }, [planId, refresh])

  const { taskWaveMap, taskTitleMap } = useMemo(() => {
    const waveMap = new Map<string, number>()
    const titleMap = new Map<string, string>()
    if (wavesData) {
      for (const wave of wavesData.waves) {
        for (const task of wave.tasks) {
          waveMap.set(task.id, wave.wave_number)
          if (task.title) titleMap.set(task.id, task.title)
        }
      }
    }
    return { taskWaveMap: waveMap, taskTitleMap: titleMap }
  }, [wavesData])

  const resolvedAgents: ActiveAgentSnapshot[] = useMemo(() => {
    const liveAgents = effectiveSnapshot?.active_agents ?? []
    const liveTaskIds = new Set(liveAgents.map((a) => a.task_id))
    const historicalAgents: ActiveAgentSnapshot[] = Array.from(executionsMap.values())
      .filter((exec) => !liveTaskIds.has(exec.task_id))
      .map((exec) => ({
        task_id: exec.task_id,
        task_title: taskTitleMap.get(exec.task_id) ?? exec.task_id.slice(0, 8),
        session_id: exec.session_id ?? null,
        elapsed_secs: exec.duration_secs, cost_usd: exec.cost_usd,
        status: exec.status === 'timeout' ? 'failed' : (exec.status as ActiveAgentSnapshot['status']),
      }))
    return [...liveAgents, ...historicalAgents]
  }, [effectiveSnapshot, executionsMap, taskTitleMap])

  const waveAgentsMap = useMemo(() => {
    const map = new Map<number, ActiveAgentSnapshot[]>()
    for (const agent of resolvedAgents) {
      const waveNum = taskWaveMap.get(agent.task_id) ?? -1
      const existing = map.get(waveNum) ?? []
      existing.push(agent)
      map.set(waveNum, existing)
    }
    return map
  }, [resolvedAgents, taskWaveMap])

  const orderedWaves = useMemo<Array<{ waveNumber: number; taskIds: string[]; agents: ActiveAgentSnapshot[] }>>(() => {
    if (!wavesData) {
      return resolvedAgents.length > 0
        ? [{ waveNumber: 1, taskIds: resolvedAgents.map((a) => a.task_id), agents: resolvedAgents }]
        : []
    }
    return wavesData.waves.map((wave) => {
      const waveAgents = waveAgentsMap.get(wave.wave_number) ?? []
      const agentTaskIds = new Set(waveAgents.map((a) => a.task_id))
      const currentWave = effectiveSnapshot?.current_wave ?? 0
      const waveAlreadyRan = wave.wave_number <= currentWave || !isRunning
      const syntheticAgents: ActiveAgentSnapshot[] = waveAlreadyRan
        ? wave.tasks.filter((t) => !agentTaskIds.has(t.id)).map((t) => ({
            task_id: t.id,
            task_title: t.title ?? t.id.slice(0, 8),
            session_id: null, elapsed_secs: 0, cost_usd: 0,
            status: (t.status === 'completed' ? 'completed'
              : t.status === 'failed' ? 'failed'
              : t.status === 'pending' || t.status === 'blocked' ? 'failed'
              : 'completed') as ActiveAgentSnapshot['status'],
          }))
        : []
      return { waveNumber: wave.wave_number, taskIds: wave.tasks.map((t) => t.id), agents: [...waveAgents, ...syntheticAgents] }
    })
  }, [wavesData, waveAgentsMap, resolvedAgents, effectiveSnapshot, isRunning])

  const handleToggleConversation = useCallback((sessionId: string, taskTitle: string) => {
    setSelectedConversation((prev) => (prev?.sessionId === sessionId ? null : { sessionId, taskTitle }))
  }, [])
  const handleCloseConversation = useCallback(() => setSelectedConversation(null), [])

  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null)
  const handleRetryTask = useCallback(async (taskId: string, taskTitle: string) => {
    if (!planId || retryingTaskId) return
    setRetryingTaskId(taskId)
    try {
      await runnerApi.retryTask(planId, taskId)
      toast.success(`Retrying “${taskTitle}”`)
      refresh()
    } catch {
      toast.error('Failed to retry the task')
    } finally {
      setRetryingTaskId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
  }, [planId, retryingTaskId, refresh])

  const [retryingRun, setRetryingRun] = useState(false)
  const handleRetryRun = useCallback(async () => {
    if (!planId || retryingRun) return
    setRetryingRun(true)
    try {
      await runnerApi.startRun(planId, '.', undefined, effectiveSnapshot?.max_cost_usd)
      toast.success('Run started')
      refresh()
    } catch {
      toast.error('Failed to start the run')
    } finally {
      setRetryingRun(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
  }, [planId, retryingRun, effectiveSnapshot?.max_cost_usd, refresh])

  const runTaskStatuses = useMemo(() => {
    const out: Record<string, string> = {}
    for (const id of latestRun?.failed_tasks ?? []) out[id] = 'failed'
    for (const a of resolvedAgents) if (a.status === 'failed') out[a.task_id] = 'failed'
    return out
  }, [latestRun, resolvedAgents])

  // ── Loading / error ──────────────────────────────────────────────────
  if (error && !snapshot && !latestRun) {
    return (
      <PageContainer width="wide">
        <ErrorState title="Runner not available" description={error} onRetry={refresh} />
      </PageContainer>
    )
  }
  if (!effectiveSnapshot) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <div className="h-7 w-2/3 rounded bg-white/[0.04]" />
        <div className="h-4 w-1/2 rounded bg-white/[0.04]" />
        <EntityListSkeleton rows={4} />
      </PageContainer>
    )
  }

  const title = planTitle ?? effectiveSnapshot.current_task_title ?? `Plan ${planId?.slice(0, 8)}…`
  const failedCount = resolvedAgents.filter((a) => a.status === 'failed').length
  const anyActive = orderedWaves.some((w) => getWaveStatus(w.agents) === 'active')

  return (
    <PageContainer width="wide" className="space-y-6">
      <RunnerHeader
        planId={planId!} planTitle={title} wsSlug={wsSlug} workspacePath={workspacePath}
        effectiveSnapshot={effectiveSnapshot} isRunning={isRunning}
        wavesTotal={wavesData?.waves.length ?? null} failedCount={failedCount}
        onRetryRun={handleRetryRun} retrying={retryingRun}
      />

      <StatsRow
        effectiveSnapshot={effectiveSnapshot} isRunning={isRunning}
        resolvedAgents={resolvedAgents} wavesTotal={wavesData?.waves.length ?? null}
        planId={planId!} onBudgetSave={handleBudgetSave}
      />

      <div className="space-y-3">
        <ViewTabs
          label="Runner views"
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'waves', label: 'Waves', count: orderedWaves.length || undefined },
            { id: 'discussions', label: 'Discussion tree' },
          ]}
        />

        {activeTab === 'waves' ? (
          <>
            <Explainer>
              A run executes the plan wave by wave: the tasks of a wave run in parallel, each one by its own agent.
              Open an agent's conversation to follow it live; retry a failed task from its row.
            </Explainer>
            {wavesLoading && orderedWaves.length === 0 ? (
              <EntityListSkeleton rows={4} />
            ) : orderedWaves.length > 0 ? (
              <div className="space-y-3">
                {orderedWaves.map((wave) => {
                  const wStatus = getWaveStatus(wave.agents)
                  const defaultOpen =
                    wStatus === 'active' || wStatus === 'partial' || wStatus === 'failed' || (wStatus === 'pending' && !anyActive)
                  return (
                    <WaveSection
                      key={wave.waveNumber}
                      waveNumber={wave.waveNumber} taskIds={wave.taskIds} agents={wave.agents}
                      executionsMap={executionsMap} selectedConversation={selectedConversation}
                      onToggleConversation={handleToggleConversation} onCloseConversation={handleCloseConversation}
                      onRetryTask={handleRetryTask} retryingTaskId={retryingTaskId} defaultOpen={defaultOpen}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState
                title={effectiveSnapshot.running ? 'Waiting for agents to start…' : 'No agents were spawned'}
                description={
                  effectiveSnapshot.running
                    ? 'The first wave is being prepared. Agents appear here as soon as they start.'
                    : 'This run has no agent executions. Retry the run to start it again.'
                }
              />
            )}
          </>
        ) : effectiveRunId ? (
          <LinkedDiscussions
            entity={{ type: 'run', id: effectiveRunId }}
            projectId={project?.id}
            projectSlug={project?.slug}
            onChanged={refresh}
            resume={{
              planId,
              project,
              run: { id: effectiveRunId, status: effectiveSnapshot.status },
              taskStatuses: runTaskStatuses,
            }}
          />
        ) : (
          <EmptyState title="No discussion sessions" description="No conversation was recorded for this run." />
        )}
      </div>
    </PageContainer>
  )
}
