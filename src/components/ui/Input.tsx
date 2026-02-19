import { InputHTMLAttributes, forwardRef } from 'react'
import { Search } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-3 py-2 bg-surface-base border border-border-default rounded-lg
            text-gray-100 placeholder-gray-500 input-focus-glow
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500' : ''}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export function SearchInput({ className = '', ...props }: InputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
      <Input className="pl-10" placeholder="Search..." {...props} />
    </div>
  )
}
