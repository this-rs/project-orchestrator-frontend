import { TextareaHTMLAttributes, forwardRef } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-3 py-2 bg-[#0f1117] border border-white/[0.1] rounded-lg
            text-gray-100 placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
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
