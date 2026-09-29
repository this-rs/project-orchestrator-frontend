/**
 * WaveSection — one wave of the runner: a collapsible group header
 * (Wave n · state · done/total · cost · time + thin progress bar) and its
 * agents as rows. The selected agent's conversation opens under the list.
 * Running / failed waves start expanded (decided by the parent).
 *
 * Composed from the list primitives (surface + flush EntityList) because
 * ListGroup's header cannot hold a status + progress line.
 */

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { EntityList, MetaLine, focusRingInset, surface, ToneText } from '@/components/ui'
import type { ActiveAgentSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'
import { formatElapsed, formatCost, getWaveStatus, waveStateMeta } from './shared'
import { WaveAgentCard } from './WaveAgentCard'
import { InlineConversation } from './InlineConversation'
import { LiveProgress } from './LiveProgress'

export interface WaveSectionProps {
  waveNumber: number
  taskIds: string[]
  agents: ActiveAgentSnapshot[]
  executionsMap: Map<string, AgentExecution>
  selectedConversation: { sessionId: string; taskTitle: string } | null
  onToggleConversation: (sessionId: string, taskTitle: string) => void
  onCloseConversation: () => void
  onRetryTask?: (taskId: string, taskTitle: string) => void
  retryingTaskId?: string | null
  defaultOpen: boolean
}

export function WaveSection({
  waveNumber,
  taskIds,
  agents,
  executionsMap,
  selectedConversation,
  onToggleConversation,
  onCloseConversation,
  onRetryTask,
  retryingTaskId,
  defaultOpen,
}: WaveSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const waveStatus = getWaveStatus(agents)
  const waveMeta = waveStateMeta(waveStatus)

  const completedCount = agents.filter((a) => a.status === 'completed').length
  const failedCount = agents.filter((a) => a.status === 'failed').length
  const totalCount = taskIds.length
  const waveCost = agents.reduce((sum, a) => sum + a.cost_usd, 0)
  const waveTime = agents.reduce((max, a) => Math.max(max, a.elapsed_secs), 0)

  const conversationAgent = selectedConversation ? agents.find((a) => a.session_id === selectedConversation.sessionId) : null

  return (
    <section className={`${surface} overflow-hidden`} aria-label={`Wave ${waveNumber}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full text-left px-3 md:px-4 py-2.5 hover:bg-white/[0.02] ${focusRingInset}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          <span className="text-sm font-medium text-gray-200 whitespace-nowrap">Wave {waveNumber}</span>
          <ToneText tone={waveMeta.tone} label={waveMeta.label} pulse={waveMeta.live} className="text-xs min-w-0" />
          <span className="ml-auto shrink-0 text-xs tabular-nums text-gray-400">
            {completedCount}/{totalCount}
          </span>
        </div>
        <div className="pl-[22px] mt-1 space-y-2 min-w-0">
          <MetaLine
            items={[
              `${totalCount} ${totalCount === 1 ? 'task' : 'tasks'}`,
              failedCount > 0 ? <span key="f" className="text-red-400">{failedCount} failed</span> : null,
              waveCost > 0 ? <span key="c" className="font-mono tabular-nums">{formatCost(waveCost)}</span> : null,
              waveTime > 0 ? <span key="t" className="font-mono tabular-nums">{formatElapsed(waveTime)}</span> : null,
            ]}
          />
          {totalCount > 0 && (
            <LiveProgress done={completedCount} failed={failedCount} total={totalCount} label={`Wave ${waveNumber} progress`} />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-white/[0.05]">
          {agents.length > 0 ? (
            <EntityList variant="flush" aria-label={`Wave ${waveNumber} agents`}>
              {agents.map((agent, idx) => (
                <WaveAgentCard
                  key={`${agent.task_id}-${idx}`}
                  agent={agent}
                  execution={executionsMap.get(agent.task_id)}
                  isSelected={!!agent.session_id && selectedConversation?.sessionId === agent.session_id}
                  onToggleConversation={onToggleConversation}
                  onRetryTask={onRetryTask}
                  retrying={retryingTaskId === agent.task_id}
                />
              ))}
            </EntityList>
          ) : (
            <p className="px-4 py-3 text-xs text-gray-500">
              {waveStatus === 'pending' ? 'Waiting for the previous waves to finish…' : 'No agents for this wave.'}
            </p>
          )}

          {conversationAgent && selectedConversation && (
            <div className="p-2 border-t border-white/[0.05] min-w-0">
              <InlineConversation
                sessionId={selectedConversation.sessionId}
                taskTitle={selectedConversation.taskTitle}
                agentStatus={conversationAgent.status}
                elapsedSecs={conversationAgent.elapsed_secs}
                onClose={onCloseConversation}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
