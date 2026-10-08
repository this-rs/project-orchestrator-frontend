import { Input } from '@/components/ui'

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
  /** One line under the input (what the value is for, or « leave blank to keep it »). */
  hint?: string
  disabled?: boolean
  mono?: boolean
}

/**
 * A labelled text field of the setup: the `Input` primitive (16 px on phones,
 * DESIGN.md § 10) plus the hint line the setup forms need. The three step
 * pages share this one instead of each styling their own `<input>`.
 */
export function Field({ label, value, onChange, placeholder, type = 'text', className = '', hint, disabled, mono }: FieldProps) {
  return (
    <div className={className}>
      <Input
        type={type}
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={mono ? 'font-mono' : ''}
      />
      {hint && <p className="mt-1 text-xs leading-4 text-gray-500">{hint}</p>}
    </div>
  )
}
