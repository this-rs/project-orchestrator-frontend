import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { MetaLine } from './MetaLine'
import { useT } from '@/i18n'
import { OverflowMenu, type OverflowMenuAction } from './OverflowMenu'
import { TONE_CLASSES, type StatusTone } from './statusMeta'
import { NOMENCLATURE, tintStyle, type ConceptKey } from '@/constants/nomenclature'

/** Tones that earn a left rail: the same set as an `EntityRow`. Done / idle / archived stay quiet. */
const RAIL_TONES: StatusTone[] = ['progress', 'info', 'warning', 'danger', 'special']
/** Tones that draw an edge and a halo: everything except the two quiet ones. */
const QUIET_TONES: StatusTone[] = ['neutral', 'muted']

export interface EntityCardProps {
  /** Which kind of thing this is: its tint and its default icon are read from `NOMENCLATURE`. */
  concept: ConceptKey
  /** Overrides the icon of the tile (the tint stays that of the concept). */
  icon?: LucideIcon
  /** Primary text. Plain string preferred (also used for the ⋯ aria-label). */
  title: ReactNode
  /** Navigate on activation (react-router path). Takes precedence over `onClick`. */
  href?: string
  /** Activate handler when the card is not a link. */
  onClick?: () => void
  /** Small visual before the title, on the title line — StatusDot, checkbox. */
  leading?: ReactNode
  /** Inline after the title (small icon, lock, count…). Keep tiny. */
  titleSuffix?: ReactNode
  /** Bottom right: usually <RelativeTime/> or a short value. */
  trailing?: ReactNode
  /** One/two-line secondary text. */
  description?: ReactNode
  /** Status line (state, then priority). The words always spell the state: colour never carries it alone. */
  status?: ReactNode[] | ReactNode
  /** Tone of the status: draws the rail, the edge and, on hover, the halo. */
  tone?: StatusTone
  /** Facts line: an array is rendered as a <MetaLine variant="facts"/>, a node as-is. */
  meta?: ReactNode[] | ReactNode
  /** Extra block under the meta (progress bar, linked entities…). */
  context?: ReactNode
  /** THE visible action of the card (one `<Button size="sm">`), bottom left. At most one; the rest goes in `actions`. */
  primaryAction?: ReactNode
  /** Card actions: an array renders a `⋯` OverflowMenu; a node is rendered as-is. */
  actions?: OverflowMenuAction[] | ReactNode
  /** Selected / current item. */
  selected?: boolean
  /** Dim the title (completed / archived items). */
  muted?: boolean
  /** Accessible name for the main control when `title` is not plain text. */
  ariaLabel?: string
  /** Name used by the `⋯` menu (`Actions for <menuLabel>`). */
  menuLabel?: string
  /** The card toggles inline content: sets `aria-expanded` on the title control. */
  expanded?: boolean
  /** Expanded content rendered at the bottom of the card. */
  children?: ReactNode
  /** view-transition-name on the title (morph into the detail page header). */
  viewTransitionName?: string
  as?: 'li' | 'div' | 'article'
  className?: string
}

/**
 * An entity shown as a card: the SAME slots as an `EntityRow` (DESIGN.md §5b).
 *
 * ```
 * ┌ rail ─────────────────────────────────────┐
 * │ [tile] [leading] Title ················ ⋯ │
 * │ description                                │
 * │ ◔ status · facts                           │
 * │ context                                    │
 * │ [primaryAction]                   trailing │
 * └────────────────────────────────────────────┘
 * ```
 *
 * Opaque. The KIND of thing is the tint (icon tile + a wash of at most 11 %, read from
 * `NOMENCLATURE`); the STATE is the tone (rail, edge, halo). One real button opens the thing
 * (the title, stretched over the card); the primary action and the ⋯ menu sit above it.
 * Hover: a 3 px rise with a fine pointer and no reduced motion; edge and halo are colour only.
 */
