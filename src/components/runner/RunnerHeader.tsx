/**
 * RunnerHeader — uses the design system <PageHeader> with breadcrumb, status badge, and actions.
 *
 * Actions: Cancel Run (while running), Retry Run (when failed/budget_exceeded).
 */

import { useMemo } from 'react'
import { ClipboardList, Rocket, RotateCcw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { CancelButton } from './CancelButton'
import { runStatusConfig } from './shared'
import type { RunSnapshot } from '@/services/runner'

export interface RunnerHeaderProps {
  planId: string
  planTitle: string
  wsSlug: string
  workspacePath: (slug: string, path: string) => string
  effectiveSnapshot: RunSnapshot
  isRunning: boolean
  /** Called when user clicks "Retry Run" on a failed/budget_exceeded run */
  onRetryRun?: () => void
  retrying?: boolean
}

export function RunnerHeader({
  planId,
  planTitle,
  wsSlug,
  workspacePath: wpFn,
  effectiveSnapshot,
  isRunning,
  onRetryRun,
  retrying = false,
}: RunnerHeaderProps) {
  const statusStr = effectiveSnapshot.status ?? (effectiveSnapshot.running ? 'running' : 'completed')
  const statusCfg = runStatusConfig[statusStr] ?? runStatusConfig.running

  const statusBadge = useMemo(() => (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${isRunning ? 'animate-pulse' : ''}`} />
      {statusCfg.label}
    </span>
  ), [statusCfg, isRunning])

  const canRetry = !isRunning && (statusStr === 'failed' || statusStr === 'budget_exceeded' || statusStr === 'cancelled')

  const actions = useMemo(() => (
    <div className="flex items-center gap-2">
      {isRunning && <CancelButton planId={planId} isRunning={isRunning} />}
      {canRetry && onRetryRun && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetryRun}
          disabled={retrying}
        >
          {statusStr === 'budget_exceeded' ? (
            <Rocket className="w-3.5 h-3.5" />
          ) : (
            <RotateCcw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
          )}
          {retrying ? 'Retrying...' : statusStr === 'budget_exceeded' ? 'Relaunch' : 'Retry Run'}
        </Button>
      )}
    </div>
  ), [isRunning, planId, canRetry, onRetryRun, retrying, statusStr])

  const parentLinks = useMemo(() => [
    {
      icon: ClipboardList,
      label: 'Plan',
      name: planTitle,
      href: wpFn(wsSlug, `/plans/${planId}`),
    },
  ], [planId, planTitle, wpFn, wsSlug])

  return (
    <PageHeader
      title="Runner Dashboard"
      parentLinks={parentLinks}
      status={statusBadge}
      actions={actions}
    />
  )
}
