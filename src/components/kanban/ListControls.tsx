/**
 * Small list/board controls shared by the task, plan and milestone pages.
 *
 * They compose the design-system tokens (focus ring, feedback motion) for
 * needs the frozen `@/components/ui` primitives do not cover yet:
 * - `ViewModeToggle`: icon-only list/board switch that fits the FilterBar
 *   `trailing` slot on a 375px phone (the ui `ViewToggle` has text labels).
 * - `RowSelect`: accessible selection checkbox for `EntityRow.leading`
 *   (the ui `SelectZone` is a click-only div without role / keyboard support
 *   and a 20px-tall target).
 * - `MiniProgress`: static progress hairline (the ui `ProgressBar` animates
 *   its width on mount, which DESIGN.md "Mouvement" forbids on list data).
 * - `FilterField`: text / number input styled like the FilterBar search.
 */
import type { ReactNode } from 'react'
import { Check, Columns3, List } from 'lucide-react'
import { focusRing, pressFeedback } from '@/components/ui/classes'

// ── View toggle ─────────────────────────────────────────────────────────

export type ViewMode = 'list' | 'kanban'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  className?: string
}

export function ViewModeToggle({ value, onChange, className = '' }: ViewModeToggleProps) {
  const item = (mode: ViewMode, label: string, Icon: typeof List) => {
    const active = value === mode
    return (
      <button
        type="button"
        onClick={() => onChange(mode)}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={`w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center rounded-md ${pressFeedback} ${focusRing} ${
          active ? 'bg-white/[0.08] text-gray-100' : 'text-gray-500 hover:text-gray-200'
        }`}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
      </button>
    )
  }
  return (
    <div
      role="group"
      aria-label="View mode"
      className={`inline-flex items-center rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5 ${className}`}
    >
      {item('list', 'List view', List)}
      {item('kanban', 'Board view', Columns3)}
    </div>
  )
}

// ── Row selection ───────────────────────────────────────────────────────

interface RowSelectProps {
  selected: boolean
  onToggle: (shiftKey: boolean) => void
  /** Accessible name, e.g. `Select Auth flow`. */
  label: string
}

/**
 * Round checkbox for bulk selection. Visually 18px, tap target 36px
 * (negative margin keeps the row layout unchanged). Shift+click selects a range.
 */
export function RowSelect({ selected, onToggle, label }: RowSelectProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle(e.shiftKey)
      }}
      className={`-m-2 p-2 inline-flex items-center justify-center rounded-full ${focusRing}`}
    >
      <span
        className={`w-[18px] h-[18px] rounded-full border-[1.5px] inline-flex items-center justify-center transition-colors duration-[120ms] ${
          selected ? 'border-indigo-500 bg-indigo-500' : 'border-white/[0.15] hover:border-white/30'
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />}
      </span>
    </button>
  )
}

// ── Progress ────────────────────────────────────────────────────────────

interface MiniProgressProps {
  /** 0–100 */
  value: number
  label?: string
  className?: string
}

/** Static 4px progress bar (no mount animation). */
export function MiniProgress({ value, label, className = '' }: MiniProgressProps) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={`h-1 w-full rounded-full bg-white/[0.08] overflow-hidden ${className}`}
    >
      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400/80' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Filter input ────────────────────────────────────────────────────────

interface FilterFieldProps {
  label: string
  value: string | number | undefined
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  icon?: ReactNode
  className?: string
}

/** Text / number filter input matching the FilterBar search field (16px on phones). */
export function FilterField({ label, value, onChange, type = 'text', placeholder, className = '' }: FilterFieldProps) {
  return (
    <input
      type={type}
      inputMode={type === 'number' ? 'numeric' : undefined}
      aria-label={label}
      placeholder={placeholder ?? label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full min-w-0 h-9 px-2.5 text-base md:text-sm bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 focus:bg-white/[0.05] transition-colors ${className}`}
    />
  )
}

/** Priority range (min – max) on one line. */
export function PriorityRangeFields({
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  min: number | undefined
  max: number | undefined
  onMinChange: (v: number | undefined) => void
  onMaxChange: (v: number | undefined) => void
}) {
  const parse = (v: string) => (v === '' ? undefined : Number(v))
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <FilterField type="number" label="Minimum priority" placeholder="Priority min" value={min} onChange={(v) => onMinChange(parse(v))} />
      <span className="text-gray-600 text-xs" aria-hidden="true">
        –
      </span>
      <FilterField type="number" label="Maximum priority" placeholder="max" value={max} onChange={(v) => onMaxChange(parse(v))} />
    </div>
  )
}
