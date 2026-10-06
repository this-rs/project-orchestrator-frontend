import type { ReactNode, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Field primitives of the provider settings, one shape everywhere:
 *
 * ```
 * Label                      (text-sm, gray-300, above)
 * [control, full width of its grid column]
 * help or error              (text-xs, under the control)
 * ```
 *
 * The label class is the one the kit `Input` / `Select` use for their own
 * label, and `NativeSelect` has the box of the kit `Input`, so every control
 * of the page lines up.
 */
export const FIELD_LABEL = 'block text-sm font-medium text-gray-300 mb-1'

/** The box of the kit `Input`, for a native `<select>`. */
const CONTROL =
  'w-full appearance-none rounded-lg border border-border-default bg-surface-base py-2 pl-3 pr-9 text-base text-gray-100 input-focus-glow focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'

interface FormFieldProps {
  /** Id of the control: the label points at it. */
  id: string
  label: ReactNode
  help?: ReactNode
  error?: string | null
  className?: string
  children: ReactNode
}

export function FormField({ id, label, help, error, className = '', children }: FormFieldProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      {children}
      <FieldNote id={id} help={help} error={error} />
    </div>
  )
}

/** The help or error line under a control (also under a kit `Select`, which carries its own label). */
export function FieldNote({
  id,
  help,
  error,
}: {
  id: string
  help?: ReactNode
  error?: string | null
}) {
  if (error) {
    return (
      <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-400">
        {error}
      </p>
    )
  }
  if (help) {
    return (
      <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
        {help}
      </p>
    )
  }
  return null
}

/**
 * A native `<select>` drawn like the kit `Input` (a real `<label for>`, option
 * groups and disabled options, which the kit `Select` popover does not have).
 */
export function NativeSelect({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <select className={CONTROL} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
        aria-hidden="true"
      />
    </div>
  )
}

/** One choice of a radio group, as a row: label + one muted line. */
export function ChoiceRow({
  name,
  value,
  checked,
  disabled,
  onChange,
  title,
  description,
}: {
  name: string
  value: string
  checked: boolean
  disabled?: boolean
  onChange: (value: string) => void
  title: ReactNode
  description: ReactNode
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 focus-within:ring-1 focus-within:ring-indigo-500/60 ${
        checked
          ? 'border-indigo-500/60 bg-indigo-500/[0.06]'
          : 'border-white/[0.06] bg-white/[0.02]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-white/[0.12]'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-1 h-4 w-4 shrink-0 accent-indigo-500 focus:outline-none"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-100">{title}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
      </span>
    </label>
  )
}
