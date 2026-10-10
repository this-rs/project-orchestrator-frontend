/**
 * TraceView — a conversation as a trace (Perfetto / Jaeger style).
 *
 * Left: the span tree (session → turn → tool call → sub-agent → its calls),
 * foldable. Right: each span as a bar on ONE time axis, with a ruler in time
 * since the first event (absolute time on hover). Above: the whole
 * conversation as a minimap with the visible window on it.
 *
 * - Zoom: Ctrl/⌘ + wheel, W/S, the buttons, a pinch; double-click a span to
 *   frame it. Pan: drag, A/D, a sideways wheel, the minimap. 0 = show everything.
 * - Long silences are cut and labelled with their real length (`axis.ts`).
 * - A running span grows live; the view follows the end until the reader moves it.
 * - Choosing a span opens its detail: beside the trace when there is room,
 *   below it otherwise, as a bottom sheet on a phone.
 * - Thousands of spans: only the rows in view are rendered (fixed row height).
 *
 * Reusable and controlled: it knows nothing about chat or routes. Give it
 * lanes (see `buildConversationTimeline` / `buildTimeline`).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Radio, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { StatusDot, StatusIcon } from '@/components/ui'
import { focusRing, focusRingInset } from '@/components/ui/classes'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import { buildAxis, toX, type Axis } from './axis'
import { concurrencyOf } from './gantt'
import type { TimelineItem, TimelineLane } from './model'
import { DEFAULT_TIMELINE_LABELS, STATUS_TONE, describeContext, formatItemDuration, runNote, type TimelineLabels } from './status'
import { TraceDetail } from './TraceDetail'
import { TraceMinimap } from './TraceMinimap'
import { KIND_BAR, KIND_SWATCH, statusBar } from './traceStyle'
import { ancestorsOf, buildTraceTree, visibleRows, type TraceNode, type TraceTree } from './trace'
import {
  PAN_STEP, ZOOM_STEP, breaksIn, clampView, dragView, fitView, focusView, followView, formatClock, formatOffset, isFit,
  panView, pinchView, ticksFor, timeAt, viewPct, zoomView, type View,
} from './viewport'

/** Below this width (of the component, not the screen) the trace is one column and the detail a bottom sheet. */
const WIDE_PX = 640
/** From this width the detail sits beside the trace. */
const SIDE_PX = 1100
const ROW_PX = { compact: 28, comfortable: 32, phone: 52 } as const
const INDENT_PX = 14
const OVERSCAN = 8
/** A drag shorter than this is a click. */
const DRAG_SLOP_PX = 4
const TREE_COLUMN = 'minmax(11rem, 36%)'

export interface TraceViewProps {
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
  className?: string
}

/** Width of an element, 0 where it cannot be measured (tests). */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      setWidth((prev) => (prev === w ? prev : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** A clock that ticks while something runs, and not at all otherwise. */
function useNow(active: boolean, everyMs = 500): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [active, everyMs])
  return now
}

const fill = (template: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template)

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

interface RowProps {
  node: TraceNode
  top: number
  height: number
  view: View
  axis: Axis | null
  wide: boolean
  selected: boolean
  focused: boolean
  expanded: boolean
  labels: TimelineLabels
  setSize: number
  posInSet: number
  onToggle: (key: string) => void
  onChoose: (key: string) => void
  onZoom: (key: string) => void
}

function sameRow(a: RowProps, b: RowProps): boolean {
  const x = a.node
  const y = b.node
  return (
    x.key === y.key && x.start === y.start && x.end === y.end && x.running === y.running && x.depth === y.depth &&
    x.children.length === y.children.length && x.item?.status === y.item?.status && x.item?.label === y.item?.label &&
    x.lane.title === y.lane.title &&
    a.top === b.top && a.height === b.height && a.view.x0 === b.view.x0 && a.view.x1 === b.view.x1 && a.axis === b.axis &&
    a.wide === b.wide && a.selected === b.selected && a.focused === b.focused && a.expanded === b.expanded &&
    a.labels === b.labels && a.setSize === b.setSize && a.posInSet === b.posInSet
  )
}

