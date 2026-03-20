/**
 * RunnerDashboard — real-time view of a plan's runner execution.
 * Composition-only orchestrator: delegates to extracted components.
 */

import { useState, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Layers, GitBranch, Loader2 } from 'lucide-react'
import { Card, CardContent, LoadingPage, ErrorState } from '@/components/ui'
import { RunnerHeader } from '@/components/runner/RunnerHeader'
import { StatsRow } from '@/components/runner/StatsRow'
import { WaveSection } from '@/components/runner/WaveSection'
import { getWaveStatus } from '@/components/runner/shared'
import { DiscussionTreeView } from '@/components/discussions/DiscussionTreeView'
import { runnerApi, useRunnerStatus } from '@/services/runner'
import type { ActiveAgentSnapshot, RunSnapshot } from '@/services/runner'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import {
  useAgentExecutionsMap,
  useLatestPlanRun,
  useRunRootSession,
  useWavesData,
} from '@/hooks/runner'

type DashboardTab = 'waves' | 'discussions'

const tabCls = (active: boolean) =>
  `px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
    active ? 'border-indigo-500 text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-300'
  }`

export function RunnerDashboard() {
  const { planId } = useParams<{ planId: string }>()
  const wsSlug = useWorkspaceSlug()
  const { snapshot, isRunning, error, refresh } = useRunnerStatus(planId)
  const latestRun = useLatestPlanRun(planId)
  const { waves: wavesData, loading: wavesLoading } = useWavesData(planId, isRunning)

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
  const { rootSessionId, loading: rootSessionLoading } = useRunRootSession(effectiveRunId)

  const [activeTab, setActiveTab] = useState<DashboardTab>('waves')
  const [selectedConversation, setSelectedConversation] = useState<{ sessionId: string; taskTitle: string } | null>(null)

  const handleBudgetSave = useCallback(async (_planId: string, value: number) => {
    if (!planId) return
    await runnerApi.updateBudget(planId, value)
    refresh()
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
    const liveTaskIds = new Set(liveAgents.map(a => a.task_id))
    const historicalAgents: ActiveAgentSnapshot[] = Array.from(executionsMap.values())
      .filter(exec => !liveTaskIds.has(exec.task_id))
      .map((exec) => ({
        task_id: exec.task_id,
        task_title: taskTitleMap.get(exec.task_id) ?? exec.task_id.slice(0, 8),
        session_id: exec.session_id ?? null,
        elapsed_secs: exec.duration_secs, cost_usd: exec.cost_usd,
        status: exec.status === 'timeout' ? 'failed' : exec.status as ActiveAgentSnapshot['status'],
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
        ? [{ waveNumber: 1, taskIds: resolvedAgents.map(a => a.task_id), agents: resolvedAgents }]
        : []
    }
    return wavesData.waves.map((wave) => {
      const waveAgents = waveAgentsMap.get(wave.wave_number) ?? []
      const agentTaskIds = new Set(waveAgents.map(a => a.task_id))
      const currentWave = effectiveSnapshot?.current_wave ?? 0
      const waveAlreadyRan = wave.wave_number <= currentWave || !isRunning
      const syntheticAgents: ActiveAgentSnapshot[] = waveAlreadyRan
        ? wave.tasks.filter(t => !agentTaskIds.has(t.id)).map(t => ({
            task_id: t.id,
            task_title: t.title ?? t.id.slice(0, 8),
            session_id: null, elapsed_secs: 0, cost_usd: 0,
            status: (t.status === 'completed' ? 'completed'
              : t.status === 'failed' ? 'failed'
              : t.status === 'pending' || t.status === 'blocked' ? 'failed'
              : 'completed') as ActiveAgentSnapshot['status'],
          }))
        : []
      return { waveNumber: wave.wave_number, taskIds: wave.tasks.map(t => t.id), agents: [...waveAgents, ...syntheticAgents] }
    })
  }, [wavesData, waveAgentsMap, resolvedAgents, effectiveSnapshot, isRunning])

  const handleToggleConversation = useCallback((sessionId: string, taskTitle: string) => {
    setSelectedConversation(prev => prev?.sessionId === sessionId ? null : { sessionId, taskTitle })
  }, [])
  const handleCloseConversation = useCallback(() => setSelectedConversation(null), [])

  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null)
  const handleRetryTask = useCallback(async (taskId: string, _taskTitle: string) => {
    if (!planId || retryingTaskId) return
    setRetryingTaskId(taskId)
    try { await runnerApi.retryTask(planId, taskId); refresh() }
    catch (err) { console.error('Failed to retry task:', err) }
    finally { setRetryingTaskId(null) }
  }, [planId, retryingTaskId, refresh])

  const [retryingRun, setRetryingRun] = useState(false)
  const handleRetryRun = useCallback(async () => {
    if (!planId || retryingRun) return
    setRetryingRun(true)
    try { await runnerApi.startRun(planId, '.', undefined, effectiveSnapshot?.max_cost_usd); refresh() }
    catch (err) { console.error('Failed to retry run:', err) }
    finally { setRetryingRun(false) }
  }, [planId, retryingRun, effectiveSnapshot?.max_cost_usd, refresh])

  if (error && !snapshot && !latestRun) {
    return <ErrorState title="Runner not available" description={error} onRetry={refresh} />
  }
  if (!effectiveSnapshot) return <LoadingPage />

  const planTitle = effectiveSnapshot.current_task_title ?? `Plan ${planId?.slice(0, 8)}...`

  return (
    <div className="pt-6 flex flex-col h-full min-h-0">
      <div className="mb-6 space-y-4 flex-shrink-0">
        <RunnerHeader
          planId={planId!} planTitle={planTitle} wsSlug={wsSlug} workspacePath={workspacePath}
          effectiveSnapshot={effectiveSnapshot} isRunning={isRunning}
          onRetryRun={handleRetryRun} retrying={retryingRun}
        />
        <StatsRow
          effectiveSnapshot={effectiveSnapshot} isRunning={isRunning}
          resolvedAgents={resolvedAgents} wavesTotal={wavesData?.waves.length ?? null}
          planId={planId!} onBudgetSave={handleBudgetSave}
        />
        <div className="flex items-center gap-1 border-b border-border-subtle">
          <button onClick={() => setActiveTab('waves')} className={tabCls(activeTab === 'waves')}>
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />Waves</span>
          </button>
          <button onClick={() => setActiveTab('discussions')} className={tabCls(activeTab === 'discussions')}>
            <span className="flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" />Discussion Tree</span>
          </button>
        </div>
      </div>

      {activeTab === 'waves' ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-6">
          {wavesLoading && orderedWaves.length === 0 ? (
            <Card><CardContent className="py-8 text-center">
              <Loader2 className="w-5 h-5 text-gray-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading wave structure...</p>
            </CardContent></Card>
          ) : orderedWaves.length > 0 ? (
            orderedWaves.map((wave) => {
              const wStatus = getWaveStatus(wave.agents)
              const defaultOpen = wStatus === 'active' || wStatus === 'partial' || wStatus === 'failed'
                || (wStatus === 'pending' && orderedWaves.every(w => getWaveStatus(w.agents) !== 'active'))
              return (
                <WaveSection key={wave.waveNumber}
                  waveNumber={wave.waveNumber} taskIds={wave.taskIds} agents={wave.agents}
                  executionsMap={executionsMap} selectedConversation={selectedConversation}
                  onToggleConversation={handleToggleConversation} onCloseConversation={handleCloseConversation}
                  onRetryTask={handleRetryTask} defaultOpen={defaultOpen}
                />
              )
            })
          ) : (
            <Card><CardContent className="py-12 text-center">
              <p className="text-sm text-gray-500">
                {effectiveSnapshot.running ? 'Waiting for agents to start...' : 'No agents have been spawned.'}
              </p>
            </CardContent></Card>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pb-6 pt-3">
          {rootSessionId ? (
            <DiscussionTreeView sessionId={rootSessionId} />
          ) : (
            <Card><CardContent className="py-12 text-center">
              <p className="text-sm text-gray-500">
                {rootSessionLoading ? 'Loading discussion tree...' : 'No discussion sessions found for this run.'}
              </p>
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  )
}
