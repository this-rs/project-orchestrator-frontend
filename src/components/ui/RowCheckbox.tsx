import { Check } from 'lucide-react'
import { focusRing, pressFeedback } from './classes'

interface RowCheckboxProps {
  checked: boolean
  /** Receives `shiftKey` so callers can select a range. */
  onToggle: (shiftKey: boolean) => void
  /** Accessible name, e.g. `Select Auth flow`. */
  label: string
  className?: string
}

/**
 * Round checkbox for bulk selection in `EntityRow.leading`.
 * Visually 18px, tap target 36px (negative margin keeps the row layout
 * unchanged), keyboard operable, never triggers the row.
 */
export function RowCheckbox({ checked, onToggle, label, className = '' }: RowCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle(e.shiftKey)
      }}
      className={`-m-2 p-2 inline-flex items-center justify-center rounded-full ${pressFeedback} ${focusRing} ${className}`}
    >
      <span
        className={`w-[18px] h-[18px] rounded-full border-[1.5px] inline-flex items-center justify-center transition-colors duration-[120ms] ${
          checked ? 'border-indigo-500 bg-indigo-500' : 'border-white/[0.15] hover:border-white/30'
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />}
      </span>
    </button>
  )
}
