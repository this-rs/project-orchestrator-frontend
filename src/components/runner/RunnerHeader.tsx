/**
 * RunnerHeader — PageHeader of the runner dashboard.
 *
 *   Pipelines
 *   <Plan title>                                  [Cancel run | Retry run] [⋯]
 *   ● Running · 3/8 tasks · 1 failed · 04:12 · wave 2/3 · run 1a2b3c4d
 *
 * Cancel asks for confirmation (CancelButton). ⋯ → Open plan, Copy run ID.
 */

import { useNavigate } from 'react-router-dom'
import { ClipboardList, Copy, Rocket, RotateCcw } from 'lucide-react'
import { Button, PageHeader } from '@/components/ui'
import { useToast } from '@/hooks'
import { CancelButton } from './CancelButton'
import { formatElapsed, runStateMeta } from './shared'
import { ToneText } from './ToneText'
import type { RunSnapshot } from '@/services/runner'

export interface RunnerHeaderProps {
  planId: string
  planTitle: string
  wsSlug: string
  workspacePath: (slug: string, path: string) => string
  effectiveSnapshot: RunSnapshot
  isRunning: boolean
  /** Total number of waves (when known). */
  wavesTotal?: number | null
  /** Failed agents / tasks in this run. */
  failedCount?: number
  /** Called when user clicks "Retry Run" on a failed/budget_exceeded run */
  onRetryRun?: () => void
  retrying?: boolean
}

export function RunnerHeader({
  planId,
  planTitle,
  wsSlug,
  workspacePath: wpFn,
  effectiveSnapshot: snap,
  isRunning,
  wavesTotal,
  failedCount = 0,
  onRetryRun,
  retrying = false,
}: RunnerHeaderProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const statusStr = snap.status ?? (snap.running ? 'running' : 'completed')
  const meta = runStateMeta(statusStr)
  const canRetry = !isRunning && (statusStr === 'failed' || statusStr === 'budget_exceeded' || statusStr === 'cancelled')
  const wave = snap.current_wave != null ? snap.current_wave + 1 : null

  return (
    <PageHeader
      title={planTitle}
      parentLinks={[{ icon: Rocket, label: 'Pipelines', name: 'Pipelines', href: wpFn(wsSlug, '/pipelines') }]}
      status={<ToneText meta={{ ...meta, live: meta.live && isRunning }} />}
      meta={[
        <span key="t" className="tabular-nums">
          {snap.tasks_completed ?? 0}/{snap.tasks_total ?? 0} tasks
        </span>,
        failedCount > 0 ? <span key="f" className="text-red-400">{failedCount} failed</span> : null,
        <span key="e" className="font-mono tabular-nums">{formatElapsed(snap.elapsed_secs)}</span>,
        wave != null ? <span key="w" className="tabular-nums">wave {wave}{wavesTotal ? `/${wavesTotal}` : ''}</span> : null,
        snap.run_id ? <span key="id" className="font-mono text-gray-600">run {snap.run_id.slice(0, 8)}</span> : null,
      ]}
      actions={
        isRunning ? (
          <CancelButton planId={planId} isRunning={isRunning} />
        ) : canRetry && onRetryRun ? (
          <Button variant="secondary" size="sm" onClick={onRetryRun} loading={retrying} className="gap-1.5">
            {!retrying &&
              (statusStr === 'budget_exceeded' ? (
                <Rocket className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              ))}
            {statusStr === 'budget_exceeded' ? 'Relaunch' : 'Retry run'}
          </Button>
        ) : undefined
      }
      overflowActions={[
        { label: 'Open plan', icon: ClipboardList, onClick: () => navigate(wpFn(wsSlug, `/plans/${planId}`)) },
        {
          label: 'Copy run ID',
          icon: Copy,
          hidden: !snap.run_id,
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(snap.run_id ?? '')
              toast.success('Run ID copied')
            } catch {
              toast.error('Failed to copy to clipboard')
            }
          },
        },
      ]}
    />
  )
}
