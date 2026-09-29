import { useId, type ReactNode } from 'react'
import { focusRing } from './classes'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Visible label (row layout: label left, switch right). */
  label?: ReactNode
  /** Accessible name when there is no visible label. */
  ariaLabel?: string
  icon?: ReactNode
  disabled?: boolean
  className?: string
}

/** Accessible on/off switch (role="switch"). With `label`, renders a full-width row. */
export function Switch({ checked, onChange, label, ariaLabel, icon, disabled, className = '' }: SwitchProps) {
  const labelId = useId()
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${focusRing} ${
        checked ? 'bg-indigo-500/70' : 'bg-white/[0.08]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  )
  if (!label) return control
  return (
    <div className={`flex items-center justify-between gap-2 min-h-9 ${className}`}>
      <span id={labelId} className="flex items-center gap-1.5 text-xs text-gray-400">
        {icon}
        {label}
      </span>
      {control}
    </div>
  )
}
