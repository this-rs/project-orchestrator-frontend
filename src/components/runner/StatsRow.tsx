/**
 * StatsRow — two-level stats display for the runner dashboard.
 *
 * Primary row: progress bar + tasks completed + elapsed time
 * Secondary row: budget (inline-editable glass card), agents count, wave progress (StatCards)
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
  Pencil,
  Check,
  X,
  Loader2,
} from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
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
// BudgetCard — glassmorphic card with always-visible edit affordance
// ---------------------------------------------------------------------------

function BudgetCard({
  costUsd,
  maxCostUsd,
  onSave,
}: {
  costUsd: number
  maxCostUsd: number
  onSave: (value: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleEdit = useCallback(() => {
    setInput(String(maxCostUsd || Math.ceil(costUsd * 2) || 10))
    setEditing(true)
    setSaved(false)
  }, [maxCostUsd, costUsd])

  const handleSave = useCallback(async () => {
    const value = parseFloat(input)
    if (isNaN(value) || value <= 0) return
    setSaving(true)
    try {
      await onSave(value)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // polling will show real value
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
    <div
      className={`glass rounded-xl shadow-sm overflow-hidden border-t-2 border-yellow-500 group transition-colors ${
        !editing ? 'hover:bg-white/[0.03] cursor-pointer' : ''
      }`}
      onClick={!editing ? handleEdit : undefined}
      role={!editing ? 'button' : undefined}
      tabIndex={!editing ? 0 : undefined}
      onKeyDown={!editing ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleEdit() } : undefined}
      title={!editing ? 'Click to edit budget limit' : undefined}
    >
      <div className="p-4">
        <div className="flex items-center gap-1.5 text-gray-500 mb-2">
          <DollarSign className="w-4 h-4" />
          {!editing && (
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400" />
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-gray-300 font-mono tabular-nums text-sm">{formatCost(costUsd)} /</span>
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
            <button onClick={handleSave} disabled={saving} className="p-0.5 text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer" title="Save">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={handleCancel} className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer" title="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-bold text-gray-100" style={{ fontSize: 'var(--fluid-2xl)' }}>
              {formatCost(costUsd)}
            </span>
            {maxCostUsd > 0 && (
              <span className="text-sm text-gray-500 font-mono">/ {formatCost(maxCostUsd)}</span>
            )}
            {saved && <span className="text-xs text-green-400 animate-pulse ml-1">Saved!</span>}
          </div>
        )}
        <div className="text-sm text-gray-400 mt-0.5">
          Budget
          {!editing && <span className="text-xs text-gray-600 ml-1.5 group-hover:text-indigo-400/60 transition-colors">· click to edit</span>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatsRow
// ---------------------------------------------------------------------------

export function StatsRow({
  effectiveSnapshot,
  isRunning: _isRunning,
  resolvedAgents,
  wavesTotal,
  planId,
  onBudgetSave,
}: StatsRowProps) {
  const progressPercent = Math.round(effectiveSnapshot.progress_pct ?? 0)
  const completedTasks = effectiveSnapshot.tasks_completed ?? 0
  const totalTasks = effectiveSnapshot.tasks_total ?? 0
  const currentWave = (effectiveSnapshot.current_wave ?? 0) + 1

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
      {/* Primary: progress bar with task count and time */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            <span className="font-medium">{completedTasks} / {totalTasks} tasks</span>
            <span className="text-gray-500 ml-1">({progressPercent}%)</span>
            {failedCount > 0 && (
              <span className="text-red-400 ml-2">{failedCount} failed</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="font-mono tabular-nums">{formatElapsed(effectiveSnapshot.elapsed_secs)}</span>
          </div>
        </div>
        <ProgressBar value={progressPercent} />
      </div>

      {/* Secondary: stat cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BudgetCard
          costUsd={effectiveSnapshot.cost_usd}
          maxCostUsd={effectiveSnapshot.max_cost_usd}
          onSave={handleBudgetSave}
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Agents"
          value={resolvedAgents.length}
          accent="border-blue-500"
        />
        {effectiveSnapshot.current_wave != null ? (
          <StatCard
            icon={<Layers className="w-4 h-4" />}
            label={wavesTotal ? `Wave ${currentWave} / ${wavesTotal}` : `Wave ${currentWave}`}
            value={currentWave}
            accent="border-purple-500"
          />
        ) : (
          <StatCard
            icon={<Layers className="w-4 h-4" />}
            label="Waves"
            value={0}
            accent="border-purple-500"
          />
        )}
      </div>
    </div>
  )
}
