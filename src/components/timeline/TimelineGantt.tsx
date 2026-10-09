/**
 * TimelineGantt — every call of a conversation on one time axis.
 *
 * One row per call, a bar from its start to its end: what ran at the same time
 * is what overlaps vertically. Each row also says what it is, how long it took,
 * and on which model. A track at the top counts the calls in flight.
 *
 * Reusable and controlled: it knows nothing about chat, routes or requests.
 * Give it lanes of items (see `buildTimeline`), say which one is selected, and
 * it tells you when one is chosen. The chat shows it small above the
 * transcript; the dedicated page shows it large next to the chain of events.
 *
 * Status is never colour alone: the row carries an icon and the bar of a
 * failure is hatched.
 */
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { StatusDot, StatusIcon } from '@/components/ui'
import { focusRing } from '@/components/ui/classes'
import { TONE_CLASSES, type StatusTone } from '@/components/ui/statusMeta'
import { layoutGantt, type GanttBreak, type GanttRow } from './gantt'
import { shortModel, type TimelineItem, type TimelineLane } from './model'
import { DEFAULT_TIMELINE_LABELS, STATUS_TONE, describeContext, formatItemDuration, type TimelineLabels } from './status'

/**
 * Columns. On a phone a row has two lines (label and duration, then the bar across the full width), so a
 * label is never cut to a few letters; from `sm` it is one line: label, bar, model, duration.
 */
const COLUMNS = 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(10rem,30%)_minmax(0,1fr)_6.5rem_3.5rem]'

const BAR_TONE: Record<StatusTone, string> = {
  neutral: 'bg-gray-400/45',
  info: 'bg-sky-400/60',
  progress: 'bg-indigo-400/70',
  success: 'bg-emerald-500/60',
  warning: 'bg-amber-400/60',
  danger: 'bg-red-500/70',
  muted: 'bg-gray-600/50',
  special: 'bg-violet-400/60',
}

const HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 6px)',
}

const KIND_WORD: Partial<Record<TimelineItem['kind'], string>> = { plan: 'Plan', task: 'Task', step: 'Step', routing: 'Routing', agent: 'Agent', run: 'Run' }

const INDENT_PX = 12

export interface TimelineGanttProps {
  lanes: ReadonlyArray<TimelineLane>
  selectedId?: string | null
  onSelect?: (item: TimelineItem) => void
  labels?: TimelineLabels
  /** Compact (chat strip) or roomy (page). */
  density?: 'compact' | 'comfortable'
  /** Draw only the last N rows of a lane (the rest behind a button). A long conversation has thousands. */
  maxItems?: number
  /** Tailwind max-height class of the scroller; none = the chart takes the room it needs. */
  maxHeightClass?: string
  className?: string
}

