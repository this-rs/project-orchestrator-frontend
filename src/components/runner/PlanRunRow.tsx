/**
 * PlanRunRow — one plan run (pipeline execution) as an EntityRow. Shared by
 * the Pipelines page and PlanRunHistory (plan / milestone detail pages).
 *
 *   ● Plan title ···························· 3h  ›
 *     Running · 3/8 tasks · 1 failed · 12m · $1.20 · 2 agents · Chat · ⎇ feat/x
 *     ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮        (thin live progress while running)
 */

import { GitBranch } from 'lucide-react'
import { EntityRow, RelativeTime, StatusDot, formatDurationMs, pluralize } from '@/components/ui'
import type { PlanRun } from '@/services/runner'
import { LiveProgress } from './LiveProgress'
import { ToneText } from './ToneText'
import { formatCost, planRunElapsedSecs, planRunTriggerLabel, runStateMeta } from './shared'

interface PlanRunRowProps {
  run: PlanRun
  /** Row title — the plan title, or a run label when the plan is implicit. */
  title: string
  /** Link target (the runner dashboard of the plan). */
  href: string
}

export function PlanRunRow({ run, title, href }: PlanRunRowProps) {
  const meta = runStateMeta(run.status)
  const running = run.status === 'running'
  const done = run.completed_tasks.length
  const failed = run.failed_tasks.length
  const agents = run.active_agents?.length ?? 0
  const elapsed = planRunElapsedSecs(run)

  return (
    <EntityRow
      title={title}
      href={href}
      muted={run.status === 'cancelled'}
      leading={<StatusDot tone={meta.tone} pulse={meta.live} label={meta.label} />}
      trailing={<RelativeTime date={run.started_at} />}
      meta={[
        <ToneText key="s" meta={{ ...meta, live: false }} />,
        <span key="t" className="tabular-nums">{done}/{run.total_tasks} tasks</span>,
        failed > 0 ? <span key="f" className="text-red-400">{failed} failed</span> : null,
        <span key="d" className="tabular-nums">{formatDurationMs(elapsed * 1000)}</span>,
        <span key="c" className="font-mono tabular-nums">{formatCost(run.cost_usd)}</span>,
        running && agents > 0 ? pluralize(agents, 'agent') : null,
        planRunTriggerLabel(run.triggered_by),
        run.git_branch ? (
          <span key="b" className="inline-flex items-center gap-1 min-w-0 font-mono" title={run.git_branch}>
            <GitBranch className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[10rem] sm:max-w-[16rem]">{run.git_branch}</span>
          </span>
        ) : null,
      ]}
      context={
        running && run.total_tasks > 0 ? (
          <LiveProgress done={done} failed={failed} total={run.total_tasks} label={`${title} progress`} className="max-w-md" />
        ) : undefined
      }
      chevron
    />
  )
}
