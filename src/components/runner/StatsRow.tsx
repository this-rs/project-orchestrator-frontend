/**
 * StatsRow — key numbers of a runner run, in design-system form:
 *
 *   3/8 tasks · 37% · 1 failed · 04:12          (MetaLine)
 *   ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮      (LiveProgress, updates in place)
 *   Budget  $1.23 / $10.00  Edit budget          (Facts, 1 column on phones,
 *   Agents  3 · 2 running                         3 columns from `sm`)
 *   Wave    2 / 3
 *
 * Used by the runner dashboard and embedded in PlanDetailPage — the props
 * are the public contract, keep them stable.
 */

import { useCallback, useMemo } from 'react'
import { Facts, MetaLine } from '@/components/ui'
import { BudgetEditor } from './BudgetEditor'
import { LiveProgress } from './LiveProgress'
import { formatElapsed } from './shared'
import type { RunSnapshot, ActiveAgentSnapshot } from '@/services/runner'

export interface StatsRowProps {
  effectiveSnapshot: RunSnapshot
  isRunning: boolean
  resolvedAgents: ActiveAgentSnapshot[]
  wavesTotal: number | null
  planId: string
  onBudgetSave: (planId: string, value: number) => Promise<void>
}

const LIVE = new Set(['spawning', 'running', 'verifying'])

export function StatsRow({ effectiveSnapshot, isRunning, resolvedAgents, wavesTotal, planId, onBudgetSave }: StatsRowProps) {
  const done = effectiveSnapshot.tasks_completed ?? 0
  const total = effectiveSnapshot.tasks_total ?? 0
  const pct = Math.round(effectiveSnapshot.progress_pct ?? 0)
  const currentWave = effectiveSnapshot.current_wave != null ? effectiveSnapshot.current_wave + 1 : null

  const { failed, live } = useMemo(
    () => ({
      failed: resolvedAgents.filter((a) => a.status === 'failed').length,
      live: resolvedAgents.filter((a) => LIVE.has(a.status)).length,
    }),
    [resolvedAgents],
  )

  const handleBudgetSave = useCallback((value: number) => onBudgetSave(planId, value), [onBudgetSave, planId])

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <MetaLine
          size="sm"
          items={[
            <span key="t" className="tabular-nums text-gray-300">
              {done}/{total} tasks
            </span>,
            <span key="p" className="tabular-nums">{pct}%</span>,
            failed > 0 ? <span key="f" className="text-red-400">{failed} failed</span> : null,
            <span key="e" className="font-mono tabular-nums">{formatElapsed(effectiveSnapshot.elapsed_secs)}</span>,
          ]}
        />
        <LiveProgress done={done} failed={Math.min(failed, Math.max(0, total - done))} total={total} label="Run progress" />
      </div>

      <Facts
        columns={3}
        items={[
          {
            label: 'Budget',
            value: <BudgetEditor costUsd={effectiveSnapshot.cost_usd} maxCostUsd={effectiveSnapshot.max_cost_usd} onSave={handleBudgetSave} />,
          },
          {
            label: 'Agents',
            value: (
              <span className="tabular-nums">
                {resolvedAgents.length}
                {isRunning && live > 0 && <span className="text-indigo-300"> · {live} running</span>}
              </span>
            ),
          },
          {
            label: 'Wave',
            value: currentWave != null ? <span className="tabular-nums">{currentWave}{wavesTotal ? ` / ${wavesTotal}` : ''}</span> : '—',
          },
        ]}
      />
    </div>
  )
}
