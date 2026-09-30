import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MetaLine } from './MetaLine'
import { OverflowMenu, type OverflowMenuAction } from './OverflowMenu'
import { focusRing } from './classes'
import { TONE_CLASSES, type StatusTone } from './statusMeta'

/** Tones that earn a left rail: things moving or needing you. Done / idle / archived stay quiet. */
const RAIL_TONES: StatusTone[] = ['progress', 'info', 'warning', 'danger', 'special']

// ============================================================================
// EntityRow
// ============================================================================

export interface EntityRowProps {
  /** Primary text. Plain string preferred (also used for the ⋯ aria-label). */
  title: ReactNode
  /** Navigate on activation (react-router path). Takes precedence over `onClick`. */
  href?: string
  /** Activate handler when the row is not a link (opens a drawer, selects…). */
  onClick?: () => void
  /** Leading visual aligned with the title — StatusDot, icon, checkbox. */
  leading?: ReactNode
  /** Inline after the title (small icon, lock, count…). Keep tiny. */
  titleSuffix?: ReactNode
  /** Right-aligned on the title line — usually <RelativeTime/> or a short value. */
  trailing?: ReactNode
  /** Optional one/two-line secondary text (description, preview). */
  description?: ReactNode
  /**
   * Status line, right under the description: the row's state (`StatusMenu` /
   * `StatusText icon`) followed by priority / importance. Rendered at 12px
   * medium weight so the state reads before the facts do.
   */
  status?: ReactNode[] | ReactNode
  /** Tone of the status: draws a thin left rail on active / attention rows (colour is never the only cue, `status` spells it out). */
  tone?: StatusTone
  /** Facts line: an array is rendered as a <MetaLine variant="facts"/> (use `Fact`), a node as-is. */
  meta?: ReactNode[] | ReactNode
  /** Extra line under the meta (linked entities, cwd, progress bar…). */
  context?: ReactNode
  /** Row actions: an array renders a `⋯` OverflowMenu; a node is rendered as-is. */
  actions?: OverflowMenuAction[] | ReactNode
  /** Selected / current item (indigo inset bar). */
  selected?: boolean
  /** Dim the title (completed / archived items). */
  muted?: boolean
  /** Max title lines before ellipsis (default 2 — never hide essential info on phones). */
  titleLines?: 1 | 2
  /** Accessible name for the row control when `title` is not plain text. */
  ariaLabel?: string
  /**
   * Name used by the `⋯` menu (`Actions for <menuLabel>`). Defaults to
   * `ariaLabel`, then the plain-string `title`. Pass it when `ariaLabel` carries
   * state or a verb ("Expand …") that must not leak into the menu name.
   */
  menuLabel?: string
  /** Row toggles inline content: sets `aria-expanded` on the title control. */
  expanded?: boolean
  /** Show a trailing chevron (drill-down rows without actions). */
  chevron?: boolean
  /** Expanded content rendered under the row body (full width of the text column). */
  children?: ReactNode
  /** view-transition-name on the title (morph into the detail page PageHeader). */
  viewTransitionName?: string
  as?: 'li' | 'div'
  className?: string
}

/**
 * The one list row used by every entity list.
 *
 * ```
 * [leading] Title ····················· trailing  [⋯]
 *           description (optional, muted)
 *           meta · meta · meta
 *           context (optional)
 * ```
 *
 * Activation uses a "stretched" <Link>/<button> on the title: the whole row is
 * clickable, but nested controls (⋯ menu, StatusMenu, links marked with
 * `rowInteractive`) sit above it, so Enter / taps on them never trigger the
 * row and there is no invalid interactive nesting.
 */
