import { List, Columns3 } from 'lucide-react'
import { focusRing, pressFeedback } from './classes'

export type ViewMode = 'list' | 'kanban'

interface ViewToggleProps {
  value: ViewMode
  onChange: (view: ViewMode) => void
  className?: string
}

/**
 * Icon-only list / board switch for the `FilterBar.trailing` slot (fits a
 * 375px phone next to the search). 36px targets, labelled buttons.
 */
export function ViewToggle({ value, onChange, className = '' }: ViewToggleProps) {
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
