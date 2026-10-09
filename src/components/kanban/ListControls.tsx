/**
 * Filter inputs shared by the task, plan and milestone pages (text / number
 * fields styled like the FilterBar search, 16px on phones). List controls
 * (`ViewToggle`, `RowCheckbox`, `ProgressLine`) live in `@/components/ui`.
 */
import type { ReactNode } from 'react'
import { useT } from '@/i18n'

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
  const { t } = useT()
  const parse = (v: string) => (v === '' ? undefined : Number(v))
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <FilterField type="number" label={t('kanban.filters.minPriority')} placeholder={t('kanban.filters.priorityMin')} value={min} onChange={(v) => onMinChange(parse(v))} />
      <span className="text-gray-600 text-xs" aria-hidden="true">
        –
      </span>
      <FilterField type="number" label={t('kanban.filters.maxPriority')} placeholder={t('kanban.filters.priorityMax')} value={max} onChange={(v) => onMaxChange(parse(v))} />
    </div>
  )
}
