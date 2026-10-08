import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import type { Band } from '@/types/attention'
import { BAND_TEXT, TODAY_TEXT } from './bands'

/** A panel of the dashboard: one surface per section, never nested. */
export const PANEL = 'rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5'

/** One line of error with its retry; a band never loses its place when its source fails. */
export function ErrorLine({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm text-red-300">
      <span className="min-w-0 break-words">{children}</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {TODAY_TEXT.retry}
      </Button>
    </div>
  )
}

export interface BandFrameProps {
  band: Band
  count: number | null
  /** Whole-section load state. */
  state: 'loading' | 'error' | 'ready'
  errorText?: string
  /** A partial failure: the content below is real but incomplete. */
  degraded?: string | null
  onRetry: () => void
  skeleton: ReactNode
  empty: boolean
  /** Draw the section as a panel of the dashboard (a surface with its own padding). */
  panel?: boolean
  className?: string
  children: ReactNode
}

/**
 * The frame of a section of Today: a 16 px title, its count and, when the section is empty, ONE
 * line (title, count and "nothing" side by side) — an empty section shrinks, it is never hidden.
 * The same frame carries the three states of the band: a skeleton with the final shape while it
 * loads, an error line with a retry when its source failed, a degraded notice above real but
 * incomplete content. The site ported this frame (`website/src/components/today/BandFrame.tsx`)
 * without those states; the file split and the name come back from it, the states stay.
 */
export function BandFrame({ band, count, state, errorText, degraded, onRetry, skeleton, empty, panel, className = '', children }: BandFrameProps) {
  const { title, empty: emptyText } = BAND_TEXT[band]
  const showEmptyLine = state === 'ready' && empty && !degraded
  return (
    <section aria-label={title} id={`today-${band}`} data-band={band} data-state={state} className={`min-w-0 scroll-mt-4 ${panel ? PANEL : ''} ${className}`}>
      {/* An empty section is ONE line: its title, its count and "nothing" side by side. */}
      <div className={`flex flex-wrap items-baseline gap-x-3 ${showEmptyLine ? '' : 'mb-2'}`}>
        <h2 className="flex items-baseline gap-2 text-base font-semibold tracking-tight text-gray-100">
          <span>{title}</span>
          {count !== null && count > 0 && <span className="text-sm font-normal tabular-nums text-gray-400">{count}</span>}
        </h2>
        {showEmptyLine && <p className="text-sm text-gray-400">{emptyText}</p>}
      </div>
      {state === 'loading' ? (
        skeleton
      ) : state === 'error' ? (
        <ErrorLine onRetry={onRetry}>{errorText ?? TODAY_TEXT.bandError}</ErrorLine>
      ) : (
        <>
          {degraded && <ErrorLine onRetry={onRetry}>{degraded}</ErrorLine>}
          {empty ? (degraded ? <p className="py-1 text-sm text-gray-400">{emptyText}</p> : null) : children}
        </>
      )}
    </section>
  )
}
