/**
 * WaveSection — collapsible accordion for a single wave of agents.
 *
 * Shows wave status, progress bar, agent cards grid, and inline conversation.
 * Active/failed waves auto-expand; completed/pending waves start collapsed.
 */

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Activity,
  AlertTriangle,
} from 'lucide-react'
import type { ActiveAgentSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'
import { formatElapsed, formatCost, getWaveStatus, waveStatusStyles, waveStatusLabels } from './shared'
import { WaveAgentCard } from './WaveAgentCard'
import { InlineConversation } from './InlineConversation'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WaveSectionProps {
  waveNumber: number
  taskIds: string[]
  agents: ActiveAgentSnapshot[]
  executionsMap: Map<string, AgentExecution>
  selectedConversation: { sessionId: string; taskTitle: string } | null
  onToggleConversation: (sessionId: string, taskTitle: string) => void
  onCloseConversation: () => void
  onRetryTask?: (taskId: string, taskTitle: string) => void
  defaultOpen: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaveSection({
  waveNumber,
  taskIds,
  agents,
  executionsMap,
  selectedConversation,
  onToggleConversation,
  onCloseConversation,
  onRetryTask,
  defaultOpen,
}: WaveSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const waveStatus = getWaveStatus(agents)
  const styles = waveStatusStyles[waveStatus]

  const completedCount = agents.filter(a => a.status === 'completed').length
  const failedCount = agents.filter(a => a.status === 'failed').length
  const totalCount = taskIds.length
  const waveCost = agents.reduce((sum, a) => sum + a.cost_usd, 0)
  const waveTime = agents.reduce((max, a) => Math.max(max, a.elapsed_secs), 0)

  // Check if the selected conversation belongs to this wave + find the matching agent
  const conversationAgent = selectedConversation
    ? agents.find(a => a.session_id === selectedConversation.sessionId)
    : null
  const conversationInThisWave = !!conversationAgent

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} transition-all duration-200`}>
      {/* Wave header (clickable) */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {open
            ? <ChevronDown className="w-4 h-4 text-gray-500" />
            : <ChevronRight className="w-4 h-4 text-gray-500" />
          }
          <span className="text-sm font-semibold text-gray-200">
            Wave {waveNumber}
          </span>
          {waveStatus === 'active' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-[10px] font-medium">
              <Activity className="w-3 h-3" />
              Active
            </span>
          )}
          {waveStatus === 'failed' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-medium">
              <AlertTriangle className="w-3 h-3" />
              Failed
            </span>
          )}
          {waveStatus !== 'active' && waveStatus !== 'failed' && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles.badge} ${styles.badgeText}`}>
              {waveStatusLabels[waveStatus]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {failedCount > 0 && (
            <span className="text-red-400">{failedCount} failed</span>
          )}
          <span>{completedCount}/{totalCount} tasks</span>
          {waveCost > 0 && (
            <span className="font-mono tabular-nums">{formatCost(waveCost)}</span>
          )}
          {waveTime > 0 && (
            <span className="font-mono tabular-nums">{formatElapsed(waveTime)}</span>
          )}
        </div>
      </button>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="px-4 pb-1">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden flex">
            {completedCount > 0 && (
              <div
                className="h-full bg-green-500/70 transition-all duration-300"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            )}
            {failedCount > 0 && (
              <div
                className="h-full bg-red-500/70 transition-all duration-300"
                style={{ width: `${(failedCount / totalCount) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Expanded content */}
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          {/* Agent cards grid */}
          {agents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {agents.map((agent, idx) => (
                <WaveAgentCard
                  key={`${agent.task_id}-${idx}`}
                  agent={agent}
                  execution={executionsMap.get(agent.task_id)}
                  isSelected={selectedConversation?.sessionId === agent.session_id}
                  onToggleConversation={onToggleConversation}
                  onRetryTask={onRetryTask}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 py-2">
              {waveStatus === 'pending' ? 'Waiting for previous waves to complete...' : 'No agents for this wave.'}
            </p>
          )}

          {/* Inline conversation panel (full width, below agent cards) */}
          {conversationInThisWave && selectedConversation && conversationAgent && (
            <InlineConversation
              sessionId={selectedConversation.sessionId}
              taskTitle={selectedConversation.taskTitle}
              agentStatus={conversationAgent.status}
              elapsedSecs={conversationAgent.elapsed_secs}
              onClose={onCloseConversation}
            />
          )}
        </div>
      )}
    </div>
  )
}
