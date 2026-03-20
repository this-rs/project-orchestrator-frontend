/**
 * RunnerHeader — uses the design system <PageHeader> with breadcrumb, status badge, and actions.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Rocket } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
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
}

export function RunnerHeader({
  planId,
  planTitle,
  wsSlug,
  workspacePath: wpFn,
  effectiveSnapshot,
  isRunning,
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

  const actions = useMemo(() => (
    <div className="flex items-center gap-2">
      {isRunning && <CancelButton planId={planId} isRunning={isRunning} />}
      {effectiveSnapshot.status === 'budget_exceeded' && !isRunning && (
        <Link
          to={wpFn(wsSlug, `/plans/${planId}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          <Rocket className="w-3.5 h-3.5" />
          Relaunch with higher budget
        </Link>
      )}
    </div>
  ), [isRunning, planId, effectiveSnapshot.status, wpFn, wsSlug])

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