/** A clock that ticks once a second while something is running, and not at all otherwise. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template)
}

function offsetLabel(ms: number): string {
  return `+${formatItemDuration(ms) ?? '0 ms'}`
}

function Break({ at, ms, labels }: { at: GanttBreak['pct']; ms: number; labels: TimelineLabels }) {
  return (
    <span
      aria-hidden="true"
      title={fill(labels.idle, { d: formatItemDuration(ms) ?? '' })}
      className="absolute inset-y-0 w-0 border-l border-dashed border-white/25"
      style={{ left: `${at}%` }}
    />
  )
}

interface RowProps {
  row: GanttRow
  ticks: ReadonlyArray<number>
  breaks: ReadonlyArray<GanttBreak>
  selected: boolean
  labels: TimelineLabels
  tall: boolean
  onSelect?: (item: TimelineItem) => void
}

function sameRow(a: RowProps, b: RowProps): boolean {
  const x = a.row
  const y = b.row
  return (
    a.selected === b.selected && a.labels === b.labels && a.tall === b.tall && a.onSelect === b.onSelect &&
    a.ticks === b.ticks && a.breaks === b.breaks &&
    x.item.id === y.item.id && x.item.status === y.item.status && x.item.label === y.item.label && x.item.model === y.item.model &&
    x.depth === y.depth && x.leftPct === y.leftPct && x.widthPct === y.widthPct && x.end === y.end
  )
}

const Row = memo(function Row({ row, ticks, breaks, selected, labels, tall, onSelect }: RowProps) {
  const { item } = row
  const tone = STATUS_TONE[item.status]
  const statusLabel = labels.status[item.status]
  const shownMs = item.durationMs ?? (row.instant ? undefined : row.end - row.start)
  const duration = formatItemDuration(shownMs)
  const model = item.model ? shortModel(item.model) : ''
  const word = KIND_WORD[item.kind]
  const isRequest = item.kind === 'request'
  return (
    <li>
      <button
        type="button"
        data-timeline-item={item.id}
        data-status={item.status}
        aria-current={selected ? 'true' : undefined}
        aria-label={[item.label, statusLabel, duration, model].filter(Boolean).join(' — ')}
        title={[item.label, statusLabel, duration, model, item.provider].filter(Boolean).join(' — ')}
        onClick={() => onSelect?.(item)}
        className={`grid w-full items-center gap-x-2 px-2 text-left text-xs transition-colors ${COLUMNS} ${tall ? 'min-h-12 sm:min-h-9' : 'min-h-11 sm:min-h-7'} gap-y-0.5 py-1 sm:py-0 ${focusRing} ${
          selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
        } ${isRequest ? 'border-t border-white/[0.06]' : ''}`}
      >
        <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5" style={{ paddingLeft: row.depth * INDENT_PX }}>
          {item.status === 'running' ? <StatusDot tone={tone} pulse size="md" /> : <StatusIcon tone={tone} className={TONE_CLASSES[tone].text} />}
          {word && <span className="shrink-0 text-[10px] text-gray-400">{word}</span>}
          <span className={`min-w-0 truncate ${isRequest ? 'font-medium text-gray-100' : 'text-gray-300'}`}>{item.label}</span>
        </span>
        <span className="relative col-span-2 row-start-2 h-4 sm:col-span-1 sm:col-start-2 sm:row-start-1" aria-hidden="true">
          {ticks.map((pct, i) => <span key={i} className="absolute inset-y-0 w-0 border-l border-white/[0.06]" style={{ left: `${pct}%` }} />)}
          {breaks.map((b) => <Break key={b.pct} at={b.pct} ms={b.ms} labels={labels} />)}
          {row.instant ? (
            <span
              className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 ${BAR_TONE[tone]}`}
              style={{ left: `${row.leftPct}%` }}
            />
          ) : (
            <span
              className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm ${BAR_TONE[tone]} ${item.kind === 'agent' || item.kind === 'run' ? 'ring-1 ring-white/30' : ''} ${
                item.status === 'running' ? 'motion-safe:animate-pulse' : ''
              }`}
              style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%`, minWidth: 3, ...(tone === 'danger' ? HATCH : null) }}
            />
          )}
        </span>
        <span className="hidden truncate font-mono text-[10px] text-gray-400 sm:col-start-3 sm:row-start-1 sm:block" data-testid="timeline-model">{model}</span>
        <span className="col-start-2 row-start-1 text-right tabular-nums text-[10px] text-gray-400 sm:col-start-4">{duration ?? '—'}</span>
      </button>
    </li>
  )
}, sameRow)

/** Arrow keys walk the rows. */
function onListKeyDown(e: KeyboardEvent<HTMLElement>) {
  const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
  if (!delta && e.key !== 'Home' && e.key !== 'End') return
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-timeline-item]'))
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : at + delta
  const target = buttons[Math.min(buttons.length - 1, Math.max(0, next))]
  if (target) {
    e.preventDefault()
    target.focus()
  }
}

/** The last `maxItems` of a lane, unless the selection hides in the rest. */
function windowed(lane: TimelineLane, maxItems: number | undefined, showAll: boolean, selectedId?: string | null): { lane: TimelineLane; hidden: number } {
  const count = lane.items.length
  if (!maxItems || showAll || count <= maxItems) return { lane, hidden: 0 }
  const cut = count - maxItems
  if (selectedId && lane.items.slice(0, cut).some((i) => i.id === selectedId)) return { lane, hidden: 0 }
  return { lane: { ...lane, items: lane.items.slice(cut) }, hidden: cut }
}

