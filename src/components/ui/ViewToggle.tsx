import { List, Columns3 } from 'lucide-react'

interface ViewToggleProps {
  value: 'list' | 'kanban'
  onChange: (view: 'list' | 'kanban') => void
  className?: string
}

export function ViewToggle({ value, onChange, className = '' }: ViewToggleProps) {
  return (
    <div className={`inline-flex rounded-lg bg-surface-raised p-0.5 ${className}`} role="group">
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          value === 'list'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        {/* List icon */}
        <List className="w-4 h-4" />
        List
      </button>
      <button
        type="button"
        onClick={() => onChange('kanban')}
        aria-pressed={value === 'kanban'}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          value === 'kanban'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        {/* Kanban/columns icon */}
        <Columns3 className="w-4 h-4" />
        Board
      </button>
    </div>
  )
}
