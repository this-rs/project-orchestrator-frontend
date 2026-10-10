/**
 * Colours of the trace: one per KIND of span (what it is). The status (how it
 * went) is never told by colour alone: it is an icon and a word on the row, and
 * a pattern on the bar (hatched = failed, stripes = running, dashed = cancelled,
 * dotted = waiting for you).
 *
 * Every fill is at least 3:1 against the dark surface (WCAG 1.4.11).
 */
import type { CSSProperties } from 'react'
import type { TimelineKind, TimelineStatus } from './model'

export const KIND_SWATCH: Record<TimelineKind, string> = {
  request: 'bg-indigo-400',
  tool: 'bg-sky-400',
  agent: 'bg-violet-400',
  run: 'bg-fuchsia-400',
  permission: 'bg-amber-400',
  error: 'bg-red-400',
  marker: 'bg-gray-400',
  routing: 'bg-teal-400',
  plan: 'bg-emerald-400',
  task: 'bg-emerald-400',
  step: 'bg-emerald-300',
}

/** A turn is an envelope of what it caused: lighter, so its children read on top. */
export const KIND_BAR: Record<TimelineKind, string> = {
  ...KIND_SWATCH,
  request: 'bg-indigo-400/55',
  run: 'bg-fuchsia-400/55',
}

const STRIPES = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 3px, transparent 3px 7px)'

/** Pattern and outline of a bar by status. */
export function statusBar(status: TimelineStatus): { className: string; style?: CSSProperties } {
  switch (status) {
    case 'error':
      return { className: 'outline outline-2 outline-red-300', style: { backgroundImage: STRIPES } }
    case 'running':
      return { className: 'trace-running rounded-r-none', style: { backgroundImage: STRIPES, backgroundSize: '20px 20px' } }
    case 'cancelled':
      return { className: 'opacity-60 outline outline-1 outline-dashed outline-gray-300' }
    case 'blocked':
      return { className: 'outline outline-2 outline-dotted outline-amber-200' }
    case 'unknown':
      return { className: 'opacity-70 outline outline-1 outline-dashed outline-gray-400' }
    default:
      return { className: '' }
  }
}
