import { focusRing, pressFeedback } from '@/components/ui/classes'
import { TODAY_TEXT } from './bands'

/**
 * The workspace filter as ONE segmented strip: « Tous · Acme · Project Orchestrator ».
 * A segment narrows the page to one workspace (the choice lives in the URL, owned by the
 * page); "Tous" widens it. The strip never wraps (it took three lines above the page on a
 * phone): past the width, it scrolls inside itself, never the page.
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
      className={`${pressFeedback} inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-xs font-medium md:h-8 ${focusRing} ${
        on ? 'bg-white/[0.1] text-gray-100' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
    </button>
  )
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="group" aria-label={TODAY_TEXT.laneFilterLabel} className="inline-flex gap-0.5 rounded-lg border border-white/[0.08] bg-black/20 p-0.5">
        {chip('', TODAY_TEXT.allLanes, active === null)}
        {lanes.map((l) => chip(l.slug, l.name, active === l.slug))}
      </div>
    </div>
  )
}
