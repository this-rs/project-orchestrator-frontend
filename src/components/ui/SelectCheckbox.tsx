interface SelectZoneProps {
  selected: boolean
  onToggle: () => void
}

export function SelectZone({ selected, onToggle }: SelectZoneProps) {
  return (
    <div
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      className={`
        flex items-center justify-center w-9 shrink-0 cursor-pointer
        transition-colors duration-150 rounded-l-xl
        ${selected ? 'bg-indigo-500/20' : 'hover:bg-white/[0.06]'}
      `}
    >
      <div
        className={`
          w-5 h-5 rounded-full flex items-center justify-center
          transition-all duration-150 border-2
          ${selected
            ? 'border-indigo-500 bg-indigo-500'
            : 'border-white/[0.08] hover:border-white/20'
          }
        `}
      >
        {selected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </div>
  )
}

// Keep backward-compatible export name
export const SelectCheckbox = SelectZone
