/**
 * TracksView — a conversation as TRACKS, the way a sound editor shows a piece.
 *
 * Time runs across, on ONE axis (the compressed axis of `axis.ts`: long silences
 * are cut and labelled). Each row is one thing that was playing: not one row per
 * event, one row per PARALLEL action (`tracks.ts`). Left: the name of the row
 * (the turns, the tool calls, a sub-agent's own calls, the waits, the events);
 * right: its bars. The eye follows a row without climbing a tree, and what ran
 * at the same time sits one above the other.
 *
 * - Zoom: Ctrl/⌘ + wheel, W/S, the buttons, a pinch; double-click a bar to
 *   frame it. Pan: drag, A/D, a sideways wheel, the minimap. 0 = show everything.
 * - Hovering a bar (or focusing it) raises a card with what is known of it —
 *   provider · model, its title, its status, its duration and its bounds — without a click.
 * - A zone (one per session) folds and unfolds from its own header. `zones="expanded"`
 *   (default) draws every row at once; `zones="collapsed"` starts them folded (the chat's
 *   short panel). A row the reader picks or tabs onto is never left in a folded zone.
 * - A running bar grows live; the view follows the end until the reader moves it.
 * - Keyboard: the bars are buttons; ← → walk a row, ↑ ↓ change row (to the bar
 *   closest in time), Home/End the ends of a row, Enter opens the detail, Z frames.
 * - Choosing a bar opens its detail: beside the tracks when there is room,
 *   below them otherwise, as a bottom sheet on a phone.
 *
 * Reusable and controlled, like `TraceView`: it knows nothing about chat or routes.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { AlertTriangle, AudioLines, ChevronRight, Maximize2, Radio, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, EmptyState, StatusDot } from '@/components/ui'
import { focusRing, focusRingInset } from '@/components/ui/classes'
import { buildAxis, toX, type Axis } from './axis'
import { concurrencyOf } from './gantt'
import type { TimelineItem, TimelineKind, TimelineLane } from './model'
import { DRAG_SLOP_PX, SIDE_PX, SKELETON_DELAY_MS, WIDE_PX, fill, isTyping, useDelayed, useNow, useWidth } from './shared'
import { BottomSheet, ToolButton } from './sharedUi'
import { DEFAULT_TIMELINE_LABELS, describeContext, formatItemDuration, runNote, type TimelineLabels } from './status'
import type { TraceNode } from './trace'
import { TraceDetail } from './TraceDetail'
import { TraceMinimap } from './TraceMinimap'
import { TraceSkeleton } from './TraceSkeleton'
import { TimelineTooltip } from './TimelineTooltip'
import { itemElement, useHoverCard } from './hoverCard'
import { KIND_BAR, KIND_SWATCH, statusBar } from './traceStyle'
import { buildTracks, findOnTracks, type Track, type TrackFamily, type TrackItem, type TrackLayout } from './tracks'
import {
  PAN_STEP, ZOOM_STEP, breaksIn, centreView, clampView, dragView, fitView, focusView, followView, formatClock, formatOffset, isFit,
  panView, pinchView, ticksFor, timeAt, viewPct, zoomView, type View,
} from './viewport'

const ROW_PX = { compact: 28, comfortable: 34, phone: 44 } as const
/** The label column: wide enough for a family name, never more than a fifth of the view. */
const LABEL_COLUMN = { wide: 'minmax(9rem, 22%)', narrow: '5.5rem' } as const
/** A bar narrower than this carries no text. */
const LABEL_MIN_PX = 44
const SKELETON_ROWS = 6

/** The colour of a family: the kind of what it holds. */
const FAMILY_KIND: Record<TrackFamily, TimelineKind> = { turns: 'request', tools: 'tool', agents: 'agent', waits: 'permission', signals: 'marker' }

export interface TracksViewProps {
  lanes: ReadonlyArray<TimelineLane>
  selectedId?: string | null
  onSelect?: (item: TimelineItem | null) => void
  /** "Show in the conversation" in the detail. Absent: no such button. */
  onOpen?: (item: TimelineItem) => void
  labels?: TimelineLabels
  density?: 'compact' | 'comfortable'
  /** Height of the rows area at most, in px. */
  maxRowsHeight?: number
  /** History still loading: `{loaded} of {total}` events. */
  loading?: { loaded: number; total: number } | null
  failed?: boolean
  onRetry?: () => void
  /** Where the detail goes when the component is wide: `side` (if there is room) or `below`. */
  detail?: 'side' | 'below'
  /** When the "fit / show everything" zoom-reset button shows: `always` (default) or only while
      `zoomed` — as `TraceView`'s `fit` (the chat's narrow panel: no resting "fit" beside its
      open-page link, but a visible way back after a zoom or a pan). */
  fit?: 'always' | 'zoomed'
  /**
   * How the zones (one per session: a group and the rows it holds) start. `expanded` (default)
   * draws every row at once, the way the full-page timeline has room for; `collapsed` folds each
   * zone to its header, for the chat's short panel. Either way the header folds and unfolds its
   * own zone, one by one, and a row the reader picks or tabs onto is never left hidden.
   */
  zones?: 'expanded' | 'collapsed'
  className?: string
}

