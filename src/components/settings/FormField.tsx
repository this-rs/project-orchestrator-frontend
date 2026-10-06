import type { ReactNode } from 'react'

/**
 * One field of the provider forms, always the same shape:
 *
 * ```
 * Label                      (text-sm, gray-300, above)
 * [control, full width of its grid column]
 * help or error              (text-xs, under the control)
 * ```
 *
 * The label class is the one the kit `Input` / `Select` use for their own
 * label, so a `Select` with its `label` prop lines up with these.
 */
export const FIELD_LABEL = 'block text-sm font-medium text-gray-300 mb-1'

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
export function FieldNote({ id, help, error }: { id: string; help?: ReactNode; error?: string | null }) {
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
