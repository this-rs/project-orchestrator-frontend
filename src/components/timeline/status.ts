import type { StatusTone } from '@/components/ui/statusMeta'
import { routedByLabel } from '@/constants/providers'
import { shortModel, type TimelineKind, type TimelineLane, type TimelineStatus } from './model'

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
  trace: TraceLabels
}

/** The words of the trace view. `{x}` markers are filled by the component. */
export interface TraceLabels {
  label: string
  /** `{n}` spans. */
  spans: string
  zoomIn: string
  zoomOut: string
  fit: string
  follow: string
  help: string
  helpTouch: string
  overview: string
  window: string
  ruler: string
  column: string
  expand: string
  collapse: string
  /** `{loaded}` of `{total}` events. */
  loading: string
  loadingStart: string
  failed: string
  retry: string
  noDate: string
  child: string
  relay: string
  kind: Record<TimelineKind, string>
  detail: {
    title: string
    close: string
    total: string
    self: string
    start: string
    end: string
    running: string
    status: string
    kind: string
    model: string
    provider: string
    input: string
    output: string
    showMore: string
    showLess: string
    goTo: string
    openSession: string
    zoom: string
  }
}

export const DEFAULT_TRACE_LABELS: TraceLabels = {
  label: 'Trace of the conversation',
  spans: 'Spans: {n}',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Show everything',
  follow: 'Follow live',
  help: 'Zoom: Ctrl/⌘ + wheel or W/S · Pan: drag or A/D · Double-click a span to zoom on it',
  helpTouch: 'Pinch to zoom, drag sideways to pan, tap a span for its details',
  overview: 'Overview of the whole conversation',
  window: 'Visible window',
  ruler: 'Time since the first event',
  column: 'Span',
  expand: 'Expand',
  collapse: 'Collapse',
  loading: 'Loading earlier turns… {loaded} of {total} events',
  loadingStart: 'Loading the history…',
  failed: 'Part of the history could not be loaded.',
  retry: 'Try again',
  noDate: 'no date',
  child: 'Delegated session',
  relay: 'Relayed thread',
  kind: {
    request: 'Turn', tool: 'Tool call', agent: 'Sub-agent', permission: 'Permission', error: 'Error', marker: 'Event',
    run: 'Session', routing: 'Routing', plan: 'Plan', task: 'Task', step: 'Step',
  },
  detail: {
    title: 'Span details',
    close: 'Close',
    total: 'Total time',
    self: 'Self time',
    start: 'Start',
    end: 'End',
    running: 'still running',
    status: 'Status',
    kind: 'Kind',
    model: 'Model',
    provider: 'Provider',
    input: 'Input',
    output: 'Output',
    showMore: 'Show all',
    showLess: 'Show less',
    goTo: 'Show in the conversation',
    openSession: 'Open this session',
    zoom: 'Zoom on this span',
  },
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
  trace: DEFAULT_TRACE_LABELS,
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
