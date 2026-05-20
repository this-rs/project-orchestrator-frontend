/**
 * Shared primitives for activity RunCards.
 *
 * These helpers are used by `PlanRunCard`, `ProtocolRunCard`, and
 * `ChatSessionCard` to render a consistent compact tile (320x180 target):
 * status colors, elapsed-time chip, cost chip, type icon, etc.
 */

import { useElapsedTime } from '@/hooks/useElapsedTime'
import type {
  ActivityStatusFilter,
} from '@/atoms'

/** Tailwind classes for a status badge — shared across the three card types. */
export const STATUS_CLASSES: Record<
  string,
  { dot: string; bg: string; text: string; label: string }
> = {
  running:           { dot: 'bg-blue-400 animate-pulse', bg: 'bg-blue-500/15',   text: 'text-blue-300',   label: 'Running' },
  completed:         { dot: 'bg-green-400',              bg: 'bg-green-500/15',  text: 'text-green-300',  label: 'Completed' },
  completed_with_errors: { dot: 'bg-amber-400',          bg: 'bg-amber-500/15',  text: 'text-amber-300',  label: 'Completed w/ errors' },
  failed:            { dot: 'bg-red-400',                bg: 'bg-red-500/15',    text: 'text-red-300',    label: 'Failed' },
  cancelled:         { dot: 'bg-gray-400',               bg: 'bg-gray-500/15',   text: 'text-gray-300',   label: 'Cancelled' },
  budget_exceeded:   { dot: 'bg-amber-400',              bg: 'bg-amber-500/15',  text: 'text-amber-300',  label: 'Budget exceeded' },
  idle:              { dot: 'bg-gray-500',               bg: 'bg-white/[0.05]',  text: 'text-gray-300',   label: 'Idle' },
}

export function statusToFilter(status: string): ActivityStatusFilter | null {
  if (
    status === 'running' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'budget_exceeded'
  ) {
    return status
  }
  return null
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CLASSES[status] ?? STATUS_CLASSES.idle
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Elapsed time chip — ticks every second while running.
// ---------------------------------------------------------------------------

interface ElapsedChipProps {
  startedAt?: string
  isRunning: boolean
  finalSecs?: number
}

export function ElapsedChip({ startedAt, isRunning, finalSecs }: ElapsedChipProps) {
  // useElapsedTime requires a startedAt string — fall back to "now" so the
  // hook never crashes when an event arrives without a start time.
  const elapsed = useElapsedTime(startedAt ?? new Date().toISOString(), isRunning, finalSecs)
  return <span className="font-mono tabular-nums text-[11px] text-gray-400">{elapsed}</span>
}

// ---------------------------------------------------------------------------
// Cost chip
// ---------------------------------------------------------------------------

export function CostChip({ usd }: { usd?: number }) {
  if (usd == null || usd <= 0) return null
  return (
    <span className="font-mono tabular-nums text-[11px] text-gray-400">
      ${usd.toFixed(2)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Card frame — common shell so every card looks alike.
// ---------------------------------------------------------------------------

export interface CardFrameProps {
  onClick?: () => void
  /** Accent color for the top border / glow. */
  accent?: 'indigo' | 'purple' | 'emerald'
  children: React.ReactNode
  className?: string
  /** Aria role/label for clickable cards. */
  ariaLabel?: string
}

export function CardFrame({ onClick, accent = 'indigo', children, className = '', ariaLabel }: CardFrameProps) {
  const accentBorder = {
    indigo:  'border-indigo-500/30 hover:border-indigo-500/60',
    purple:  'border-purple-500/30 hover:border-purple-500/60',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/60',
  }[accent]

  const accentStripe = {
    indigo:  'bg-indigo-500/50',
    purple:  'bg-purple-500/50',
    emerald: 'bg-emerald-500/50',
  }[accent]

  // Compact 320x180 target — use min-height so DAG/FSM content can push
  // slightly without overflowing the grid item.
  const baseClasses = `
    relative flex flex-col bg-surface-raised border ${accentBorder}
    rounded-lg overflow-hidden transition-all duration-200
    min-h-[180px]
    ${onClick ? 'cursor-pointer hover:bg-white/[0.02]' : ''}
    ${className}
  `

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`${baseClasses} text-left`}
      >
        <div className={`h-0.5 ${accentStripe}`} />
        {children}
      </button>
    )
  }

  return (
    <div className={baseClasses}>
      <div className={`h-0.5 ${accentStripe}`} />
      {children}
    </div>
  )
}
