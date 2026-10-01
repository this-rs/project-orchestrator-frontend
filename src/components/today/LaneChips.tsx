import { focusRing, pressFeedback } from '@/components/ui/classes'
import { TODAY_TEXT } from './bands'

/**
 * The workspace filter as a row of compact chips: « Tous · Acme · Project Orchestrator ».
 * A chip narrows the page to one workspace (the choice lives in the URL, owned by the
 * page); "Tous" widens it. The row wraps, it never scrolls sideways.
 */
export interface LaneChipsProps {
  lanes: { slug: string; name: string }[]
  /** Active workspace slug, or null for all. */
  active: string | null
  /** `''` means all. */
  onSelect: (slug: string) => void
}

export function LaneChips({ lanes, active, onSelect }: LaneChipsProps) {
  if (lanes.length === 0) return null
  const chip = (slug: string, label: string, on: boolean) => (
    <button
      key={slug || 'all'}
      type="button"
      aria-pressed={on}
      data-lane-chip={slug || 'all'}
      onClick={() => onSelect(slug)}
      className={`${pressFeedback} inline-flex min-h-9 max-w-full items-center rounded-full border px-3 text-xs ${focusRing} ${
        on
          ? 'border-indigo-400/60 bg-indigo-500/15 text-gray-100'
          : 'border-white/[0.1] text-gray-300 hover:bg-white/[0.06]'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
  return (
    <div role="group" aria-label={TODAY_TEXT.laneFilterLabel} className="flex flex-wrap gap-2">
      {chip('', TODAY_TEXT.allLanes, active === null)}
      {lanes.map((l) => chip(l.slug, l.name, active === l.slug))}
    </div>
  )
}