export function EntityCard({
  concept,
  icon,
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
  primaryAction,
  actions,
  selected,
  muted,
  ariaLabel,
  menuLabel,
  expanded,
  children,
  viewTransitionName,
  as: Tag = 'li',
  className = '',
}: EntityCardProps) {
  const { t } = useT()
  const Icon = icon ?? NOMENCLATURE[concept].icon
  const menuName = menuLabel ?? ariaLabel ?? (typeof title === 'string' ? title : undefined)
  const titleColor = selected ? 'text-gray-50' : muted ? 'text-gray-400' : 'text-gray-100'
  const hasStatus = Array.isArray(status) ? status.some((n) => n) : Boolean(status)
  const hasMeta = Array.isArray(meta) ? meta.some((n) => n) : meta != null && meta !== false
  const toneClasses = tone ? TONE_CLASSES[tone] : undefined
  const loud = tone != null && !QUIET_TONES.includes(tone)
  const rail = selected ? 'bg-indigo-500' : tone && RAIL_TONES.includes(tone) ? `${TONE_CLASSES[tone].dot} opacity-80` : null
  const stretched =
    "text-left outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-indigo-500/70"

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
    <OverflowMenu actions={actions as OverflowMenuAction[]} size="sm" label={menuName ? t('ui.actionsFor', { name: menuName }) : t('ui.cardActions')} />
  ) : (
    actions
  )

  return (
    <Tag
      data-entity-card=""
      data-concept={concept}
      data-tone={tone}
      data-selected={selected ? '' : undefined}
      style={tintStyle(concept) as CSSProperties}
      className={`group/card relative flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 [background-image:linear-gradient(160deg,color-mix(in_srgb,var(--entity-tint)_11%,transparent),transparent_55%)] transition-[translate] duration-(--duration-fast) ease-(--ease-standard) pointer-fine:motion-safe:hover:-translate-y-[3px] ${
        selected ? 'ring-1 ring-indigo-500/50' : ''
      } ${className}`}
    >
      {/* Halo: the tone's light BEHIND the card. Colour only, fine pointer only, none for the quiet tones. */}
      {loud && toneClasses && (
        <span
          aria-hidden="true"
          data-card-halo=""
          className={`pointer-events-none absolute -inset-3 -z-10 hidden rounded-3xl opacity-0 transition-opacity duration-(--duration-fast) ease-(--ease-standard) [background-image:radial-gradient(closest-side,color-mix(in_srgb,currentColor_18%,transparent),transparent)] pointer-fine:block pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:opacity-100 ${toneClasses.text}`}
        />
      )}
      {/* Edge: the 1 px border takes the tone at 35 % (55 % on hover and focus). */}
      {loud && toneClasses && (
        <span
          aria-hidden="true"
          data-card-edge=""
          className={`pointer-events-none absolute inset-0 rounded-xl border border-current opacity-35 transition-[opacity] duration-(--duration-fast) ease-(--ease-standard) group-hover/card:opacity-55 group-focus-within/card:opacity-55 ${toneClasses.text}`}
        />
      )}
      {rail && <span aria-hidden="true" data-card-rail="" className={`absolute inset-y-0 left-0 w-[3px] rounded-l-xl ${rail}`} />}

      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          data-card-tile=""
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--entity-tint)_12%,transparent)] text-(--entity-tint)"
        >
          <Icon className="size-[18px]" />
        </span>
        <div className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 ${menu ? 'pr-7' : ''}`}>
          {leading && <div className="relative z-10 flex shrink-0 items-center">{leading}</div>}
          <div
            className={`min-w-0 flex-1 text-sm font-medium leading-5 line-clamp-2 break-words ${titleColor}`}
            style={viewTransitionName ? { viewTransitionName } : undefined}
          >
            {titleNode}
            {titleSuffix && <span className="ml-1.5 inline-flex items-center align-middle">{titleSuffix}</span>}
          </div>
        </div>
      </div>

      {description && <div className="text-xs leading-[1.125rem] text-gray-400 line-clamp-2 break-words">{description}</div>}
      {(hasStatus || hasMeta) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          {hasStatus && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium leading-4">
              {Array.isArray(status)
                ? status.map((n, i) => (n ? <span key={i} className="inline-flex items-center empty:hidden">{n}</span> : null))
                : status}
            </div>
          )}
          {hasMeta && (Array.isArray(meta) ? <MetaLine items={meta} variant="facts" /> : meta)}
        </div>
      )}
      {context && <div className="min-w-0">{context}</div>}
      {children && <div className="relative z-10">{children}</div>}

      {(primaryAction || trailing) && (
        <div className="mt-auto flex items-center gap-2 pt-1">
          {primaryAction && (
            <div data-card-primary="" className="relative z-10 shrink-0">
              {primaryAction}
            </div>
          )}
          {trailing && <div className="ml-auto shrink-0 text-xs leading-5 tabular-nums text-gray-500">{trailing}</div>}
        </div>
      )}
      {/* Last in the DOM so the tab order is title, primary action, menu; drawn top right. */}
      {menu && (
        <div data-card-menu="" className="absolute right-2 top-3 z-10">
          {menu}
        </div>
      )}
    </Tag>
  )
}