export function EntityRow({
  title,
  href,
  onClick,
  leading,
  titleSuffix,
  trailing,
  description,
  status,
  tone,
  meta,
  context,
  actions,
  selected,
  muted,
  titleLines = 2,
  ariaLabel,
  menuLabel,
  expanded,
  chevron,
  children,
  viewTransitionName,
  as: Tag = 'li',
  className = '',
}: EntityRowProps) {
  const menuName = menuLabel ?? ariaLabel ?? (typeof title === 'string' ? title : undefined)
  const clamp = titleLines === 1 ? 'truncate' : 'line-clamp-2 break-words'
  const titleColor = selected ? 'text-gray-50 font-medium' : muted ? 'text-gray-400' : 'text-gray-100 font-medium'
  const hasStatus = Array.isArray(status) ? status.some((n) => n) : Boolean(status)
  const hasMeta = Array.isArray(meta) ? meta.some((n) => n) : meta != null && meta !== false
  // Stretched activation area + focus ring drawn on the whole row.
  const stretched =
    "text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-inset focus-visible:after:ring-indigo-500/60"
  const interactive = Boolean(href || onClick)

  const titleNode = href ? (
    <Link to={href} aria-label={ariaLabel} aria-current={selected ? 'page' : undefined} aria-expanded={expanded} className={stretched}>
      {title}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} aria-label={ariaLabel} aria-pressed={selected || undefined} aria-expanded={expanded} className={stretched}>
      {title}
    </button>
  ) : (
    title
  )

  const menu = Array.isArray(actions) ? (
    <OverflowMenu actions={actions as OverflowMenuAction[]} size="sm" label={menuName ? `Actions for ${menuName}` : 'Row actions'} />
  ) : (
    actions
  )

  return (
    <Tag
      className={`relative flex items-start gap-2.5 px-3 py-3 md:px-4 transition-colors ${
        selected
          ? 'bg-indigo-500/[0.08] shadow-[inset_2px_0_0_var(--color-indigo-500)]'
          : interactive
            ? 'hover:bg-white/[0.03] active:bg-white/[0.05]'
            : ''
      } ${className}`}
    >
      {tone && !selected && RAIL_TONES.includes(tone) && (
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${TONE_CLASSES[tone].dot} opacity-80`} />
      )}
      {leading && <div className="relative z-10 shrink-0 flex items-center min-h-5">{leading}</div>}

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 min-h-5">
          <div
            className={`flex-1 min-w-0 text-sm leading-5 ${titleColor} ${clamp}`}
            style={viewTransitionName ? { viewTransitionName } : undefined}
          >
            {titleNode}
            {titleSuffix && <span className="ml-1.5 inline-flex items-center align-middle">{titleSuffix}</span>}
          </div>
          {trailing && (
            <>
              {' '}
              <div className="shrink-0 text-xs leading-5 tabular-nums text-gray-500">{trailing}</div>
            </>
          )}
        </div>
        {description && <div className="mt-1 text-xs leading-[1.125rem] text-gray-400 line-clamp-2 break-words">{description}</div>}
        {(hasStatus || hasMeta) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
            {hasStatus && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 font-medium">
                {Array.isArray(status)
                  ? status.map((n, i) => (n ? <span key={i} className="inline-flex items-center empty:hidden">{n}</span> : null))
                  : status}
              </div>
            )}
            {hasMeta && (Array.isArray(meta) ? <MetaLine items={meta} variant="facts" /> : meta)}
          </div>
        )}
        {context && <div className="mt-2 min-w-0">{context}</div>}
        {children && <div className="relative z-10 mt-2">{children}</div>}
      </div>

      {menu && <div className="relative z-10 shrink-0 -my-1.5 -mr-1.5 md:-mr-2">{menu}</div>}
      {!menu && chevron && interactive && (
        <ChevronRight className="shrink-0 mt-0.5 w-4 h-4 text-gray-600" aria-hidden="true" />
      )}
    </Tag>
  )
}

// ============================================================================
// EntityList — container for rows
// ============================================================================

interface EntityListProps {
  children: ReactNode
  /** `card` (default): bordered surface with dividers. `flush`: dividers only (inside a Card / Section). */
  variant?: 'card' | 'flush'
  'aria-label'?: string
  className?: string
}

export function EntityList({ children, variant = 'card', className = '', ...rest }: EntityListProps) {
  const base =
    variant === 'card'
      ? 'rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.06]'
      : 'divide-y divide-white/[0.05]'
  return (
    <ul role="list" aria-label={rest['aria-label']} className={`${base} ${className}`}>
      {children}
    </ul>
  )
}

// ============================================================================
// ListGroup — titled group of rows (recency / status grouping)
// ============================================================================

interface ListGroupProps {
  title: ReactNode
  count?: number
  /** Small right-aligned action (text link / icon button). */
  action?: ReactNode
  /** Header becomes a toggle; body hidden when collapsed. */
  collapsible?: boolean
  defaultOpen?: boolean
  variant?: 'card' | 'flush'
  children: ReactNode
  className?: string
}

export function ListGroup({
  title,
  count,
  action,
  collapsible,
  defaultOpen = true,
  variant = 'card',
  children,
  className = '',
}: ListGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const headingId = useId()
  const isOpen = !collapsible || open

  const heading = (
    <>
      {collapsible && (
        <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
      )}
      <span className="truncate">{title}</span>
      {count !== undefined && (
        <>
          {' '}
          <span className="tabular-nums font-normal text-gray-600">{count}</span>
        </>
      )}
    </>
  )

  return (
    <section aria-labelledby={headingId} className={`group/lg ${className}`}>
      {/* No top gap for the first group of a stack */}
      <div className="flex items-center gap-2 px-1 pt-4 group-first/lg:pt-0 pb-1.5 min-h-9">
        <h3 id={headingId} className="flex-1 min-w-0 text-[11px] font-medium text-gray-500">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={isOpen}
              className={`inline-flex items-center gap-1.5 max-w-full rounded -mx-1 px-1 py-1 hover:text-gray-300 ${focusRing}`}
            >
              {heading}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 max-w-full">{heading}</span>
          )}
        </h3>
        {action && <div className="shrink-0 text-xs">{action}</div>}
      </div>
      {isOpen && <EntityList variant={variant}>{children}</EntityList>}
    </section>
  )
}