/** "≈" before a duration the engine may have measured short (a wait it missed). */
function IncompleteMark({ label }: { label: string }) {
  return (
    <span className="me-0.5 text-amber-300" title={label} data-testid="timing-incomplete">
      <span aria-hidden="true">≈</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

function Bar({ node, view, axis }: { node: TraceNode; view: View; axis: Axis | null }) {
  if (!axis || node.start == null || node.end == null) return null
  const left = viewPct(view, toX(axis, node.start))
  const right = viewPct(view, toX(axis, node.end))
  if (right < -1 || left > 101) return null
  const kind = node.item?.kind
  const fillClass = node.type === 'lane' && !node.item ? 'bg-white/20' : KIND_BAR[kind ?? 'run']
  const status = node.item?.status ?? (node.running ? 'running' : 'done')
  const pattern = statusBar(status)
  if (node.instant || right - left < 0.15) {
    return (
      <span
        className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ${KIND_SWATCH[kind ?? 'marker']} ${pattern.className}`}
        style={{ left: `${left}%` }}
      />
    )
  }
  const from = Math.max(left, -1)
  const to = Math.min(right, 101)
  return (
    <span
      className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-sm ${fillClass} ${pattern.className}`}
      style={{ left: `${from}%`, width: `${to - from}%`, minWidth: 3, ...pattern.style }}
    />
  )
}

const Row = memo(function Row({ node, top, height, view, axis, wide, selected, focused, expanded, labels, setSize, posInSet, onToggle, onChoose, onZoom }: RowProps) {
  const L = labels.trace
  const item = node.item
  const isLane = node.type === 'lane'
  const tone = item ? STATUS_TONE[item.status] : node.running ? STATUS_TONE.running : STATUS_TONE.done
  const statusWord = item ? labels.status[item.status] : node.running ? labels.status.running : ''
  const duration = node.start != null ? formatItemDuration(node.totalMs) : null
  const kindWord = item ? L.kind[item.kind] : L.kind.run
  const relation = node.lane.relation === 'child' ? L.child : node.lane.relation === 'relay' ? L.relay : ''
  const title = isLane ? node.lane.title : (item?.label ?? '')
  const context = isLane ? [relation, describeContext(node.lane.context ?? (item ? { provider: item.provider, model: item.model } : undefined))].filter(Boolean).join(' · ') : ''
  const self = node.children.length > 0 && node.start != null ? `${L.detail.self}: ${formatItemDuration(node.selfMs)}` : ''
  const timingNote = runNote(item, L.detail)
  const hasChildren = node.children.length > 0
  const indent = node.depth * (wide ? INDENT_PX : 10)

  const label = (
    <span className="flex min-w-0 items-center gap-1.5" style={{ paddingInlineStart: indent }}>
      {hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(node.key)
          }}
          className={`-my-1 inline-flex shrink-0 items-center justify-center rounded text-gray-400 hover:bg-white/[0.08] hover:text-gray-200 ${wide ? 'size-6' : 'h-11 w-9'}`}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5 rtl:-scale-x-100" />}
        </button>
      ) : (
        <span className={`shrink-0 ${wide ? 'w-6' : 'w-9'}`} aria-hidden="true" />
      )}
      {node.running ? <StatusDot tone={tone} pulse size="md" /> : item ? <StatusIcon tone={tone} className={TONE_CLASSES[tone].text} /> : null}
      {item && <span aria-hidden="true" className={`size-2 shrink-0 rounded-sm ${KIND_SWATCH[item.kind]}`} />}
      <span className={`min-w-0 truncate ${isLane || item?.kind === 'request' ? 'font-medium text-gray-100' : 'text-gray-300'}`}>{title}</span>
      {context && <span className="hidden min-w-0 shrink truncate text-[10px] text-gray-400 sm:inline">{context}</span>}
    </span>
  )
  const track = (
    <span className="relative block h-full min-w-0 overflow-hidden" data-track="true" onDoubleClick={() => onZoom(node.key)}>
      {node.start == null ? <span className="absolute inset-y-0 start-1 flex items-center text-[10px] italic text-gray-500">{L.noDate}</span> : <Bar node={node} view={view} axis={axis} />}
    </span>
  )

  return (
    <div
      role="treeitem"
      aria-level={node.depth + 1}
      aria-setsize={setSize}
      aria-posinset={posInSet}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
      aria-label={[kindWord, title, statusWord, duration, self, timingNote, item?.model].filter(Boolean).join(' — ')}
      title={[title, statusWord, duration, self, timingNote, item?.provider, item?.model].filter(Boolean).join(' — ')}
      tabIndex={focused ? 0 : -1}
      data-row-key={node.key}
      data-timeline-item={item?.id}
      data-status={item?.status}
      onClick={() => onChoose(node.key)}
      className={`absolute inset-x-0 cursor-default select-none text-xs ${focusRingInset} ${
        selected ? 'bg-indigo-400/15' : 'hover:bg-white/[0.04]'
      } ${isLane ? 'border-t border-white/[0.08]' : ''}`}
      style={{ top, height }}
    >
      {wide ? (
        <div className="grid h-full items-center gap-x-2 pe-2" style={{ gridTemplateColumns: `${TREE_COLUMN} minmax(0,1fr) 4rem` }}>
          {label}
          {track}
          <span className="text-end tabular-nums text-[10px] text-gray-400">{item?.timingIncomplete && <IncompleteMark label={L.detail.incomplete} />}{duration ?? '—'}</span>
        </div>
      ) : (
        <div className="flex h-full flex-col justify-center px-1">
          <div className="flex min-h-0 items-center gap-2">
            <span className="min-w-0 flex-1">{label}</span>
            <span className="shrink-0 tabular-nums text-[11px] text-gray-400">{item?.timingIncomplete && <IncompleteMark label={L.detail.incomplete} />}{duration ?? '—'}</span>
          </div>
          <div className="h-3.5">{track}</div>
        </div>
      )}
    </div>
  )
}, sameRow)

