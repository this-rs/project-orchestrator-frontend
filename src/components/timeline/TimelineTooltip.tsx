/**
 * The hover card of the timeline: what is known of the span or the bar under
 * the pointer, without a click — its title, where it ran (provider · model),
 * how long it took and its bounds.
 *
 * `pointer-events-none`: it follows the pointer, so it must never take it. It
 * is decorative for assistive tech as far as the pointer goes (every row and
 * bar already announces the same facts through its `aria-label`), but it is
 * also raised on keyboard focus, where it is the visible counterpart of that
 * name — hence `role="tooltip"`. Its state lives in `hoverCard.ts`.
 */
import type { HoverCard } from './hoverInfo'

export function TimelineTooltip({ card }: { card: HoverCard }) {
  return (
    <div
      role="tooltip"
      data-testid="timeline-tooltip"
      className="pointer-events-none absolute z-30 max-w-[18rem] rounded-md border border-white/15 bg-slate-950/95 px-2 py-1.5 text-[11px] leading-snug text-gray-100 shadow-xl"
      style={{ left: card.x, top: card.y }}
    >
      <p className="truncate font-medium text-gray-50">{card.info.title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {card.info.lines.map((line, i) => (
          <li key={i} className="flex gap-1.5">
            {line.label && <span className="shrink-0 text-gray-400">{line.label}</span>}
            <span className={line.label ? 'min-w-0 truncate tabular-nums text-gray-200' : 'min-w-0 text-amber-200'}>{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
