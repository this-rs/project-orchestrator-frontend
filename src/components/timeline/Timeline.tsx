/**
 * Timeline — the horizontal strip of a conversation.
 *
 * Reusable and controlled: it knows nothing about chat, routes or requests.
 * Give it lanes of items (see `buildTimeline`), say which one is selected, and
 * it tells you when one is chosen. The chat shows it above the transcript; the
 * dedicated page shows it large next to the detail of the chosen item.
 *
 * One lane per conversation (the same parent → child organisation as the
 * conversation list). A lane scrolls on its own; a new item scrolls it to the
 * end unless the reader has moved away from the end.
 */
import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { StatusDot, StatusIcon } from '@/components/ui'
import { focusRing } from '@/components/ui/classes'
import type { StatusTone } from '@/components/ui/statusMeta'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import { routedByLabel } from '@/constants/providers'
import { shortModel, type TimelineItem, type TimelineLane, type TimelineStatus } from './model'

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
  /** Button that reveals the items beyond `maxItems`; `{n}` is their count. */
  earlier: string
  /** `aria-label` of the list. */
  list: string
}

export const DEFAULT_TIMELINE_LABELS: TimelineLabels = {
  status: { running: 'Running', done: 'Done', error: 'Failed', blocked: 'Waiting for you', cancelled: 'Cancelled', pending: 'Pending', unknown: 'No result' },
  empty: 'Nothing has happened yet.',
  earlier: 'Show {n} earlier',
  list: 'Timeline',
}

export function formatItemDuration(ms?: number): string | null {
  if (ms == null) return null
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} m ${Math.round(s % 60)} s` : `${Math.floor(m / 60)} h ${m % 60} m`
}

export interface TimelineProps {
  lanes: ReadonlyArray<TimelineLane>
  selectedId?: string | null
  onSelect?: (item: TimelineItem) => void
  labels?: TimelineLabels
  /** Compact (chat strip) or roomy (page). */
  density?: 'compact' | 'comfortable'
  /** Draw only the last N items of a lane (the rest behind a button). A long conversation has thousands. */
  maxItems?: number
  className?: string
}

interface ChipProps {
  item: TimelineItem
  selected: boolean
  labels: TimelineLabels
  density: 'compact' | 'comfortable'
  onSelect?: (item: TimelineItem) => void
}

const KIND_WORD: Partial<Record<TimelineItem['kind'], string>> = { plan: 'Plan', task: 'Task', step: 'Step', routing: 'Routing' }

/** The model is spelled on the items where the choice is made or changes, not on every tool call. */
function showModel(item: TimelineItem): boolean {
  return !!item.model && (item.kind === 'request' || item.kind === 'routing' || item.kind === 'marker' || item.kind === 'agent')
}

/** `provider · model · rule`, whatever of it is known. */
export function describeContext(ctx: TimelineLane['context']): string {
  if (!ctx) return ''
  return [ctx.provider, shortModel(ctx.model), ctx.routedBy ? routedByLabel(ctx.routedBy as never) : ''].filter(Boolean).join(' · ')
}

/**
 * A chip is redrawn only when something it shows changed. `buildTimeline` makes new item objects on
 * every call (once per streamed token), so comparing identities would redraw every chip every time.
 */
function sameChip(a: ChipProps, b: ChipProps): boolean {
  const x = a.item
  const y = b.item
  return (
    a.selected === b.selected && a.labels === b.labels && a.density === b.density && a.onSelect === b.onSelect &&
    x.id === y.id && x.status === y.status && x.label === y.label && x.durationMs === y.durationMs && x.model === y.model
  )
}

const Chip = memo(function Chip({ item, selected, labels, density, onSelect }: ChipProps) {
  const tone = STATUS_TONE[item.status]
  const duration = formatItemDuration(item.durationMs)
  const statusLabel = labels.status[item.status]
  return (
    <li className="shrink-0">
      <button
        type="button"
        data-timeline-item={item.id}
        data-status={item.status}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${item.label} — ${statusLabel}${duration ? `, ${duration}` : ''}`}
        title={`${item.label} — ${statusLabel}`}
        onClick={() => onSelect?.(item)}
        className={`flex min-h-8 max-w-56 items-center gap-1.5 rounded-lg border px-2 text-left text-xs transition-colors ${focusRing} ${
          density === 'comfortable' ? 'py-1.5' : 'py-1'
        } ${
          selected
            ? 'border-indigo-400/60 bg-white/[0.08] text-gray-100'
            : 'border-white/10 bg-white/[0.02] text-gray-300 hover:bg-white/[0.06]'
        } ${item.kind === 'request' ? 'font-medium' : ''}`}
      >
        {item.status === 'running' ? <StatusDot tone={tone} pulse size="md" /> : <StatusIcon tone={tone} className={TONE_CLASSES[tone].text} />}
        {KIND_WORD[item.kind] && <span className="shrink-0 text-[10px] text-gray-400">{KIND_WORD[item.kind]}</span>}
        <span className="min-w-0 truncate">{item.label}</span>
        {showModel(item) && <span className="shrink-0 rounded border border-white/10 px-1 text-[10px] text-gray-400" data-testid="timeline-model">{shortModel(item.model)}</span>}
        {duration && <span className="shrink-0 tabular-nums text-[10px] text-gray-400">{duration}</span>}
      </button>
    </li>
  )
}, sameChip)

