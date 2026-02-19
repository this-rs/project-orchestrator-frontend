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
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
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
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16M15 4v16M3 8h18M3 16h18" />
        </svg>
        Board
      </button>
    </div>
  )
}