function ToolButton({ label, onClick, pressed, wide, children }: { label: string; onClick: () => void; pressed?: boolean; wide: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors ${wide ? 'size-8' : 'size-11'} ${
        pressed ? 'bg-indigo-400/20 text-indigo-200' : 'text-gray-300 hover:bg-white/[0.06] hover:text-gray-100'
      } ${focusRing}`}
    >
      {children}
    </button>
  )
}

export function TraceView({
  lanes, selectedId, onSelect, onOpen, labels = DEFAULT_TIMELINE_LABELS, density = 'compact', maxRowsHeight = 480,
  loading = null, failed = false, onRetry, detail = 'side', className = '',
}: TraceViewProps) {
  const L = labels.trace
  const rootRef = useRef<HTMLDivElement>(null)
  const width = useWidth(rootRef)
  const wide = width === 0 || width >= WIDE_PX
  const side = detail === 'side' && width >= SIDE_PX
  const rowH = wide ? ROW_PX[density] : ROW_PX.phone

  const running = useMemo(() => lanes.some((l) => l.span?.status === 'running' || l.items.some((i) => i.status === 'running' || i.status === 'blocked')), [lanes])
  const now = useNow(running)
  const tree: TraceTree = useMemo(() => buildTraceTree(lanes, now), [lanes, now])
  const axis = useMemo(() => buildAxis(tree.intervals), [tree])
  const total = axis?.total ?? 1

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const rows = useMemo(() => visibleRows(tree, collapsed), [tree, collapsed])
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.key, i])), [rows])
  const siblings = useMemo(() => {
    const m = new Map<string, [number, number]>()
    for (const node of tree.nodes.values()) node.children.forEach((k, i) => m.set(k, [i + 1, node.children.length]))
    tree.roots.forEach((k, i) => m.set(k, [i + 1, tree.roots.length]))
    return m
  }, [tree])

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

  // Selection (controlled by `selectedId` when given) and keyboard focus.
  const keyOfItem = useCallback((id: string | null | undefined) => {
    if (!id) return null
    if (tree.nodes.has(id)) return id
    for (const n of tree.nodes.values()) if (n.item?.id === id) return n.key
    return null
  }, [tree])
  const [selectedKey, setSelectedKey] = useState<string | null>(() => keyOfItem(selectedId))
  useEffect(() => {
    if (selectedId === undefined) return
    setSelectedKey(keyOfItem(selectedId))
  }, [selectedId, keyOfItem])
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const focusPending = useRef(false)
  const selected = selectedKey ? tree.nodes.get(selectedKey) ?? null : null

  // Scrolling (virtualised rows).
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const bodyH = Math.max(rowH, Math.min(rows.length * rowH, maxRowsHeight))
  const first = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((scrollTop + bodyH) / rowH) + OVERSCAN)
  const scrollToIndex = useCallback((i: number) => {
    const el = scroller.current
    if (!el || i < 0) return
    const top = i * rowH
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight
    setScrollTop(el.scrollTop)
  }, [rowH])

  // A selection from outside (a link): unfold its ancestors and bring it into view.
  useEffect(() => {
    if (!selectedKey) return
    const up = ancestorsOf(tree, selectedKey).filter((k) => collapsed.has(k))
    if (up.length > 0) {
      setCollapsed((prev) => {
        const next = new Set(prev)
        up.forEach((k) => next.delete(k))
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, tree])
  useEffect(() => {
    if (selectedKey) scrollToIndex(indexOf.get(selectedKey) ?? -1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  // Keyboard focus follows `focusedKey` once the row is rendered.
  useEffect(() => {
    if (!focusPending.current || !focusedKey) return
    focusPending.current = false
    const el = Array.from(scroller.current?.querySelectorAll<HTMLElement>('[data-row-key]') ?? []).find((r) => r.dataset.rowKey === focusedKey)
    el?.focus({ preventScroll: true })
  })

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const suppressClick = useRef(false)
  const choose = useCallback((key: string) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setSelectedKey(key)
    setFocusedKey(key)
    onSelect?.(tree.nodes.get(key)?.item ?? null)
  }, [onSelect, tree])

  const zoomOn = useCallback((key: string) => {
    const node = tree.nodes.get(key)
    if (!axis || node?.start == null || node.end == null) return
    move(focusView(toX(axis, node.start), toX(axis, node.end), total))
  }, [axis, move, total, tree])

  const closeDetail = useCallback(() => {
    const back = selectedKey
    setSelectedKey(null)
    onSelect?.(null)
    if (back) {
      setFocusedKey(back)
      focusPending.current = true
    }
  }, [onSelect, selectedKey])

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

  // Hover read-out (mouse only).
  const [hover, setHover] = useState<number | null>(null)

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
      // One finger left: go on as a drag from where it is.
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

  // Keys: W/S zoom, A/D pan, 0 everything (anywhere in the trace); arrows walk the tree.
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
  const onTreeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = focusedKey ?? rows[0]?.key
    if (!key) return
    const i = indexOf.get(key) ?? 0
    const node = tree.nodes.get(key)
    let target: string | undefined
    switch (e.key) {
      case 'ArrowDown': target = rows[Math.min(rows.length - 1, i + 1)]?.key; break
      case 'ArrowUp': target = rows[Math.max(0, i - 1)]?.key; break
      case 'Home': target = rows[0]?.key; break
      case 'End': target = rows[rows.length - 1]?.key; break
      case 'PageDown': target = rows[Math.min(rows.length - 1, i + Math.floor(bodyH / rowH))]?.key; break
      case 'PageUp': target = rows[Math.max(0, i - Math.floor(bodyH / rowH))]?.key; break
      case 'ArrowRight':
        if (node && node.children.length > 0) {
          if (collapsed.has(key)) toggle(key)
          else target = node.children[0]
        }
        break
      case 'ArrowLeft':
        if (node && node.children.length > 0 && !collapsed.has(key)) toggle(key)
        else target = node?.parentKey
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(key)
        return
      case 'z':
      case 'Z':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          zoomOn(key)
        }
        return
      default:
        return
    }
    e.preventDefault()
    if (target) {
      setFocusedKey(target)
      focusPending.current = true
      scrollToIndex(indexOf.get(target) ?? -1)
    }
  }

  const empty = tree.spanCount === 0
  const zoomed = axis ? !isFit(view, total) : false
  const statusLine = loading ? (
    <p className="flex items-center gap-2 px-2 py-1 text-[11px] text-gray-300" role="status" data-testid="trace-loading">
      <StatusDot tone="progress" pulse size="md" />
      {loading.total > 0 ? fill(L.loading, { loaded: loading.loaded, total: loading.total }) : L.loadingStart}
    </p>
  ) : failed ? (
    <p className="flex flex-wrap items-center gap-2 px-2 py-1 text-[11px] text-amber-200" role="alert">
      {L.failed}
      {onRetry && (
        <button type="button" onClick={onRetry} className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-indigo-300 hover:bg-white/[0.06] ${focusRing}`}>
          <RotateCw className="size-3.5" aria-hidden="true" />
          {L.retry}
        </button>
      )}
    </p>
  ) : null

  if (empty) {
    return (
      <div ref={rootRef} className={`min-w-0 text-xs ${className}`}>
        {statusLine}
        {!loading && <p className="px-3 py-2 text-xs text-gray-400">{labels.empty}</p>}
      </div>
    )
  }

  const hoverT = axis && hover != null ? timeAt(axis, view, hover) : null
  const detailPanel = selected && axis ? (
    <TraceDetail node={selected} origin={axis.first} labels={labels} onClose={closeDetail} onZoom={() => zoomOn(selected.key)} onOpen={onOpen} />
  ) : null
  const gridCols = wide ? { gridTemplateColumns: `${TREE_COLUMN} minmax(0,1fr) 4rem` } : undefined

  return (
    <div ref={rootRef} className={`min-w-0 text-xs ${className}`}>
      <div className={side && detailPanel ? 'flex items-start gap-3' : ''}>
        <div role="region" aria-label={L.label} className="min-w-0 flex-1" onKeyDown={onKeyDown}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 text-[11px] text-gray-400">
              <span>{fill(L.spans, { n: tree.spanCount })}</span>
              {overview.peak > 0 && <span>{fill(labels.peak, { n: overview.peak })}</span>}
              {axis && axis.last > axis.first && <span className="tabular-nums">{formatItemDuration(axis.last - axis.first)}</span>}
            </div>
            <div className="flex items-center gap-0.5">
              <ToolButton wide={wide} label={L.zoomOut} onClick={() => move(zoomView(view, 1 / ZOOM_STEP, 0.5, total), true)}><ZoomOut className="size-4" aria-hidden="true" /></ToolButton>
              <ToolButton wide={wide} label={L.zoomIn} onClick={() => move(zoomView(view, ZOOM_STEP, 0.5, total), true)}><ZoomIn className="size-4" aria-hidden="true" /></ToolButton>
              <ToolButton wide={wide} label={L.fit} pressed={!zoomed} onClick={() => setUserView(null)}><Maximize2 className="size-4" aria-hidden="true" /></ToolButton>
              <ToolButton wide={wide} label={L.follow} pressed={follow} onClick={() => setFollow((f) => !f)}><Radio className="size-4" aria-hidden="true" /></ToolButton>
            </div>
          </div>
          {statusLine}
          {axis && (
            <div className="px-1 pb-1">
              <TraceMinimap axis={axis} view={view} overview={overview} onChange={(v) => move(v)} label={L.overview} windowLabel={L.window} idleLabel={labels.idle} tall={!wide} />
            </div>
          )}
          <p className="px-1 pb-1 text-[10px] text-gray-400">{wide ? L.help : L.helpTouch}</p>

          <div
            ref={gestureRef}
            className="relative touch-pan-y"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
            onClickCapture={onClickCapture}
          >
            {/* Ruler */}
            <div className={`border-b border-white/[0.08] ${wide ? 'grid items-end gap-x-2 pe-2' : 'px-1'}`} style={gridCols}>
              {wide && <span className="truncate pb-1 ps-2 text-[10px] text-gray-400">{L.column}</span>}
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
                  <span className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950 px-1 text-[10px] tabular-nums text-gray-100 ring-1 ring-white/20" style={{ left: `${Math.min(Math.max(hover * 100, 8), 92)}%` }} data-testid="trace-hover-time">
                    {formatClock(hoverT)} · {axis ? formatOffset(hoverT - axis.first, Math.min(step, 100)) : ''}
                  </span>
                )}
              </div>
              {wide && <span className="pb-1 text-end text-[10px] text-gray-400">{L.detail.total}</span>}
            </div>

            {/* Rows */}
            <div
              ref={scroller}
              role="tree"
              aria-label={L.label}
              aria-multiselectable={false}
              onKeyDown={onTreeKeyDown}
              onFocus={() => {
                if (!focusedKey && rows[0]) setFocusedKey(selectedKey ?? rows[0].key)
              }}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              className="relative overflow-y-auto overscroll-contain"
              style={{ height: bodyH }}
              tabIndex={focusedKey && indexOf.has(focusedKey) ? -1 : 0}
            >
              <div className="relative" style={{ height: rows.length * rowH }}>
                {/* Grid lines, cuts and the hover line, behind the bars */}
                <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${wide ? 'grid gap-x-2 pe-2' : 'px-1'}`} style={gridCols}>
                  {wide && <span />}
                  <span className="relative block h-full overflow-hidden">
                    {ticks.map((t) => <span key={t.t} className="absolute inset-y-0 w-0 border-s border-white/[0.06]" style={{ left: `${t.pct}%` }} />)}
                    {breaks.map((b) => <span key={b.at} className="absolute inset-y-0 border-x border-dashed border-amber-200/30 bg-amber-200/[0.04]" style={{ left: `${b.leftPct}%`, width: `${Math.max(b.widthPct, 0.5)}%` }} />)}
                    {hover != null && <span className="absolute inset-y-0 w-0 border-s border-indigo-300/60" style={{ left: `${hover * 100}%` }} />}
                  </span>
                </div>
                {rows.slice(first, last).map((node, j) => {
                  const i = first + j
                  const [pos, size] = siblings.get(node.key) ?? [1, 1]
                  return (
                    <Row
                      key={node.key}
                      node={node}
                      top={i * rowH}
                      height={rowH}
                      view={view}
                      axis={axis}
                      wide={wide}
                      selected={node.key === selectedKey}
                      focused={node.key === (focusedKey ?? rows[0]?.key)}
                      expanded={!collapsed.has(node.key)}
                      labels={labels}
                      setSize={size}
                      posInSet={pos}
                      onToggle={toggle}
                      onChoose={choose}
                      onZoom={zoomOn}
                    />
                  )
                })}
              </div>
            </div>
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

/** The detail on a phone: a sheet over the lower part of the screen; Escape or the close button dismisses it. */
function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const style: CSSProperties = { paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      data-testid="trace-sheet"
      className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-white/15 bg-slate-900 px-4 pt-2 shadow-2xl outline-none"
      style={style}
    >
      <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded bg-white/25" />
      {children}
    </div>
  )
}