/** The key of the zone (group row) a track belongs to. */
const groupKeyOf = (laneId: string) => `group:${laneId}`

/**
 * What a row is called: its family, the sub-agent it belongs to, its number when
 * the family has several. `base` and `n` apart, so the number is drawn on its
 * own and never cut off with the name on a narrow screen.
 */
function trackName(track: Track, labels: TimelineLabels): { name: string; base: string; n: number | null } {
  const T = labels.tracks
  const base = track.agent ? fill(T.of, { agent: track.agent.label }) : T.family[track.family]
  if (track.rows <= 1) return { name: base, base, n: null }
  const n = track.row + 1
  return { name: fill(T.row, { name: base, n }), base, n }
}

interface BarProps {
  it: TrackItem
  view: View
  axis: Axis
  trackW: number
  selected: boolean
  focused: boolean
  labels: TimelineLabels
  onChoose: (id: string) => void
  onZoom: (id: string) => void
}

function sameBar(a: BarProps, b: BarProps): boolean {
  return (
    a.it.item === b.it.item && a.it.start === b.it.start && a.it.end === b.it.end && a.it.item.status === b.it.item.status && a.it.item.label === b.it.item.label &&
    a.view.x0 === b.view.x0 && a.view.x1 === b.view.x1 && a.axis === b.axis && a.trackW === b.trackW &&
    a.selected === b.selected && a.focused === b.focused && a.labels === b.labels
  )
}

