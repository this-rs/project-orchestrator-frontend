import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { glassButton, glassFlat } from './classes'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /**
   * No backdrop blur (`.btn-flat`): for dense rows and lists — a row action in
   * `EntityRow.primaryAction`, a button repeated on every item. The glass recipe
   * must never put more than about ten blurs on screen at once.
   */
  flat?: boolean
}

const sizeStyles: Record<ButtonSize, string> = {
  // `min-h-9`: the 36px tap target of DESIGN.md §10, stated instead of left to padding + line height.
  sm: 'min-h-9 px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

/**
 * The product's button. The glass material lives in styles/buttons.css (`.btn`,
 * `.btn-primary`…, in `@layer components`: utilities passed in `className`
 * win). Hover, press (120 ms), focus ring, disabled and reduced-motion /
 * forced-colors / no-backdrop-filter fallbacks all come from that recipe.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, flat, disabled, className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`${glassButton[variant]} ${flat ? glassFlat : ''} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && (
          <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