export function TimelineGantt({
  lanes, selectedId, onSelect, labels = DEFAULT_TIMELINE_LABELS, density = 'compact', maxItems, maxHeightClass = '', className = '',
}: TimelineGanttProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const scroller = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const running = lanes.some((l) => l.items.some((i) => i.status === 'running' || i.status === 'blocked'))
  const now = useNow(running)

  const windows = useMemo(
    () => lanes.filter((l) => l.items.length > 0).map((l) => windowed(l, maxItems, expanded.has(l.id), selectedId)),
    [lanes, maxItems, expanded, selectedId],
  )
  const layout = useMemo(() => layoutGantt(windows.map((w) => w.lane), now), [windows, now])
  const hiddenOf = (id: string) => windows.find((w) => w.lane.id === id)?.hidden ?? 0
  const tickPcts = useMemo(() => layout.ticks.map((t) => t.pct), [layout.ticks])

  // Follow the end while the reader is at the end; leave them alone once they scroll up.
  useEffect(() => {
    const el = scroller.current
    if (el && atEnd.current) el.scrollTop = el.scrollHeight
  }, [layout.count])

  // Bring the selected row into view (the page selects from a link, the strip from a click).
  useEffect(() => {
    if (!selectedId) return
    const row = Array.from(scroller.current?.querySelectorAll<HTMLElement>('[data-timeline-item]') ?? []).find((el) => el.dataset.timelineItem === selectedId)
    row?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedId])

  if (layout.count === 0) {
    return <p className={`px-3 py-2 text-xs text-gray-400 ${className}`}>{labels.empty}</p>
  }
  const tall = density === 'comfortable'
  const showLaneTitles = layout.sections.length > 1

  return (
    <div role="group" aria-label={labels.list} className={`min-w-0 text-xs ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-2 py-1 text-[11px] text-gray-400">
        <span>{fill(labels.calls, { n: layout.count })}</span>
        {layout.peak > 0 && <span>{fill(labels.peak, { n: layout.peak })}</span>}
        {layout.spanMs > 0 && <span className="tabular-nums">{formatItemDuration(layout.spanMs)}</span>}
      </div>
      <div
        ref={scroller}
        className={`overflow-y-auto overscroll-contain ${maxHeightClass}`}
        onScroll={(e) => {
          const el = e.currentTarget
          atEnd.current = el.scrollHeight - el.clientHeight - el.scrollTop < 24
        }}
      >
        <div className={`sticky top-0 z-10 grid items-center gap-x-2 border-b border-white/[0.08] bg-slate-900/90 px-2 py-1 backdrop-blur-sm ${COLUMNS}`}>
          <span className="hidden truncate text-[10px] text-gray-400 sm:block">{labels.parallel}</span>
          <span className="relative col-span-2 h-8 sm:col-span-1" role="img" aria-label={labels.parallel}>
            {layout.concurrency.map((c, i) => (
              <span
                key={i}
                title={`${c.n}`}
                className="absolute bottom-3 rounded-[1px] bg-indigo-400"
                style={{
                  left: `${c.leftPct}%`,
                  width: `${c.widthPct}%`,
                  minWidth: 2,
                  height: layout.peak > 0 ? `${Math.max(3, (c.n / layout.peak) * 14)}px` : 3,
                  opacity: layout.peak > 1 ? 0.35 + 0.65 * (c.n / layout.peak) : 0.7,
                }}
              />
            ))}
            {layout.ticks.map((t, i) => (
              <span key={i} className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums leading-3 text-gray-400" style={{ left: `${Math.min(Math.max(t.pct, 4), 96)}%` }}>
                {offsetLabel(t.offsetMs)}
              </span>
            ))}
            {layout.breaks.map((b) => <Break key={b.pct} at={b.pct} ms={b.ms} labels={labels} />)}
          </span>
          <span className="hidden sm:col-span-2 sm:block" />
        </div>

        {layout.sections.map(({ lane, rows }) => (
          <section key={lane.id} data-timeline-lane={lane.id}>
            {showLaneTitles && (
              <h3 className="flex min-w-0 items-baseline gap-2 px-2 pb-0.5 pt-2 text-[11px]" title={[lane.title, describeContext(lane.context)].filter(Boolean).join(' — ')}>
                <span className="truncate font-medium text-gray-300">{lane.title}</span>
                {lane.context && <span className="truncate text-[10px] text-gray-400" data-testid="timeline-lane-context">{describeContext(lane.context)}</span>}
              </h3>
            )}
            {hiddenOf(lane.id) > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((s) => new Set(s).add(lane.id))}
                className={`mx-2 my-1 min-h-8 rounded-lg border border-dashed border-white/20 px-2 text-xs text-gray-300 hover:bg-white/[0.06] ${focusRing}`}
              >
                {fill(labels.earlier, { n: hiddenOf(lane.id) })}
              </button>
            )}
            <ol aria-label={lane.title} onKeyDown={onListKeyDown}>
              {rows.map((row) => (
                <Row
                  key={row.item.id}
                  row={row}
                  ticks={tickPcts}
                  breaks={layout.breaks}
                  selected={row.item.id === selectedId}
                  labels={labels}
                  tall={tall}
                  onSelect={onSelect}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
