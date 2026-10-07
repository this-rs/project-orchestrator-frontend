import { TextareaHTMLAttributes, forwardRef, useId } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    // A label names its control: screen readers read it, a click on it focuses the field.
    const generatedId = useId()
    const controlId = id ?? generatedId
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={controlId} className="block text-sm font-medium text-gray-300 mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={controlId}
          className={`
            w-full px-3 py-2 bg-surface-base border border-border-default rounded-lg
            text-base md:text-sm text-gray-100 placeholder-gray-500 input-focus-glow
            disabled:opacity-50 disabled:cursor-not-allowed
            resize-vertical min-h-[80px]
            ${error ? 'border-red-500' : ''}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
