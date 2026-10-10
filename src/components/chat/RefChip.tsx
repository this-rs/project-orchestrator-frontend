import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Scissors, X } from 'lucide-react'
import { refKindDef } from '@/refs/registry'
import type { RefDisplayState, RefKind } from '@/refs/types'
import { REF_CHIP_HEIGHT, REF_CHIP_HIT } from './chipGeometry'

/**
 * How loud a chip is.
 * - `full`: the chip as such — border, background, full icon. The composer and
 *   the user bubble's reference list, where a chip is a thing you handle.
 * - `inline`: a citation inside the agent's prose. At rest it reads as text
 *   (current colour, a faint dotted underline, a dimmed icon); hovered,
 *   focused or pressed it shows the `full` chip. The agent cites a lot: the
 *   chips must not get in the way of reading.
 */
export type RefChipDensity = 'inline' | 'full'

/**
 * Words that carry the state next to the icon: a state is never told by
 * colour alone. `forbidden` and `not_found` are one state on purpose — the
 * server never lets a client tell them apart, so neither does the chip.
 */
const STATE_TEXT: Record<RefDisplayState, string> = {
  pending: 'resolving',
  ok: '',
  truncated: 'truncated',
  unavailable: 'unavailable',
}

const STATE_CLASS: Record<RefDisplayState, string> = {
  pending: 'border-white/[0.08] bg-white/[0.04] text-slate-300',
  ok: 'border-indigo-400/30 bg-indigo-500/10 text-slate-100',
  truncated: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  unavailable: 'border-red-400/40 bg-red-500/10 text-red-200',
}

/**
 * Geometry shared by both densities. The border and the padding are there at
 * rest too (transparent in `inline`): revealing changes colours, never the
 * width of the line. The chip sits INSIDE a line of text: 20px drawn, 16px
 * counted by the line (`REF_CHIP_HEIGHT`) — it never pushes two lines apart.
 */
const BASE_CLASS = `group relative inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 align-baseline text-xs ${REF_CHIP_HEIGHT} transition-colors duration-150 motion-reduce:transition-none`

/**
 * A chip that is a link: a visible focus ring and a 24px target, drawn by a
 * transparent `::before` — the target grows, the line does not. A link in a
 * sentence is bounded by its line (WCAG 2.2, 2.5.8, inline exception): no
 * 44px on touch, which used to double the height of every line with a chip.
 */
const LINK_CLASS = `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${REF_CHIP_HIT}`

/**
 * `inline` at rest: no background, no visible border, the text's own colour,
 * a discreet dotted underline. The revealed look is the `full` ok chip,
 * reached by hover, keyboard focus, a press (`active`, the touch path) or the
 * `data-revealed` flag set while the chip holds the focus.
 */
const INLINE_CLASS = [
  'border-transparent bg-transparent text-inherit underline decoration-dotted decoration-indigo-400/40 underline-offset-2',
  'hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-slate-100 hover:no-underline',
  'focus-visible:border-indigo-400/30 focus-visible:bg-indigo-500/10 focus-visible:text-slate-100 focus-visible:no-underline',
  'active:border-indigo-400/30 active:bg-indigo-500/10 active:text-slate-100 active:no-underline',
  'data-[revealed=true]:border-indigo-400/30 data-[revealed=true]:bg-indigo-500/10 data-[revealed=true]:text-slate-100 data-[revealed=true]:no-underline',
].join(' ')

/** The remove button: drawn 16px inside the chip, a 24px target around it. */
const REMOVE_HIT = "before:absolute before:-inset-1 before:content-['']"

/** The icon keeps its size (no reflow); only its opacity tells rest from revealed. */
const INLINE_ICON_CLASS =
  'opacity-50 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100 group-data-[revealed=true]:opacity-100'

export interface RefChipProps {
  kind: RefKind
  name: string
  /** Defaults to `ok`. Anything else is always drawn `full`: a problem is never whispered. */
  state?: RefDisplayState
  density: RefChipDensity
  /** Makes the chip a link to the entity. */
  to?: string
  /** Inside a router: a client-side `Link`; outside, a plain anchor. */
  inRouter?: boolean
  title?: string
  /** Draws a named remove button (composer only). */
  onRemove?: () => void
  testId: string
}

/**
 * The one chip every reference is drawn with: kind icon, name, the state in
 * words with its own icon, an optional link and an optional remove button.
 */
export function RefChip({ kind, name, state = 'ok', density, to, inRouter, title, onRemove, testId }: RefChipProps) {
  const [focused, setFocused] = useState(false)
  const def = refKindDef(kind)
  const effective: RefChipDensity = state === 'ok' ? density : 'full'
  const isInline = effective === 'inline'
  const stateText = STATE_TEXT[state]
  const Icon = state === 'unavailable' ? AlertTriangle : state === 'truncated' ? Scissors : def.Icon
  const className = [BASE_CLASS, isInline ? INLINE_CLASS : STATE_CLASS[state], to ? LINK_CLASS : ''].filter(Boolean).join(' ')

  const content: ReactNode = (
    <>
      <Icon className={`h-3 w-3 shrink-0 ${isInline ? INLINE_ICON_CLASS : ''}`} aria-hidden />
      <span className="sr-only">{def.name}: </span>
      <span className={`truncate max-w-[14rem] ${state === 'unavailable' ? 'line-through' : ''}`}>{name}</span>
      {stateText && <span className="shrink-0 text-slate-400">({stateText})</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${def.name} ${name}`}
          className={`relative -mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${REMOVE_HIT}`}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </>
  )

  const props = {
    'data-testid': testId,
    'data-kind': kind,
    'data-state': state,
    'data-density': effective,
    ...(isInline
      ? { 'data-revealed': focused ? 'true' : 'false', onFocus: () => setFocused(true), onBlur: () => setFocused(false) }
      : {}),
    className,
    title: title ?? name,
  }

  if (!to) return <span {...props}>{content}</span>
  return inRouter ? (
    <Link to={to} {...props}>
      {content}
    </Link>
  ) : (
    <a href={to} {...props}>
      {content}
    </a>
  )
}
