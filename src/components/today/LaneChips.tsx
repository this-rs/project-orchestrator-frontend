import { segmentItem, segmented } from '@/components/ui/classes'
import { TODAY_TEXT } from './bands'

/**
 * The workspace filter as ONE segmented strip: « All · Acme · Project Orchestrator ».
 * A segment narrows the page to one workspace (the choice lives in the URL, owned by the
 * page); "All" widens it. It sits at the right of the headline; past the width it wraps, it
 * never scrolls sideways.
 *
 * Material: the glass segmented control of the contract (`seg` / `seg-item`, DESIGN.md
 * Material), as the site drew it (`website/src/components/today/LaneChips.tsx`); the
 * selected chip is the tinted glass of `aria-pressed="true"`.
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
      className={`${segmentItem} min-h-9 max-w-full px-3 text-xs font-medium`}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
    </button>
  )
  return (
    <div role="group" aria-label={TODAY_TEXT.laneFilterLabel} className={`${segmented} max-w-full flex-wrap`}>
      {chip('', TODAY_TEXT.allLanes, active === null)}
      {lanes.map((l) => chip(l.slug, l.name, active === l.slug))}
    </div>
  )
}