/** Arrow keys walk the chips of a lane. */
function onLaneKeyDown(e: KeyboardEvent<HTMLOListElement>) {
  const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  const home = e.key === 'Home'
  const end = e.key === 'End'
  if (!delta && !home && !end) return
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-timeline-item]'))
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = home ? 0 : end ? buttons.length - 1 : at + delta
  const target = buttons[Math.min(buttons.length - 1, Math.max(0, next))]
  if (target) {
    e.preventDefault()
    target.focus()
  }
}

function Lane({ lane, selectedId, onSelect, labels, density, showTitle, maxItems }: {
  lane: TimelineLane
  selectedId?: string | null
  onSelect?: (item: TimelineItem) => void
  labels: TimelineLabels
  density: 'compact' | 'comfortable'
  showTitle: boolean
  maxItems?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const count = lane.items.length
  // A selected item that falls in the hidden part opens the rest: a selection must be visible.
  const selectedHidden = !!maxItems && !!selectedId && lane.items.slice(0, Math.max(0, count - maxItems)).some((i) => i.id === selectedId)
  const limited = !!maxItems && !showAll && !selectedHidden && count > maxItems
  const shown = limited ? lane.items.slice(count - (maxItems as number)) : lane.items
  const hidden = count - shown.length

  useEffect(() => {
    const el = scroller.current
    if (el && atEnd.current) el.scrollLeft = el.scrollWidth
  }, [count])

  // Bring the selected chip into view (the page selects from a link, the strip from a click).
  useEffect(() => {
    if (!selectedId) return
    const chip = Array.from(scroller.current?.querySelectorAll<HTMLElement>('[data-timeline-item]') ?? []).find((el) => el.dataset.timelineItem === selectedId)
    chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [selectedId])

  return (
    <div className="flex min-w-0 items-center gap-2" data-timeline-lane={lane.id}>
      {showTitle && (
        <span className="flex w-28 shrink-0 flex-col sm:w-40" title={[lane.title, describeContext(lane.context)].filter(Boolean).join(' — ')}>
          <span className="truncate text-[11px] text-gray-400">{lane.title}</span>
          {lane.context && <span className="truncate text-[10px] text-gray-400" data-testid="timeline-lane-context">{describeContext(lane.context)}</span>}
        </span>
      )}
      <div
        ref={scroller}
        className="min-w-0 flex-1 overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget
          atEnd.current = el.scrollWidth - el.clientWidth - el.scrollLeft < 24
        }}
      >
        <ol aria-label={lane.title} onKeyDown={onLaneKeyDown} className="flex w-max items-center gap-1.5 py-1">
          {hidden > 0 && (
            <li className="shrink-0">
              <button type="button" onClick={() => setShowAll(true)} className={`min-h-8 rounded-lg border border-dashed border-white/20 px-2 text-xs text-gray-300 hover:bg-white/[0.06] ${focusRing}`}>
                {labels.earlier.replace('{n}', String(hidden))}
              </button>
            </li>
          )}
          {shown.map((item) => (
            <Chip key={item.id} item={item} selected={item.id === selectedId} labels={labels} density={density} onSelect={onSelect} />
          ))}
        </ol>
      </div>
    </div>
  )
}

export function Timeline({ lanes, selectedId, onSelect, labels = DEFAULT_TIMELINE_LABELS, density = 'compact', maxItems, className = '' }: TimelineProps) {
  const filled = lanes.filter((l) => l.items.length > 0)
  if (filled.length === 0) {
    return <p className={`px-3 py-2 text-xs text-gray-400 ${className}`}>{labels.empty}</p>
  }
  return (
    <div role="group" aria-label={labels.list} className={`flex flex-col gap-0.5 ${className}`}>
      {filled.map((lane) => (
        <Lane key={lane.id} lane={lane} selectedId={selectedId} onSelect={onSelect} labels={labels} density={density} showTitle={filled.length > 1} maxItems={maxItems} />
      ))}
    </div>
  )
}
