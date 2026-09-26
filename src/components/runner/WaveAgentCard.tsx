/**
 * WaveAgentCard — one agent (= one task) inside a wave, as an EntityRow.
 *
 *   ● Task title ·························· 02:14  [⋯]
 *     Running · $0.12 · 3 files · 1 commit
 *     [View conversation] [Retry]              (visible buttons, no hover)
 *     details (files, commits, tools)            (when expanded)
 *
 * Must be rendered inside an EntityList (it is an <li>).
 */

import { useState, useMemo } from 'react'
import { Eye, EyeOff, FileCode2, GitCommitHorizontal, List, RotateCcw, SquareArrowOutUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, EntityRow, StatusDot, TONE_CLASSES, pluralize } from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { ActiveAgentSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'
import { formatElapsed, formatCost, agentStateMeta } from './shared'

export interface WaveAgentCardProps {
  agent: ActiveAgentSnapshot
  execution?: AgentExecution
  isSelected: boolean
  onToggleConversation: (sessionId: string, taskTitle: string) => void
  onRetryTask?: (taskId: string, taskTitle: string) => void
  /** Task id currently being retried (disables the button). */
  retrying?: boolean
}

export function WaveAgentCard({ agent, execution, isSelected, onToggleConversation, onRetryTask, retrying }: WaveAgentCardProps) {
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const meta = agentStateMeta(agent.status)
  const [detailOpen, setDetailOpen] = useState(false)

  const tools = useMemo(() => {
    if (!execution?.tools_used) return []
    try {
      const parsed = JSON.parse(execution.tools_used)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }, [execution?.tools_used])

  const files = execution?.files_modified ?? []
  const commits = execution?.commits ?? []
  const hasDetails = files.length > 0 || commits.length > 0 || tools.length > 0
  const canRetry = agent.status === 'failed' && !!onRetryTask

  return (
    <EntityRow
      title={agent.task_title}
      selected={isSelected}
      leading={<StatusDot tone={meta.tone} pulse={meta.live} label={meta.label} />}
      trailing={<span className="font-mono">{formatElapsed(agent.elapsed_secs)}</span>}
      meta={[
        <span key="s" className={TONE_CLASSES[meta.tone].text}>{meta.label}</span>,
        <span key="c" className="font-mono tabular-nums">{formatCost(agent.cost_usd)}</span>,
        files.length > 0 ? pluralize(files.length, 'file') : null,
        commits.length > 0 ? pluralize(commits.length, 'commit') : null,
      ]}
      actions={[
        {
          label: 'Open task',
          icon: SquareArrowOutUpRight,
          onClick: () => navigate(workspacePath(wsSlug, `/tasks/${agent.task_id}`)),
        },
      ]}
    >
      {(agent.session_id || canRetry || hasDetails) && (
        <div className="flex flex-wrap items-center gap-2">
          {agent.session_id && (
            <Button
              size="sm"
              variant={isSelected ? 'secondary' : 'ghost'}
              onClick={() => onToggleConversation(agent.session_id!, agent.task_title)}
              className="min-w-0 gap-1.5 !py-1.5 text-xs"
            >
              {isSelected ? <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">{isSelected ? 'Hide conversation' : 'View conversation'}</span>
            </Button>
          )}
          {canRetry && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRetryTask!(agent.task_id, agent.task_title)}
              loading={retrying}
              className="min-w-0 gap-1.5 !py-1.5 text-xs !text-red-300"
            >
              {!retrying && <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">Retry task</span>
            </Button>
          )}
          {hasDetails && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDetailOpen((v) => !v)}
              aria-expanded={detailOpen}
              className="min-w-0 gap-1.5 !py-1.5 text-xs text-gray-400"
            >
              <List className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{detailOpen ? 'Hide details' : 'Details'}</span>
            </Button>
          )}
        </div>
      )}
      {detailOpen && hasDetails && (
        <div className="mt-2 space-y-2 text-xs text-gray-400">
          {files.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-500">Files modified</p>
              <ul className="mt-0.5 space-y-0.5">
                {files.map((file) => (
                  <li key={file} className="flex items-start gap-1.5 min-w-0">
                    <FileCode2 className="w-3 h-3 mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
                    <span className="font-mono break-all">{file}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {commits.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-500">Commits</p>
              <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {commits.map((sha) => (
                  <li key={sha} className="inline-flex items-center gap-1 font-mono">
                    <GitCommitHorizontal className="w-3 h-3 text-gray-500" aria-hidden="true" />
                    {sha.slice(0, 7)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tools.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-500">Tools used</p>
              <p className="mt-0.5 break-words">{tools.join(' · ')}</p>
            </div>
          )}
        </div>
      )}
    </EntityRow>
  )
}
