import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TONE_CLASSES, TONE_ICONS, surface, type StatusTone } from '@/components/ui'

interface StatusBannerProps {
  /** The state this banner reports; it chooses the glyph and the colour (DESIGN.md § 4: dot + text, never a filled pill). */
  tone: Extract<StatusTone, 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger'>
  /** One line that says the state in words — the tests of the Docker banner read it as-is. */
  title: string
  /** Replaces the tone glyph (a spinner while something is being checked). */
  icon?: LucideIcon | ReactNode
  /** Why, and what to do — one or two short sentences. */
  children?: ReactNode
  /** The action(s) that follow from the state: `<Button variant="secondary" size="sm">`, never a second primary. */
  action?: ReactNode
  /** `alert` for a state that blocks the person, `status` for a change they should notice. */
  role?: 'alert' | 'status'
  className?: string
}

/**
 * A state the setup has to report (Docker found or not, a model to download, a
 * test that failed): a `surface` with a 3 px rail, the tone glyph and the state
 * in words. Composed here because the setup is the one place that reports
 * machine states outside a list; the recipe is EntityRow's rail + ToneText.
 * Colour is never the only cue: the glyph and the title carry the state.
 */
export function StatusBanner({ tone, title, icon, children, action, role, className = '' }: StatusBannerProps) {
  const Glyph = TONE_ICONS[tone]
  const text = TONE_CLASSES[tone].text
  const iconNode =
    icon === undefined ? (
      <Glyph className={`mt-0.5 h-5 w-5 shrink-0 ${text}`} aria-hidden="true" />
    ) : typeof icon === 'function' ? (
      (() => {
        const Custom = icon as LucideIcon
        return <Custom className={`mt-0.5 h-5 w-5 shrink-0 ${text}`} aria-hidden="true" />
      })()
    ) : (
      icon
    )
  return (
    <div role={role} className={`${surface} relative flex gap-3 overflow-hidden p-4 pl-5 ${className}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${TONE_CLASSES[tone].dot} opacity-80`} />
      {iconNode}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${text}`}>{title}</p>
        {children && <div className="mt-1 space-y-2 text-sm leading-relaxed text-gray-400 [&_p]:break-words">{children}</div>}
        {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  )
}
