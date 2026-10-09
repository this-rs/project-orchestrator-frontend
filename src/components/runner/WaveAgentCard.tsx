/**
 * WaveAgentCard — one assistant (= one task) inside a wave, as an EntityRow.
 *
 *   ● Task title ·························· 02:14  [⋯]
 *     Running · $0.12 · 3 files · 1 commit
 *     [Conversation] [Retry task] [Details]      (visible buttons that wrap)
 *     files · commits · tools                      (when expanded)
 *
 * Mobile / tablet guarantees (covered by __tests__/WaveAgentCard.test.tsx):
 * the text column is `min-w-0` + `break-words` so nothing widens the row,
 * the button row is `flex-wrap`, and every button is `min-w-0` with a
 * compact, truncating label. Must be rendered inside an EntityList (<li>).
 */

import { useState, useMemo } from 'react'
import { Eye, EyeOff, FileCode2, GitCommitHorizontal, List, RotateCcw, SquareArrowOutUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, EntityRow, StatusDot, ToneText, pluralize } from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { ActiveAgentSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'
import { formatElapsed, agentStateMeta, runCost } from './shared'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { hasExecutionRouting } from '@/constants/runProviders'
import { ExecutionModel } from './ExecutionModel'
import { formatUsd2, hasCost } from '@/utils/cost'

export interface WaveAgentCardProps {
  agent: ActiveAgentSnapshot
  execution?: AgentExecution
  isSelected: boolean
  onToggleConversation: (sessionId: string, taskTitle: string) => void
  onRetryTask?: (taskId: string, taskTitle: string) => void
  /** Task currently being retried (disables the button). */
  retrying?: boolean
}

// Buttons repeated on every row are flat (no blur) — DESIGN.md § 9 « flat ».
const compactButton = 'min-w-0 max-w-full gap-1.5 text-xs'

export function WaveAgentCard({ agent, execution, isSelected, onToggleConversation, onRetryTask, retrying }: WaveAgentCardProps) {
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const meta = agentStateMeta(agent.status)
  const cost = runCost(agent)
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
      entityRef={{ kind: 'task', id: agent.task_id, label: agent.task_title }}
      selected={isSelected}
      leading={<StatusDot tone={meta.tone} pulse={meta.live} label={meta.label} />}
      trailing={<span className="font-mono">{formatElapsed(agent.elapsed_secs)}</span>}
      meta={[
        <ToneText key="s" tone={meta.tone} dot={false} label={meta.label} />,
        // A task no agent ran has no cost to show — never `$0.00`.
        hasCost(cost, { format: formatUsd2 }) ? (
          <CostDisplay key="c" cost={cost} format={formatUsd2} className="font-mono tabular-nums" />
        ) : null,
        execution && hasExecutionRouting(execution) ? <ExecutionModel key="m" execution={execution} compact /> : null,
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
        <div data-testid="agent-actions" className="flex flex-wrap items-center gap-2 min-w-0">
          {agent.session_id && (
            <Button
              size="sm"
              variant={isSelected ? 'secondary' : 'ghost'}
              onClick={() => onToggleConversation(agent.session_id!, agent.task_title)}
              aria-pressed={isSelected}
              aria-label={isSelected ? `Hide conversation for ${agent.task_title}` : `View conversation for ${agent.task_title}`}
              flat
              className={compactButton}
            >
              {isSelected ? <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">{isSelected ? 'Hide' : 'Conversation'}</span>
            </Button>
          )}
          {canRetry && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRetryTask!(agent.task_id, agent.task_title)}
              loading={retrying}
              flat
              className={compactButton}
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
              flat
              className={`${compactButton} text-gray-400`}
            >
              <List className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{detailOpen ? 'Hide details' : 'Details'}</span>
            </Button>
          )}
        </div>
      )}
      {detailOpen && hasDetails && (
        <div className="mt-2 space-y-2 text-xs text-gray-400 min-w-0">
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
