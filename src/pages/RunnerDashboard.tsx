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
import { useRunnerStatus } from '@/services/runner'
import type { ActiveAgentSnapshot } from '@/services/runner'
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

  // Fetch agent executions for the current run
  const executionsMap = useAgentExecutionsMap(snapshot?.run_id)

  // Tab state
  const [activeTab, setActiveTab] = useState<DashboardTab>('agents')

  // Conversation panel state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // Find the task title for the selected session
  const selectedAgent: ActiveAgentSnapshot | null = useMemo(() => {
    if (!snapshot || !selectedSessionId) return null
    const agents = snapshot.active_agents ?? []
    return agents.find(a => a.session_id === selectedSessionId) ?? null
  }, [snapshot, selectedSessionId])

  const handleViewConversation = (sessionId: string) => {
    setSelectedSessionId(prev => prev === sessionId ? null : sessionId)
  }

  const handleClosePanel = () => {
    setSelectedSessionId(null)
  }

  // Loading / error states
  if (error && !snapshot) {
    return <ErrorState title="Runner not available" description={error} onRetry={refresh} />
  }
  if (!snapshot) {
    return <LoadingPage />
  }

  const statusStr = snapshot.status ?? (snapshot.running ? 'running' : 'completed')
  const statusCfg = runStatusConfig[statusStr] ?? runStatusConfig.running
  const progressPercent = Math.round(snapshot.progress_pct ?? 0)

  // Split agents into active (running/spawning/verifying) vs completed/failed
  const agents = snapshot.active_agents ?? []
  const activeAgents = agents.filter(a => a.status === 'running' || a.status === 'spawning' || a.status === 'verifying')
  const doneAgents = agents.filter(a => a.status === 'completed' || a.status === 'failed')

  // Derive a plan title from current_task_title or planId
  const planTitle = snapshot.current_task_title ?? `Plan ${planId?.slice(0, 8)}...`

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
          {snapshot.current_wave != null && (
            <div className="flex items-center gap-1.5 text-gray-400">
              <Layers className="w-4 h-4 text-gray-500" />
              <span>Wave {(snapshot.current_wave ?? 0) + 1}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-gray-400">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            <span>{snapshot.tasks_completed ?? 0} / {snapshot.tasks_total ?? 0} tasks</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Users className="w-4 h-4 text-gray-500" />
            <span>{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatElapsed(snapshot.elapsed_secs)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatCost(snapshot.cost_usd)}</span>
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
              title={`Active Agents${snapshot.current_wave != null ? ` (Wave ${(snapshot.current_wave ?? 0) + 1})` : ''}`}
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
                    {snapshot.running ? 'Waiting for agents to start...' : 'No agents have been spawned.'}
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
          {snapshot.run_id ? (
            <DiscussionTreeView sessionId={snapshot.run_id} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-gray-500">No discussion tree available.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
