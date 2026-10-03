import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white btn-glow-primary',
  secondary: 'bg-white/[0.06] hover:bg-white/[0.1] text-gray-100 border border-white/[0.06]',
  danger: 'bg-red-600 hover:bg-red-500 text-white btn-glow-danger',
  ghost: 'hover:bg-white/[0.06] text-gray-300',
}

const sizeStyles: Record<ButtonSize, string> = {
  // `min-h-9`: the 36px tap target of DESIGN.md §10, stated instead of left to padding + line height.
  sm: 'min-h-9 px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

// Feedback motion (DESIGN.md § Mouvement): explicit properties, 120ms.
// The `!` is required: `.input-focus-glow` / `.btn-glow-*` (index.css) are
// unlayered and set the `transition` shorthand, which otherwise beats every
// Tailwind utility (layered) — `transition-all` here used to be dead code.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-medium rounded-lg
          focus:outline-none input-focus-glow
          transition-[scale,background-color,color,border-color,box-shadow]! duration-(--motion-feedback)! ease-out!
          active:scale-[0.97] motion-reduce:active:scale-100
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {loading && (
          <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
