/**
 * StatsRow — two-level stats display for the runner dashboard.
 *
 * Primary row: status badge, progress bar, elapsed time
 * Secondary row: budget (inline-editable), agents count, wave progress
 *
 * ~190 lines — within the 200-line target.
 */

import { useState, useCallback, useMemo } from 'react'
import {
  Clock,
  DollarSign,
  Layers,
  Users,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Check,
  X,
  Loader2,
} from 'lucide-react'
import { ProgressBar } from '@/components/ui'
import { formatElapsed, formatCost } from './shared'
import type { RunSnapshot, ActiveAgentSnapshot } from '@/services/runner'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StatsRowProps {
  effectiveSnapshot: RunSnapshot
  isRunning: boolean
  resolvedAgents: ActiveAgentSnapshot[]
  wavesTotal: number | null
  planId: string
  onBudgetSave: (planId: string, value: number) => Promise<void>
}

// ---------------------------------------------------------------------------
// BudgetDisplay — inline editing sub-component
// ---------------------------------------------------------------------------

function BudgetDisplay({
  costUsd,
  maxCostUsd,
  isRunning,
  onSave,
}: {
  costUsd: number
  maxCostUsd: number
  isRunning: boolean
  onSave: (value: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  const handleEdit = useCallback(() => {
    setInput(String(maxCostUsd))
    setEditing(true)
  }, [maxCostUsd])

  const handleSave = useCallback(async () => {
    const value = parseFloat(input)
    if (isNaN(value) || value <= 0) return
    setSaving(true)
    try {
      await onSave(value)
      setEditing(false)
    } catch {
      // silently fail — polling will show the real value
    } finally {
      setSaving(false)
    }
  }, [input, onSave])

  const handleCancel = useCallback(() => setEditing(false), [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave()
      if (e.key === 'Escape') handleCancel()
    },
    [handleSave, handleCancel],
  )

  return (
    <div className="flex items-center gap-2 text-sm">
      <DollarSign className="w-4 h-4 text-gray-500 shrink-0" />
      <span className="font-mono tabular-nums text-gray-300">{formatCost(costUsd)}</span>

      {maxCostUsd > 0 && (
        <>
          <span className="text-gray-600">/</span>
          {editing ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min={1}
                max={500}
                step={5}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-16 px-1.5 py-0.5 bg-white/[0.06] border border-indigo-500/50 rounded text-sm text-gray-200 font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-0.5 text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleCancel}
                className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ) : (
            <button
              onClick={isRunning ? handleEdit : undefined}
              className={`group inline-flex items-center gap-1 font-mono tabular-nums ${
                isRunning ? 'hover:text-indigo-400 transition-colors cursor-pointer' : ''
              }`}
              title={isRunning ? 'Click to edit budget' : undefined}
              disabled={!isRunning}
            >
              <span className="text-gray-400">{formatCost(maxCostUsd)}</span>
              {isRunning && (
                <Pencil className="w-3 h-3 text-gray-600 group-hover:text-indigo-400 transition-colors" />
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatsRow
// ---------------------------------------------------------------------------

export function StatsRow({
  effectiveSnapshot,
  isRunning,
  resolvedAgents,
  wavesTotal,
  planId,
  onBudgetSave,
}: StatsRowProps) {
  const progressPercent = Math.round(effectiveSnapshot.progress_pct ?? 0)
  const failedCount = useMemo(
    () => resolvedAgents.filter((a) => a.status === 'failed').length,
    [resolvedAgents],
  )

  const handleBudgetSave = useCallback(
    (value: number) => onBudgetSave(planId, value),
    [onBudgetSave, planId],
  )

  return (
    <div className="space-y-3">
      {/* Primary row: progress + tasks + elapsed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            <span className="font-medium">
              {effectiveSnapshot.tasks_completed ?? 0} / {effectiveSnapshot.tasks_total ?? 0} tasks
            </span>
            <span className="text-gray-500 ml-1">({progressPercent}%)</span>
          </div>
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span>{failedCount} failed</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-gray-400 ml-auto">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatElapsed(effectiveSnapshot.elapsed_secs)}</span>
          </div>
        </div>
        <ProgressBar value={progressPercent} />
      </div>

      {/* Secondary row: budget, agents, waves */}
      <div className="flex flex-wrap items-center gap-6 text-sm text-gray-400">
        <BudgetDisplay
          costUsd={effectiveSnapshot.cost_usd}
          maxCostUsd={effectiveSnapshot.max_cost_usd}
          isRunning={isRunning}
          onSave={handleBudgetSave}
        />
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-gray-500" />
          <span>{resolvedAgents.length} agent{resolvedAgents.length !== 1 ? 's' : ''}</span>
        </div>
        {effectiveSnapshot.current_wave != null && (
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-gray-500" />
            <span>Wave {(effectiveSnapshot.current_wave ?? 0) + 1}{wavesTotal ? ` / ${wavesTotal}` : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}
