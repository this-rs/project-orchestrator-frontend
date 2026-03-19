/**
 * RunnerDashboard — real-time view of a plan's runner execution.
 *
 * Shows active agents as cards, with a side panel for
 * live WebSocket conversation viewing.
 *
 * Aligned with backend RunStatus (flat structure, no waves array).
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Activity, Clock, DollarSign, Layers, ArrowLeft, GitBranch, CheckCircle2, Users } from 'lucide-react'
import { Card, CardContent, LoadingPage, ErrorState, ProgressBar } from '@/components/ui'
import { AgentCard } from '@/components/runner/AgentCard'
import { AgentExecutionDetail } from '@/components/runner/AgentExecutionDetail'
import { CancelButton } from '@/components/runner/CancelButton'
import { ConversationPanel } from '@/components/runner/ConversationPanel'
import { DiscussionTreeView } from '@/components/discussions/DiscussionTreeView'
import { chatApi } from '@/services/chat'
import { runnerApi, useRunnerStatus } from '@/services/runner'
import type { ActiveAgentSnapshot, PlanRun, RunSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(secs: number | undefined | null): string {
  const v = secs ?? 0
  const m = Math.floor(v / 60)
  const s = Math.floor(v % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCost(usd: number | undefined | null): string {
  return `$${(usd ?? 0).toFixed(2)}`
}

const runStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  running:   { label: 'Running',   bg: 'bg-blue-500/15',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  completed: { label: 'Completed', bg: 'bg-green-500/15',  text: 'text-green-400',  dot: 'bg-green-400' },
  failed:    { label: 'Failed',    bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-500/15',   text: 'text-gray-400',   dot: 'bg-gray-400' },
}

// ---------------------------------------------------------------------------
// Agent executions lookup by task_id
// ---------------------------------------------------------------------------

function useAgentExecutionsMap(runId: string | null | undefined) {
  const [execMap, setExecMap] = useState<Map<string, AgentExecution>>(new Map())

  const fetchExecutions = useCallback(async () => {
    if (!runId) return
    try {
      const execs = await chatApi.getAgentExecutions(runId)
      const map = new Map<string, AgentExecution>()
      for (const e of execs) map.set(e.task_id, e)
      setExecMap(map)
    } catch {
      // Endpoint may not be available yet — graceful fallback
    }
  }, [runId])

  useEffect(() => { fetchExecutions() }, [fetchExecutions])

  return execMap
}

// ---------------------------------------------------------------------------
// Historical PlanRun fallback — for completed/failed runs
// ---------------------------------------------------------------------------

function useLatestPlanRun(planId: string | undefined) {
  const [planRun, setPlanRun] = useState<PlanRun | null>(null)

  useEffect(() => {
    if (!planId) return
    runnerApi.listPlanRuns(planId, 1).then((runs) => {
      if (runs.length > 0) setPlanRun(runs[0])
    }).catch(() => {})
  }, [planId])

  return planRun
}

// ---------------------------------------------------------------------------
// Root session for a run — resolves run_id → root ChatSession ID
// ---------------------------------------------------------------------------

function useRunRootSession(runId: string | null | undefined) {
  const [rootSessionId, setRootSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!runId) { setRootSessionId(null); setLoading(false); return }
    setLoading(true)
    chatApi.getRunSessions(runId).then((sessions) => {
      if (sessions.length > 0) {
        // The first session (sorted by created_at) is typically the root
        setRootSessionId(sessions[0].id)
      } else {
        setRootSessionId(null)
      }
    }).catch(() => {
      setRootSessionId(null)
    }).finally(() => {
      setLoading(false)
    })
  }, [runId])

  return { rootSessionId, loading }
}

// ---------------------------------------------------------------------------
// AgentsSection (collapsible section showing a group of agents)
// ---------------------------------------------------------------------------

interface AgentsSectionProps {
  title: string
  agents: ActiveAgentSnapshot[]
  isActive: boolean
  defaultOpen?: boolean
  selectedSessionId: string | null
  onViewConversation: (sessionId: string) => void
  executionsMap: Map<string, AgentExecution>
}

function AgentsSection({ title, agents, isActive, defaultOpen = false, selectedSessionId, onViewConversation, executionsMap }: AgentsSectionProps) {
  const [open, setOpen] = useState(defaultOpen || isActive)

  const completedCount = agents.filter(a => a.status === 'completed').length
  const failedCount = agents.filter(a => a.status === 'failed').length
  const totalCount = agents.length

  if (totalCount === 0) return null

  return (
    <div className={`rounded-lg border ${isActive ? 'border-indigo-500/30 bg-indigo-500/[0.02]' : 'border-border-subtle bg-white/[0.02]'}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          <span className="text-sm font-medium text-gray-200">
            {title}
          </span>
          {isActive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-[10px] font-medium">
              <Activity className="w-3 h-3" />
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{completedCount}/{totalCount} done</span>
          {failedCount > 0 && (
            <span className="text-red-400">{failedCount} failed</span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent, idx) => {
              const exec = executionsMap.get(agent.task_id)
              return (
                <AgentCard
                  key={`${agent.task_id}-${idx}`}
                  agent={agent}
                  isSelected={selectedSessionId === agent.session_id}
                  onViewConversation={onViewConversation}
                  detailContent={exec ? (
                    <AgentExecutionDetail
                      execution={exec}
                      onViewConversation={exec.session_id ? onViewConversation : undefined}
                    />
                  ) : undefined}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RunnerDashboard
// ---------------------------------------------------------------------------

type DashboardTab = 'agents' | 'discussions'

export function RunnerDashboard() {
  const { planId } = useParams<{ planId: string }>()
  const wsSlug = useWorkspaceSlug()
  const { snapshot, isRunning, error, refresh } = useRunnerStatus(planId)

  // Historical fallback — fetch the latest PlanRun when no active run
  const latestRun = useLatestPlanRun(planId)

  // Build an effective snapshot that merges live data with historical data
  // When no active run exists, the backend returns { running: false, run_id: null, ... }
  // In that case, we build a synthetic snapshot from the latest PlanRun
  const effectiveSnapshot: RunSnapshot | null = useMemo(() => {
    if (!snapshot) return null

    // If there's an active run with data, use it as-is
    if (snapshot.running || snapshot.run_id) return snapshot

    // No active run — build a synthetic snapshot from latest PlanRun
    if (latestRun) {
      const elapsed = latestRun.completed_at
        ? (new Date(latestRun.completed_at).getTime() - new Date(latestRun.started_at).getTime()) / 1000
        : 0
      const totalDone = latestRun.completed_tasks.length + latestRun.failed_tasks.length
      return {
        running: false,
        run_id: latestRun.run_id,
        plan_id: latestRun.plan_id,
        status: latestRun.status === 'budget_exceeded' ? 'failed' : latestRun.status,
        current_wave: latestRun.current_wave,
        current_task_id: latestRun.current_task_id,
        current_task_title: latestRun.current_task_title,
        active_agents: latestRun.active_agents ?? [],
        progress_pct: latestRun.total_tasks > 0 ? (totalDone / latestRun.total_tasks) * 100 : 0,
        tasks_completed: latestRun.completed_tasks.length,
        tasks_total: latestRun.total_tasks,
        elapsed_secs: elapsed,
        cost_usd: latestRun.cost_usd ?? 0,
      }
    }

    return snapshot
  }, [snapshot, latestRun])

  // Determine the effective run_id (active run or latest historical)
  const effectiveRunId = effectiveSnapshot?.run_id ?? null

  // Fetch agent executions for the run (works for both active and completed)
  const executionsMap = useAgentExecutionsMap(effectiveRunId)

  // Resolve root session for discussion tree (run_id → ChatSession ID)
  const { rootSessionId, loading: rootSessionLoading } = useRunRootSession(effectiveRunId)

  // Tab state
  const [activeTab, setActiveTab] = useState<DashboardTab>('agents')

  // Conversation panel state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // Build agent list: prefer live snapshot agents, fall back to AgentExecution records
  const resolvedAgents: ActiveAgentSnapshot[] = useMemo(() => {
    const liveAgents = effectiveSnapshot?.active_agents ?? []
    if (liveAgents.length > 0) return liveAgents

    // Fallback: convert AgentExecution records to ActiveAgentSnapshot shape
    if (executionsMap.size > 0) {
      return Array.from(executionsMap.values()).map((exec) => ({
        task_id: exec.task_id,
        task_title: exec.task_id.slice(0, 8), // Will be enriched by AgentExecutionDetail
        session_id: exec.session_id ?? null,
        elapsed_secs: exec.duration_secs,
        cost_usd: exec.cost_usd,
        status: exec.status === 'timeout' ? 'failed' : exec.status as ActiveAgentSnapshot['status'],
      }))
    }

    return []
  }, [effectiveSnapshot, executionsMap])

  // Find the task title for the selected session
  const selectedAgent: ActiveAgentSnapshot | null = useMemo(() => {
    if (!selectedSessionId) return null
    return resolvedAgents.find(a => a.session_id === selectedSessionId) ?? null
  }, [resolvedAgents, selectedSessionId])

  const handleViewConversation = (sessionId: string) => {
    setSelectedSessionId(prev => prev === sessionId ? null : sessionId)
  }

  const handleClosePanel = () => {
    setSelectedSessionId(null)
  }

  // Loading / error states
  if (error && !snapshot && !latestRun) {
    return <ErrorState title="Runner not available" description={error} onRetry={refresh} />
  }
  if (!effectiveSnapshot) {
    return <LoadingPage />
  }

  const statusStr = effectiveSnapshot.status ?? (effectiveSnapshot.running ? 'running' : 'completed')
  const statusCfg = runStatusConfig[statusStr] ?? runStatusConfig.running
  const progressPercent = Math.round(effectiveSnapshot.progress_pct ?? 0)

  // Split agents into active (running/spawning/verifying) vs completed/failed
  const agents = resolvedAgents
  const activeAgents = agents.filter(a => a.status === 'running' || a.status === 'spawning' || a.status === 'verifying')
  const doneAgents = agents.filter(a => a.status === 'completed' || a.status === 'failed')

  // Derive a plan title from current_task_title or planId
  const planTitle = effectiveSnapshot.current_task_title ?? `Plan ${planId?.slice(0, 8)}...`

  return (
    <div className="pt-6 flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="mb-6 space-y-4 flex-shrink-0 px-0">
        {/* Breadcrumb */}
        <Link
          to={workspacePath(wsSlug, `/plans/${planId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to plan
        </Link>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Runner Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">{planTitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <CancelButton planId={planId!} isRunning={isRunning} />
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${isRunning ? 'animate-pulse' : ''}`} />
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-6 text-sm">
          {effectiveSnapshot.current_wave != null && (
            <div className="flex items-center gap-1.5 text-gray-400">
              <Layers className="w-4 h-4 text-gray-500" />
              <span>Wave {(effectiveSnapshot.current_wave ?? 0) + 1}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-gray-400">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            <span>{effectiveSnapshot.tasks_completed ?? 0} / {effectiveSnapshot.tasks_total ?? 0} tasks</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Users className="w-4 h-4 text-gray-500" />
            <span>{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatElapsed(effectiveSnapshot.elapsed_secs)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatCost(effectiveSnapshot.cost_usd)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar value={progressPercent} />

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border-subtle">
          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === 'agents'
                ? 'border-indigo-500 text-gray-200'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Agents
            </span>
          </button>
          <button
            onClick={() => setActiveTab('discussions')}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === 'discussions'
                ? 'border-indigo-500 text-gray-200'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              Discussion Tree
            </span>
          </button>
        </div>
      </div>

      {/* Main content */}
      {activeTab === 'agents' ? (
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Left: agents list */}
          <div className={`flex-1 min-w-0 overflow-y-auto space-y-3 pb-6 pr-0`}>
            {/* Active agents */}
            <AgentsSection
              title={`Active Agents${effectiveSnapshot.current_wave != null ? ` (Wave ${(effectiveSnapshot.current_wave ?? 0) + 1})` : ''}`}
              agents={activeAgents}
              isActive={true}
              defaultOpen={true}
              selectedSessionId={selectedSessionId}
              onViewConversation={handleViewConversation}
              executionsMap={executionsMap}
            />

            {/* Completed/failed agents */}
            {doneAgents.length > 0 && (
              <AgentsSection
                title="Completed Agents"
                agents={doneAgents}
                isActive={false}
                defaultOpen={false}
                selectedSessionId={selectedSessionId}
                onViewConversation={handleViewConversation}
                executionsMap={executionsMap}
              />
            )}

            {/* Empty state when no agents */}
            {agents.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    {effectiveSnapshot.running ? 'Waiting for agents to start...' : 'No agents have been spawned.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: conversation panel (conditionally shown) */}
          {selectedSessionId && selectedAgent && (
            <div className="w-[420px] flex-shrink-0 border-l border-border-subtle ml-3">
              <ConversationPanel
                sessionId={selectedSessionId}
                taskTitle={selectedAgent.task_title}
                onClose={handleClosePanel}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pb-6 pt-3">
          {rootSessionId ? (
            <DiscussionTreeView sessionId={rootSessionId} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-500">
                  {rootSessionLoading
                    ? 'Loading discussion tree...'
                    : 'No discussion sessions found for this run.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
