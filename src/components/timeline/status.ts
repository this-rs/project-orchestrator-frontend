import type { StatusTone } from '@/components/ui/statusMeta'
import { routedByLabel } from '@/constants/providers'
import { shortModel, type TimelineLane, type TimelineStatus } from './model'

export const STATUS_TONE: Record<TimelineStatus, StatusTone> = {
  running: 'progress',
  done: 'success',
  error: 'danger',
  blocked: 'warning',
  cancelled: 'neutral',
  pending: 'neutral',
  unknown: 'neutral',
}

export interface TimelineLabels {
  status: Record<TimelineStatus, string>
  empty: string
  /** Button that reveals the rows before the window; `{n}` is their count. */
  earlier: string
  /** `aria-label` of the chart. */
  list: string
  /** `Calls: {n}`. */
  calls: string
  /** `Peak in parallel: {n}`. */
  peak: string
  /** Name of the concurrency track. */
  parallel: string
  /** A stretch with nothing happening, drawn as a break; `{d}` is its length. */
  idle: string
}

export const DEFAULT_TIMELINE_LABELS: TimelineLabels = {
  status: { running: 'Running', done: 'Done', error: 'Failed', blocked: 'Waiting for you', cancelled: 'Cancelled', pending: 'Pending', unknown: 'No result' },
  empty: 'Nothing has happened yet.',
  earlier: 'Show {n} earlier',
  list: 'Timeline',
  calls: 'Calls: {n}',
  peak: 'Peak in parallel: {n}',
  parallel: 'In parallel',
  idle: '{d} idle',
}

export function formatItemDuration(ms?: number): string | null {
  if (ms == null) return null
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} m ${Math.round(s % 60)} s` : `${Math.floor(m / 60)} h ${m % 60} m`
}

/** `provider · model · rule`, whatever of it is known. */
export function describeContext(ctx: TimelineLane['context']): string {
  if (!ctx) return ''
  return [ctx.provider, shortModel(ctx.model), ctx.routedBy ? routedByLabel(ctx.routedBy as never) : ''].filter(Boolean).join(' · ')
}
