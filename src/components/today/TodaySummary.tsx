import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui'
import { focusRingInset, pressFeedback } from '@/components/ui/classes'
import type { Band } from '@/types/attention'
import { BAND_TEXT, SECTION_ORDER, TODAY_TEXT } from './bands'

/** What each counter says when it is not zero: the colour of its number. Zero is always quiet. */
const COUNT_TONE: Record<Band, string> = {
  waiting: 'text-sky-300',
  stuck: 'text-amber-300',
  running: 'text-indigo-300',
  thinking: 'text-gray-100',
}

/** Scrolls to a section without animation (the page has none), moving focus to it for keyboard users. */
export function goToSection(band: Band) {
  const el = document.getElementById(`today-${band}`)
  if (!el) return
  el.scrollIntoView?.({ block: 'start' })
}

export interface TodaySummaryProps {
  counts: Record<Band, number> | null
  onGo?: (band: Band) => void
  /** A small chart per counter (decorative: the number and the words say the same). */
  visuals?: Partial<Record<Band, ReactNode>>
}

/**
 * The four counters of the day, as the bottom edge of the header: a number in large type, what
 * it counts, and one line of what that means. Each is a button that brings its section into view
 * (and opens "To read", folded by default). Same file split as the site's `TodaySummary`.
 *
 * The numbers are LIVE: the realtime refetch and the optimistic updates (a request answered, a
 * plan resumed) move them in place, so they are plain text nodes — no `CountUp` (DESIGN.md
 * « Kit »: a tween on live data restarts on every update and the number is never true).
 */
export function TodaySummary({ counts, onGo = goToSection, visuals }: TodaySummaryProps) {
  return (
    <ul aria-label={TODAY_TEXT.summaryLabel} className="grid grid-cols-2 @2xl/today:grid-cols-4">
      {SECTION_ORDER.map((b) => {
        const n = counts ? counts[b] : null
        return (
          <li key={b} data-counter={b} className="min-w-0 border-white/[0.07] odd:border-r @2xl/today:border-r @2xl/today:last:border-r-0 [&:nth-child(-n+2)]:border-b @2xl/today:[&:nth-child(-n+2)]:border-b-0">
            <button
              type="button"
              onClick={() => onGo(b)}
              className={`flex h-full w-full min-w-0 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.04] ${pressFeedback} ${focusRingInset}`}
            >
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="flex items-baseline gap-2">
                  {n !== null ? (
                    <span className={`text-3xl font-semibold leading-8 tabular-nums tracking-tight ${n > 0 ? COUNT_TONE[b] : 'text-gray-500'}`}>{n}</span>
                  ) : (
                    <Skeleton className="h-7 w-6" />
                  )}{' '}
                  <span className="text-sm font-medium text-gray-200">{BAND_TEXT[b].summary}</span>
                </span>
                <span className="hidden text-xs leading-4 text-gray-400 @md/today:block">{BAND_TEXT[b].hint}</span>
              </span>
              {n !== null && n > 0 && visuals?.[b] && <span className={`shrink-0 ${COUNT_TONE[b]}`}>{visuals[b]}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