/** One bar: a button the row's full height (the tap target), the coloured stretch inside it. */
const Bar = memo(function Bar({ it, view, axis, trackW, selected, focused, labels, onChoose, onZoom }: BarProps) {
  const { item } = it
  const left = viewPct(view, toX(axis, it.start))
  const right = viewPct(view, toX(axis, it.end))
  const L = labels.trace
  const duration = formatItemDuration(it.end - it.start)
  const note = runNote(item, L.detail)
  const name = [L.kind[item.kind], item.label, labels.status[item.status], it.instant ? null : duration, note, item.model].filter(Boolean).join(' — ')
  const pattern = statusBar(item.status)
  const dot = it.instant || right - left < 0.15
  const from = Math.max(left, -1)
  const to = Math.min(right, 101)
  const widthPx = ((to - from) / 100) * trackW
  const common = {
    type: 'button' as const,
    'aria-label': name,
    'aria-pressed': selected,
    title: name,
    tabIndex: focused ? 0 : -1,
    'data-timeline-item': item.id,
    'data-status': item.status,
    onClick: () => onChoose(item.id),
    onDoubleClick: () => onZoom(item.id),
  }
  if (dot) {
    return (
      <button
        {...common}
        className={`absolute inset-y-0 w-4 -translate-x-1/2 ${focusRingInset} ${selected ? 'bg-indigo-400/15' : ''}`}
        style={{ left: `${left}%` }}
      >
        <span aria-hidden="true" className={`absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ${KIND_SWATCH[item.kind]} ${pattern.className}`} />
      </button>
    )
  }
  return (
    <button
      {...common}
      className={`absolute inset-y-0 ${focusRingInset}`}
      style={{ left: `${from}%`, width: `${to - from}%`, minWidth: 3 }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-1/2 flex h-4 -translate-y-1/2 items-center overflow-hidden rounded-sm px-1 ${KIND_BAR[item.kind]} ${pattern.className} ${
          selected ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-slate-900' : ''
        }`}
        style={pattern.style}
      >
        {widthPx >= LABEL_MIN_PX && <span className="truncate text-[10px] font-medium leading-none text-white/90">{item.label}</span>}
      </span>
    </button>
  )
}, sameBar)

export function TracksView({
  lanes, selectedId, onSelect, onOpen, labels = DEFAULT_TIMELINE_LABELS, density = 'compact', maxRowsHeight = 480,
  loading = null, failed = false, onRetry, detail = 'side', fit = 'always', zones = 'expanded', className = '',
}: TracksViewProps) {
  const L = labels.trace
  const T = labels.tracks
  const rootRef = useRef<HTMLDivElement>(null)
  const width = useWidth(rootRef)
  const wide = width === 0 || width >= WIDE_PX
  const side = detail === 'side' && width >= SIDE_PX
  const rowH = wide ? ROW_PX[density] : ROW_PX.phone
  const gridCols = { gridTemplateColumns: `${wide ? LABEL_COLUMN.wide : LABEL_COLUMN.narrow} minmax(0,1fr)` }

  const running = useMemo(() => lanes.some((l) => l.span?.status === 'running' || l.items.some((i) => i.status === 'running' || i.status === 'blocked')), [lanes])
  const now = useNow(running)
  const layout: TrackLayout = useMemo(() => buildTracks(lanes, now), [lanes, now])
  const axis = useMemo(() => buildAxis(layout.intervals), [layout])
  const total = axis?.total ?? 1
  const laneOf = useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes])

  // The rows on screen: a header per zone (the session), then its tracks — and only the tracks
  // of the zones that are open (the chat's short panel starts with them folded, one by one).
  type Row = { kind: 'group'; lane: TimelineLane; key: string } | { kind: 'track'; track: Track; key: string }
  const defaultZoneOpen = zones === 'expanded'
  /** What the reader folded or unfolded themselves; anything untouched follows `zones`. */
  const [zoneToggled, setZoneToggled] = useState<Record<string, boolean>>({})
  const toggleZone = useCallback((key: string) => {
    setZoneToggled((prev) => ({ ...prev, [key]: !(prev[key] ?? defaultZoneOpen) }))
  }, [defaultZoneOpen])
  const rows: Row[] = useMemo(
    () => layout.groups.flatMap((g) => {
      const key = groupKeyOf(g.lane.id)
      const header = { kind: 'group' as const, lane: g.lane, key }
      if (!(zoneToggled[key] ?? defaultZoneOpen)) return [header]
      return [header, ...g.tracks.map((track) => ({ kind: 'track' as const, track, key: track.key }))]
    }),
    [layout, zoneToggled, defaultZoneOpen],
  )

  // The view: null = everything. Following = the right edge stays on the end while something runs.
  const [userView, setUserView] = useState<View | null>(null)
  const [follow, setFollow] = useState(true)
  const view: View = useMemo(
    () => (!axis ? { x0: 0, x1: 1 } : userView == null ? fitView(total) : follow && running ? followView(userView, total) : clampView(userView, total)),
    [axis, userView, follow, running, total],
  )
  const viewRef = useRef(view)
  viewRef.current = view
  const move = useCallback((next: View, keepFollow = false) => {
    setUserView(next)
    if (!keepFollow) setFollow(false)
  }, [])

  // Selection (controlled by `selectedId` when given) and keyboard focus (one bar at a time).
  const [selected, setSelected] = useState<string | null>(selectedId ?? null)
  useEffect(() => {
    if (selectedId !== undefined) setSelected(selectedId)
  }, [selectedId])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focusPending = useRef(false)
  /** A bar the keyboard can reach: one that is actually drawn (its zone is open). */
  const onScreen = (id: string) => {
    const hit = findOnTracks(layout, id)
    return !!hit && (zoneToggled[groupKeyOf(hit.track.laneId)] ?? defaultZoneOpen)
  }
  const renderedTracks = useMemo(
    () => layout.tracks.filter((t) => zoneToggled[groupKeyOf(t.laneId)] ?? defaultZoneOpen),
    [layout, zoneToggled, defaultZoneOpen],
  )
  const firstBar = renderedTracks[0]?.items[0]?.item.id ?? null
  const focusTarget = focusedId && onScreen(focusedId) ? focusedId : selected && onScreen(selected) ? selected : firstBar

  const scroller = useRef<HTMLDivElement>(null)
  const bodyH = Math.max(rowH, Math.min(rows.length * rowH, maxRowsHeight))
  const scrollToRow = useCallback((key: string) => {
    const el = scroller.current
    const i = rows.findIndex((r) => r.key === key)
    if (!el || i < 0) return
    const top = i * rowH
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight
  }, [rows, rowH])

  // A selection from outside (a link): its zone opens if it was folded, and its row comes into view.
  // It is never left hidden — but folding a zone by hand does not yank the view back to it.
  const lastScrolled = useRef<string | null>(null)
  useEffect(() => {
    if (!selected || lastScrolled.current === selected) return
    const hit = findOnTracks(layout, selected)
    if (!hit) return
    const key = groupKeyOf(hit.track.laneId)
    if (!(zoneToggled[key] ?? defaultZoneOpen)) {
      setZoneToggled((prev) => ({ ...prev, [key]: true }))
      return
    }
    lastScrolled.current = selected
    scrollToRow(hit.track.key)
  }, [selected, layout, zoneToggled, defaultZoneOpen, scrollToRow])

  // Keyboard focus follows `focusedId` once the bar is rendered.
  useEffect(() => {
    if (!focusPending.current || !focusedId) return
    focusPending.current = false
    const el = Array.from(scroller.current?.querySelectorAll<HTMLElement>('[data-timeline-item]') ?? []).find((b) => b.dataset.timelineItem === focusedId)
    el?.focus({ preventScroll: true })
  })

  const itemOf = useCallback((id: string) => findOnTracks(layout, id)?.track.items.find((it) => it.item.id === id) ?? null, [layout])
  const suppressClick = useRef(false)
  const choose = useCallback((id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setSelected(id)
    setFocusedId(id)
    onSelect?.(itemOf(id)?.item ?? null)
  }, [itemOf, onSelect])

  const zoomOn = useCallback((id: string) => {
    const it = itemOf(id)
    if (!axis || !it) return
    move(focusView(toX(axis, it.start), toX(axis, it.end), total))
  }, [axis, itemOf, move, total])

  /** Pan the time window, same zoom, so that the bar `id` is in it (the arrows, a Tab onto a bar out of view). */
  const reveal = useCallback((id: string) => {
    const it = itemOf(id)
    if (!axis || !it) return
    const v = viewRef.current
    const x0 = toX(axis, it.start)
    const x1 = toX(axis, it.end)
    if (x1 >= v.x0 && x0 <= v.x1) return
    // A bar longer than the window shows its start; a shorter one sits in the middle.
    move(centreView(v, x1 - x0 > v.x1 - v.x0 ? x0 + (v.x1 - v.x0) / 2 : (x0 + x1) / 2, total))
  }, [axis, itemOf, move, total])

  const closeDetail = useCallback(() => {
    const back = selected
    setSelected(null)
    onSelect?.(null)
    // Picking the same bar again later scrolls back to it.
    lastScrolled.current = null
    if (back) {
      setFocusedId(back)
      focusPending.current = true
    }
  }, [onSelect, selected])

  // Ruler / track geometry.
  const trackRef = useRef<HTMLDivElement>(null)
  const trackW = useWidth(trackRef) || 600
  const fractionAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0.5
    return (clientX - rect.left) / rect.width
  }
  const { step, ticks } = useMemo(() => (axis ? ticksFor(axis, view, trackW) : { step: 1000, ticks: [] }), [axis, view, trackW])
  const breaks = useMemo(() => (axis ? breaksIn(axis, view) : []), [axis, view])
  const overview = useMemo(() => {
    if (!axis) return { concurrency: [], breaks: [], peak: 0 }
    const items = lanes.flatMap((l) => l.items)
    const { concurrency, peak } = concurrencyOf(items, now, (t) => (toX(axis, t) / axis.total) * 100)
    return { concurrency, peak, breaks: axis.breaks.map((b) => ({ pct: ((b.at + b.width / 2) / axis.total) * 100, ms: b.ms })) }
  }, [axis, lanes, now])

  // Hover read-out (mouse only) and the hover card: what the bar under the pointer is.
  const [hover, setHover] = useState<number | null>(null)
  const itemById = useMemo(() => {
    const m = new Map<string, TimelineItem>()
    for (const lane of lanes) {
      if (lane.span) m.set(lane.span.id, lane.span)
      for (const it of lane.items) m.set(it.id, it)
    }
    return m
  }, [lanes])
  const { card, show: showCard, hide: hideCard } = useHoverCard(labels, useCallback((id: string) => itemById.get(id), [itemById]))
  const cardAt = useCallback((el: Element | null, x: number, y: number) => showCard(el, x, y), [showCard])

  // Zoom with Ctrl/⌘ + wheel, pan with a sideways wheel (or Shift + wheel). A plain wheel scrolls the rows.
  const gestureRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = gestureRef.current
    if (!el || !axis) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        move(zoomView(v, Math.exp(-e.deltaY * 0.002), fractionAt(e.clientX), axis.total), true)
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault()
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        move(panView(v, d / Math.max(trackW, 1), axis.total))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [axis, move, trackW])

  // Drag to pan, two fingers to pinch.
  const pointers = useRef(new Map<number, number>())
  const gesture = useRef<{ kind: 'drag' | 'pinch'; start: View; x: number; from: [number, number]; moved: boolean } | null>(null)
  const rel = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    return clientX - (rect?.left ?? 0)
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!axis || (e.pointerType === 'mouse' && e.button !== 0)) return
    // A mouse pans from the bars; a finger from anywhere (vertical swipes still scroll).
    if (e.pointerType === 'mouse' && !(e.target as HTMLElement).closest('[data-track],[data-ruler]')) return
    pointers.current.set(e.pointerId, rel(e.clientX))
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) gesture.current = { kind: 'pinch', start: viewRef.current, x: 0, from: [pts[0] as number, pts[1] as number], moved: true }
    else gesture.current = { kind: 'drag', start: viewRef.current, x: rel(e.clientX), from: [0, 0], moved: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      const f = fractionAt(e.clientX)
      setHover(f >= 0 && f <= 1 ? f : null)
      // The bar under the pointer says what it is, without a click.
      const el = itemElement(e.target)
      if (el) {
        const box = e.currentTarget.getBoundingClientRect()
        cardAt(el, e.clientX - box.left + 12, e.clientY - box.top + 18)
      } else hideCard()
    }
    const g = gesture.current
    if (!g || !axis || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, rel(e.clientX))
    if (g.kind === 'pinch') {
      const pts = [...pointers.current.values()]
      if (pts.length >= 2) move(pinchView(g.start, g.from, [pts[0] as number, pts[1] as number], trackW, axis.total))
      return
    }
    const dx = rel(e.clientX) - g.x
    if (!g.moved && Math.abs(dx) < DRAG_SLOP_PX) return
    if (!g.moved) {
      g.moved = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    move(dragView(g.start, dx, trackW, axis.total))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g?.moved) suppressClick.current = true
    if (pointers.current.size === 0) gesture.current = null
    else if (g?.kind === 'pinch') {
      const [x] = [...pointers.current.values()]
      gesture.current = { kind: 'drag', start: viewRef.current, x: x as number, from: [0, 0], moved: true }
    }
  }
  const onClickCapture = (e: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.stopPropagation()
    }
  }

  // Keys: W/S zoom, A/D pan, 0 everything (anywhere in the view); arrows walk the bars.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || !axis) return
    const v = viewRef.current
    const anchor = hover ?? 0.5
    const k = e.key.toLowerCase()
    const next = k === 'w' ? zoomView(v, ZOOM_STEP, anchor, total) : k === 's' ? zoomView(v, 1 / ZOOM_STEP, anchor, total)
      : k === 'a' ? panView(v, -PAN_STEP, total) : k === 'd' ? panView(v, PAN_STEP, total) : null
    if (next) {
      e.preventDefault()
      move(next, k === 'w' || k === 's')
      return
    }
    if (k === '0') {
      e.preventDefault()
      setUserView(null)
    }
  }
  const focusBar = (id: string | undefined) => {
    if (!id) return
    setFocusedId(id)
    focusPending.current = true
    const hit = findOnTracks(layout, id)
    if (hit) {
      // A bar the keyboard walks onto is never left in a folded zone.
      const key = groupKeyOf(hit.track.laneId)
      if (!(zoneToggled[key] ?? defaultZoneOpen)) setZoneToggled((prev) => ({ ...prev, [key]: true }))
      scrollToRow(hit.track.key)
    }
    reveal(id)
  }
  const onRowsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = focusTarget
    if (!id) return
    const hit = findOnTracks(layout, id)
    if (!hit) return
    const { track, index } = hit
    const t = layout.tracks.indexOf(track)
    /** The bar of `other` closest in time to the current one. */
    const closestOn = (other: Track | undefined) => {
      if (!other || other.items.length === 0) return undefined
      const at = (track.items[index] as TrackItem).start
      return other.items.reduce((best, it) => (Math.abs(it.start - at) < Math.abs(best.start - at) ? it : best)).item.id
    }
    switch (e.key) {
      case 'ArrowRight': focusBar(track.items[Math.min(track.items.length - 1, index + 1)]?.item.id); break
      case 'ArrowLeft': focusBar(track.items[Math.max(0, index - 1)]?.item.id); break
      case 'ArrowDown': focusBar(closestOn(layout.tracks[t + 1])); break
      case 'ArrowUp': focusBar(closestOn(layout.tracks[t - 1])); break
      case 'Home': focusBar(track.items[0]?.item.id); break
      case 'End': focusBar(track.items[track.items.length - 1]?.item.id); break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(id)
        return
      case 'z':
      case 'Z':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          zoomOn(id)
        }
        return
      default:
        return
    }
    e.preventDefault()
  }

  const empty = layout.itemCount === 0
  const zoomed = axis ? !isFit(view, total) : false
  const loadingText = loading ? (loading.total > 0 ? fill(L.loading, { loaded: loading.loaded, total: loading.total }) : L.loadingStart) : ''
  const status = <p role="status" data-testid={loading ? 'trace-loading' : undefined} className="sr-only">{loadingText}</p>
  const showSkeleton = useDelayed(empty && !!loading, SKELETON_DELAY_MS)
  const retry = onRetry && (() => {
    rootRef.current?.focus({ preventScroll: true })
    onRetry()
  })
  const retryButton = retry && (
    <button type="button" onClick={retry} className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-indigo-300 hover:bg-white/[0.06] ${focusRing}`}>
      <RotateCw className="size-3.5" aria-hidden="true" />
      {L.retry}
    </button>
  )

  if (empty) {
    const nothingRead = !loading && failed
    return (
      <div ref={rootRef} tabIndex={-1} className={`min-w-0 text-xs outline-none ${className}`} aria-busy={loading ? true : undefined}>
        {status}
        {loading ? (
          showSkeleton && (
            <TraceSkeleton wide={wide} rowH={rowH} bodyH={Math.min(maxRowsHeight, rowH * SKELETON_ROWS)} gridCols={wide ? gridCols : undefined} indentPx={0} caption={L.loadingShort} />
          )
        ) : nothingRead ? (
          <div role="alert" data-testid="trace-error" className="flex flex-col items-center px-4 py-8 text-center">
            <AlertTriangle className="mb-2 size-5 text-amber-300" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm text-gray-200">{L.failedAll}</p>
            {onRetry && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
                <RotateCw className="size-3.5" aria-hidden="true" />
                {L.retry}
              </Button>
            )}
          </div>
        ) : (
          <div data-testid="trace-empty">
            <EmptyState size="sm" icon={<AudioLines aria-hidden="true" />} title={labels.empty} description={labels.emptyHint} />
          </div>
        )}
      </div>
    )
  }

  const progress = loading ? (loading.total > 0 ? Math.min(1, loading.loaded / loading.total) : null) : 0
  const progressLine = (
    <div className="relative mx-1 mb-1 h-0.5 overflow-hidden rounded-full" aria-hidden="true" data-testid="trace-progress" title={loadingText || undefined}>
      {loading && (
        progress == null
          ? <span className="absolute inset-0 bg-indigo-400/40 motion-safe:animate-pulse" />
          : <span className="absolute inset-0 origin-left bg-indigo-400/70 rtl:origin-right" style={{ transform: `scaleX(${progress})` }} />
      )}
    </div>
  )
  const failedLine = failed && !loading ? (
    <p className="flex flex-wrap items-center gap-2 px-2 py-1 text-[11px] text-amber-200" role="alert">
      {L.failed}
      {retryButton}
    </p>
  ) : null

  const hoverT = axis && hover != null ? timeAt(axis, view, hover) : null
  // The detail reads a span node: the chosen bar as one, without children (a row is flat).
  const selectedHit = selected ? findOnTracks(layout, selected) : null
  const selectedNode: TraceNode | null = selectedHit && axis
    ? (() => {
        const it = selectedHit.track.items[selectedHit.index] as TrackItem
        const lane = laneOf.get(selectedHit.track.laneId) as TimelineLane
        return { key: it.item.id, type: 'span', lane, item: it.item, depth: 0, children: [], start: it.start, end: it.end, instant: it.instant, totalMs: it.end - it.start, selfMs: it.end - it.start, running: it.item.status === 'running' }
      })()
    : null
  const detailPanel = selectedNode && axis ? (
    <TraceDetail node={selectedNode} origin={axis.first} labels={labels} onClose={closeDetail} onZoom={() => zoomOn(selectedNode.key)} onOpen={onOpen} />
  ) : null
  const stats = [
    fill(T.rows, { n: layout.tracks.length }),
    fill(L.spans, { n: layout.itemCount }),
    ...(overview.peak > 0 ? [fill(labels.peak, { n: overview.peak })] : []),
    ...(axis && axis.last > axis.first ? [formatItemDuration(axis.last - axis.first) ?? ''] : []),
  ].filter(Boolean)

  return (
    <div ref={rootRef} tabIndex={-1} className={`min-w-0 text-xs outline-none ${className}`}>
      {status}
      <div className={side && detailPanel ? 'flex items-start gap-3' : ''}>
        <div role="region" aria-label={T.label} className="min-w-0 flex-1" onKeyDown={onKeyDown}>
          <div className="flex items-center gap-x-3 px-1 pb-1" data-testid="tracks-toolbar">
            <p className="min-w-0 flex-1 truncate text-[11px] text-gray-400" title={stats.join(' · ')}>
              {stats.map((s, i) => <span key={i} className={`tabular-nums ${i > 0 ? 'ms-3' : ''}`}>{s}</span>)}
            </p>
            <div className="flex items-center gap-0.5">
              <ToolButton wide={wide} label={L.zoomOut} onClick={() => move(zoomView(view, 1 / ZOOM_STEP, 0.5, total), true)}><ZoomOut className="size-4" aria-hidden="true" /></ToolButton>
              <ToolButton wide={wide} label={L.zoomIn} onClick={() => move(zoomView(view, ZOOM_STEP, 0.5, total), true)}><ZoomIn className="size-4" aria-hidden="true" /></ToolButton>
              {(fit === 'always' || zoomed) && <ToolButton wide={wide} label={L.fit} pressed={!zoomed} onClick={() => setUserView(null)}><Maximize2 className="size-4" aria-hidden="true" /></ToolButton>}
              <ToolButton wide={wide} label={L.follow} pressed={follow} onClick={() => setFollow((f) => !f)}><Radio className="size-4" aria-hidden="true" /></ToolButton>
            </div>
          </div>
          {progressLine}
          {failedLine}
          {axis && (
            <div className="px-1 pb-1">
              <TraceMinimap axis={axis} view={view} overview={overview} onChange={(v) => move(v)} label={L.overview} windowLabel={L.window} idleLabel={labels.idle} tall={!wide} />
            </div>
          )}
          <p className="truncate px-1 pb-1 text-[10px] text-gray-400" title={wide ? T.help : T.helpTouch} data-testid="tracks-help">{wide ? T.help : T.helpTouch}</p>

          <div
            ref={gestureRef}
            className="relative touch-pan-y"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'mouse') return
              setHover(null)
              hideCard()
            }}
            // The card is also the visible counterpart of the focused bar's accessible name
            // (the bar keeps its `title` and its `aria-label`: the card is never the only way).
            onFocus={(e) => {
              const el = itemElement(e.target)
              if (!el) {
                hideCard()
                return
              }
              const box = e.currentTarget.getBoundingClientRect()
              const rect = el.getBoundingClientRect()
              cardAt(el, rect.left - box.left, rect.bottom - box.top + 4)
            }}
            onBlur={hideCard}
            onClickCapture={onClickCapture}
          >
            {/* Ruler */}
            <div className="grid items-end gap-x-2 border-b border-white/[0.08] pe-2" style={gridCols}>
              <span className="truncate pb-1 ps-2 text-[10px] text-gray-400">{T.column}</span>
              <div ref={trackRef} data-ruler="true" className="relative h-7 cursor-grab overflow-hidden active:cursor-grabbing" role="img" aria-label={L.ruler}>
                {ticks.map((t) => (
                  <span key={t.t} className="absolute bottom-0 h-2 w-0 border-s border-white/25" style={{ left: `${t.pct}%` }} title={formatClock(t.t)}>
                    <span className="absolute bottom-2 start-1 whitespace-nowrap text-[10px] tabular-nums leading-3 text-gray-300">{formatOffset(t.offsetMs, step)}</span>
                  </span>
                ))}
                {breaks.map((b) => (
                  <span
                    key={b.at}
                    className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-x border-dashed border-amber-200/50 bg-amber-200/10"
                    style={{ left: `${b.leftPct}%`, width: `${Math.max(b.widthPct, 0.5)}%` }}
                    title={fill(labels.idle, { d: formatItemDuration(b.ms) ?? '' })}
                  >
                    <span className="truncate px-0.5 text-[9px] text-amber-100">{fill(labels.idle, { d: formatItemDuration(b.ms) ?? '' })}</span>
                  </span>
                ))}
                {hoverT != null && hover != null && (
                  <span className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950 px-1 text-[10px] tabular-nums text-gray-100 ring-1 ring-white/20" style={{ left: `${Math.min(Math.max(hover * 100, 8), 92)}%` }} data-testid="tracks-hover-time">
                    {formatClock(hoverT)} · {axis ? formatOffset(hoverT - axis.first, Math.min(step, 100)) : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Rows */}
            <div
              ref={scroller}
              role="list"
              aria-label={T.label}
              onKeyDown={onRowsKeyDown}
              onFocus={(e) => {
                const id = (e.target as HTMLElement).dataset?.timelineItem
                if (id) reveal(id)
              }}
              className="relative overflow-y-auto overscroll-contain"
              style={{ height: bodyH }}
            >
              <div className="relative" style={{ height: rows.length * rowH }}>
                {/* Grid lines, cuts and the hover line, behind the bars */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid gap-x-2 pe-2" style={gridCols}>
                  <span />
                  <span className="relative block h-full overflow-hidden">
                    {ticks.map((t) => <span key={t.t} className="absolute inset-y-0 w-0 border-s border-white/[0.06]" style={{ left: `${t.pct}%` }} />)}
                    {breaks.map((b) => <span key={b.at} className="absolute inset-y-0 border-x border-dashed border-amber-200/30 bg-amber-200/[0.04]" style={{ left: `${b.leftPct}%`, width: `${Math.max(b.widthPct, 0.5)}%` }} />)}
                    {hover != null && <span className="absolute inset-y-0 w-0 border-s border-indigo-300/60" style={{ left: `${hover * 100}%` }} />}
                  </span>
                </div>
                {rows.map((row, i) => (
                  row.kind === 'group' ? (
                    <GroupRow
                      key={row.key}
                      lane={row.lane}
                      top={i * rowH}
                      height={rowH}
                      labels={labels}
                      gridCols={gridCols}
                      open={zoneToggled[row.key] ?? defaultZoneOpen}
                      onToggle={() => toggleZone(row.key)}
                    />
                  ) : (
                    <TrackRow
                      key={row.key}
                      track={row.track}
                      top={i * rowH}
                      height={rowH}
                      odd={i % 2 === 1}
                      view={view}
                      axis={axis}
                      trackW={trackW}
                      selected={selected}
                      focused={focusTarget}
                      labels={labels}
                      gridCols={gridCols}
                      onChoose={choose}
                      onZoom={zoomOn}
                    />
                  )
                ))}
              </div>
            </div>
            {card && <TimelineTooltip card={card} />}
          </div>
        </div>

        {detailPanel && side && (
          <aside className="sticky top-0 w-80 shrink-0 rounded-lg border border-white/10 bg-slate-900 p-3" aria-label={L.detail.title}>
            {detailPanel}
          </aside>
        )}
      </div>
      {detailPanel && !side && wide && (
        <section className="mt-2 rounded-lg border border-white/10 bg-slate-900 p-3" aria-label={L.detail.title}>
          {detailPanel}
        </section>
      )}
      {detailPanel && !wide && <BottomSheet label={L.detail.title} onClose={closeDetail}>{detailPanel}</BottomSheet>}
    </div>
  )
}

/**
 * The header of a zone (one session): the session, how it relates to the one opened, where it ran —
 * and the fold of the rows it holds. A plain button, so Enter and Space work without a handler.
 */
function GroupRow({ lane, top, height, labels, gridCols, open, onToggle }: { lane: TimelineLane; top: number; height: number; labels: TimelineLabels; gridCols: React.CSSProperties; open: boolean; onToggle: () => void }) {
  const L = labels.trace
  const relation = lane.relation === 'child' ? L.child : lane.relation === 'relay' ? L.relay : ''
  const context = [relation, describeContext(lane.context)].filter(Boolean).join(' · ')
  const fold = open ? L.collapse : L.expand
  return (
    <div role="listitem" data-track-group={lane.id} data-open={open} className="absolute inset-x-0 border-t border-white/[0.08] bg-white/[0.03]" style={{ top, height }}>
      <div className="grid h-full items-center gap-x-2 pe-2" style={gridCols}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${fold} · ${lane.title}`}
          title={lane.title}
          data-testid="track-zone-fold"
          className={`flex h-full min-w-0 items-center gap-1.5 ps-2 text-start ${focusRing}`}
        >
          <ChevronRight className={`size-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''} rtl:-scale-x-100`} aria-hidden="true" />
          <span className="min-w-0 truncate font-medium text-gray-100" title={lane.title}>{lane.title}</span>
        </button>
        {context ? <span className="block min-w-0 truncate text-[10px] text-gray-400" title={context}>{context}</span> : <span />}
      </div>
    </div>
  )
}

interface TrackRowProps {
  track: Track
  top: number
  height: number
  odd: boolean
  view: View
  axis: Axis | null
  trackW: number
  selected: string | null
  focused: string | null
  labels: TimelineLabels
  gridCols: React.CSSProperties
  onChoose: (id: string) => void
  onZoom: (id: string) => void
}

const TrackRow = memo(function TrackRow({ track, top, height, odd, view, axis, trackW, selected, focused, labels, gridCols, onChoose, onZoom }: TrackRowProps) {
  const { name, base, n } = trackName(track, labels)
  // Only the bars in the window are drawn (a long row may hold hundreds), and the
  // one that takes the Tab wherever it is: the keyboard never loses its way in.
  const visible = axis
    ? track.items.filter((it) => it.item.id === focused || (viewPct(view, toX(axis, it.end)) >= -1 && viewPct(view, toX(axis, it.start)) <= 101))
    : []
  return (
    <div role="listitem" data-track={track.key} className={`absolute inset-x-0 border-b border-white/[0.04] ${odd ? 'bg-white/[0.015]' : ''}`} style={{ top, height }}>
      <div className="grid h-full items-center gap-x-2 pe-2" style={gridCols}>
        <span className="flex min-w-0 items-center gap-1.5 ps-2" title={name}>
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-sm ${KIND_SWATCH[FAMILY_KIND[track.family]]}`} />
          {n == null ? (
            <span className="min-w-0 truncate text-gray-300">{base}</span>
          ) : (
            <>
              <span className="sr-only">{name}</span>
              <span aria-hidden="true" className="min-w-0 truncate text-gray-300">{base}</span>
              <span aria-hidden="true" data-row-number="" className="shrink-0 tabular-nums text-gray-400">· {n}</span>
            </>
          )}
          {track.running ? (
            <StatusDot tone="progress" pulse size="md" label={labels.status.running} />
          ) : track.blocked ? (
            <StatusDot tone="warning" pulse size="md" label={labels.status.blocked} />
          ) : null}
        </span>
        <span className="relative block h-full min-w-0 overflow-hidden" data-track="true">
          {axis && visible.map((it) => (
            <Bar key={it.item.id} it={it} view={view} axis={axis} trackW={trackW} selected={it.item.id === selected} focused={it.item.id === focused} labels={labels} onChoose={onChoose} onZoom={onZoom} />
          ))}
        </span>
      </div>
    </div>
  )
})
