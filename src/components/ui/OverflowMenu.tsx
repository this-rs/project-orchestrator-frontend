import { useCallback, useId, useRef, useState, type SyntheticEvent } from 'react'
import { MoreHorizontal, MoreVertical, type LucideIcon } from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'
import { FloatingMenu } from './FloatingMenu'
import { menuItemClass } from './menuPosition'

export interface OverflowMenuAction {
  label: string
  onClick: () => void | Promise<void>
  variant?: 'default' | 'danger'
  /** Optional leading icon (lucide component). */
  icon?: LucideIcon
  disabled?: boolean
  /** Convenience for conditional actions — hidden actions are not rendered. */
  hidden?: boolean
  /**
   * Ask for confirmation before running `onClick` (use it for destructive
   * actions). The menu renders its own ConfirmDialog.
   */
  confirm?: { title: string; description?: string; confirmLabel?: string }
}

interface OverflowMenuProps {
  actions: OverflowMenuAction[]
  className?: string
  /** Accessible name of the trigger, e.g. `Actions for “Auth flow”`. Default: "More actions". */
  label?: string
  /** `horizontal` (⋯, default) or `vertical` (⋮). */
  icon?: 'horizontal' | 'vertical'
  /** `sm` = list rows (36px touch / 32px desktop), `md` = page headers (40px / 32px). */
  size?: 'sm' | 'md'
  /** Menu alignment relative to the trigger. Default `end` (right edges aligned). */
  align?: 'start' | 'end'
}

const stop = (e: SyntheticEvent) => e.stopPropagation()

/**
 * `⋯` actions menu — touch-safe, keyboard accessible, works on every browser
 * (JS positioning, no CSS Anchor Positioning — see menuPosition.ts).
 *
 * Clicks / keys inside never reach a surrounding row or <Link>. Actions with
 * `confirm` open a ConfirmDialog first. Renders nothing when every action is
 * hidden.
 */
export function OverflowMenu({
  actions,
  className = '',
  label = 'More actions',
  icon = 'horizontal',
  size = 'md',
  align = 'end',
}: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [pending, setPending] = useState<OverflowMenuAction | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = `om-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const close = useCallback((focusTrigger: boolean) => {
    setIsOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }, [])

  const visible = actions.filter((a) => !a.hidden)
  if (visible.length === 0) return null

  const run = (action: OverflowMenuAction) => {
    close(true)
    if (action.confirm) setPending(action)
    else void action.onClick()
  }

  const Icon = icon === 'vertical' ? MoreVertical : MoreHorizontal
  const sizeClass = size === 'sm' ? 'w-9 h-9 md:w-8 md:h-8' : 'w-10 h-10 md:w-8 md:h-8'

  return (
    // Wrapper swallows React events (they bubble through portals) so a parent
    // row / <Link> never reacts to the menu or its confirmation dialog.
    <div className={`relative inline-flex shrink-0 ${className}`} onClick={stop} onKeyDown={stop}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen((v) => !v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault()
            setIsOpen(true)
          }
        }}
        className={`${sizeClass} inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60 ${
          isOpen ? 'text-gray-200 bg-white/[0.06]' : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.05]'
        }`}
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
      </button>

      <FloatingMenu open={isOpen} onClose={close} triggerRef={triggerRef} id={menuId} label={label} align={align}>
        {visible.map((action) => {
          const ItemIcon = action.icon
          const danger = action.variant === 'danger'
          return (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                run(action)
              }}
              className={menuItemClass(danger)}
            >
              {ItemIcon && <ItemIcon className={`w-4 h-4 shrink-0 ${danger ? '' : 'text-gray-500'}`} aria-hidden="true" />}
              <span className="truncate">{action.label}</span>
            </button>
          )
        })}
      </FloatingMenu>

      {pending?.confirm && (
        <ConfirmDialog
          open
          onClose={() => setPending(null)}
          onConfirm={() => pending.onClick()}
          title={pending.confirm.title}
          description={pending.confirm.description}
          confirmLabel={pending.confirm.confirmLabel ?? pending.label}
          variant={pending.variant === 'danger' ? 'danger' : 'warning'}
        />
      )}
    </div>
  )
}
