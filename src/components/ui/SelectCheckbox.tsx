import { Check } from 'lucide-react'

interface SelectZoneProps {
  selected: boolean
  onToggle: (shiftKey: boolean) => void
}

export function SelectZone({ selected, onToggle }: SelectZoneProps) {
  return (
    <div
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle(e.shiftKey)
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
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        )}
      </div>
    </div>
  )
}

// Keep backward-compatible export name
export const SelectCheckbox = SelectZone
