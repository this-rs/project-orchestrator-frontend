/**
 * TraceDetail — what one span of the trace is: when, how long (in total and
 * by itself), where it ran, what went in and came out, the routing decision
 * behind it, and a way back to the conversation.
 */
import { useState } from 'react'
import { ExternalLink, X, ZoomIn } from 'lucide-react'
import { StatusIcon } from '@/components/ui'
import { focusRing } from '@/components/ui/classes'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import { RoutingDetail } from './EventChain'
import { shortModel, type TimelineItem } from './model'
import { DEFAULT_TIMELINE_LABELS, STATUS_TONE, formatItemDuration, runNote, type TimelineLabels } from './status'
import type { TraceNode } from './trace'
import { KIND_SWATCH } from './traceStyle'
import { formatClock, formatOffset } from './viewport'

/** Characters of an input or output shown before "Show all". */
const SUMMARY_CHARS = 600

function asText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 text-xs">
      <dt className="w-24 shrink-0 text-gray-400">{name}</dt>
      <dd className="min-w-0 break-words tabular-nums text-gray-200">{children}</dd>
    </div>
  )
}

function Text({ title, text, labels }: { title: string; text: string; labels: TimelineLabels }) {
  const [all, setAll] = useState(false)
  if (!text) return null
  const long = text.length > SUMMARY_CHARS
  return (
    <section className="min-w-0">
      <h3 className="mb-1 text-xs text-gray-400">{title}</h3>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/30 p-2 text-xs text-gray-300">
        {long && !all ? `${text.slice(0, SUMMARY_CHARS)}…` : text}
      </pre>
      {long && (
        <button type="button" onClick={() => setAll((v) => !v)} className={`mt-1 min-h-9 rounded-md px-2 text-xs text-indigo-300 hover:bg-white/[0.06] ${focusRing}`}>
          {all ? labels.trace.detail.showLess : labels.trace.detail.showMore}
        </button>
      )}
    </section>
  )
}

export interface TraceDetailProps {
  node: TraceNode
  /** Real time of the first event, for the relative times. */
  origin: number
  labels?: TimelineLabels
  onClose?: () => void
  onZoom?: () => void
  /** Back to the conversation (a block of the transcript, a session). */
  onOpen?: (item: TimelineItem) => void
  className?: string
}

export function TraceDetail({ node, origin, labels = DEFAULT_TIMELINE_LABELS, onClose, onZoom, onOpen, className = '' }: TraceDetailProps) {
  const L = labels.trace
  const item = node.item
  const tone = item ? STATUS_TONE[item.status] : 'neutral'
  const title = item?.label ?? node.lane.title
  const kind = item ? L.kind[item.kind] : L.kind.run
  const at = (t: number) => `${formatClock(t)} (${formatOffset(t - origin, 100)})`
  const hasChildren = node.children.length > 0
  const canOpen = !!item && !!onOpen && (!!item.anchorId || !!item.sessionId || item.kind === 'request' || item.kind === 'plan' || item.kind === 'task' || item.kind === 'step')
  return (
    <div className={`flex min-w-0 flex-col gap-3 ${className}`} data-testid="trace-detail">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className={`mt-1 size-2.5 shrink-0 rounded-sm ${item ? KIND_SWATCH[item.kind] : 'bg-white/30'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-gray-400">{kind}</p>
          <h2 className="break-words text-sm font-medium text-gray-100">{title}</h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={L.detail.close}
            title={L.detail.close}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 sm:size-8 ${focusRing}`}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <dl className="flex flex-col gap-1">
        {item && (
          <Fact name={L.detail.status}>
            <span className={`inline-flex items-center gap-1.5 ${TONE_CLASSES[tone].text}`}>
              <StatusIcon tone={tone} />
              {labels.status[item.status]}
            </span>
          </Fact>
        )}
        {node.start != null ? (
          <>
            <Fact name={L.detail.total}>{formatItemDuration(node.totalMs) ?? '—'}{node.running ? ` · ${L.detail.running}` : ''}</Fact>
            {hasChildren && <Fact name={L.detail.self}>{formatItemDuration(node.selfMs) ?? '—'}</Fact>}
            <Fact name={L.detail.start}>{at(node.start)}</Fact>
            {node.end != null && !node.instant && <Fact name={L.detail.end}>{node.running ? L.detail.running : at(node.end)}</Fact>}
          </>
        ) : (
          <Fact name={L.detail.start}>{L.noDate}</Fact>
        )}
        {item && runNote(item, L.detail) && <Fact name={L.detail.status}>{runNote(item, L.detail)}</Fact>}
        {item?.model && <Fact name={L.detail.model}>{shortModel(item.model)}</Fact>}
        {item?.provider && <Fact name={L.detail.provider}>{item.provider}</Fact>}
      </dl>

      <div className="flex flex-wrap gap-2">
        {canOpen && item && (
          <button
            type="button"
            onClick={() => onOpen?.(item)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border border-white/15 px-3 text-xs text-gray-200 hover:bg-white/[0.06] sm:min-h-8 ${focusRing}`}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {item.kind === 'run' ? L.detail.openSession : L.detail.goTo}
          </button>
        )}
        {onZoom && node.start != null && (
          <button
            type="button"
            onClick={onZoom}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border border-white/15 px-3 text-xs text-gray-200 hover:bg-white/[0.06] sm:min-h-8 ${focusRing}`}
          >
            <ZoomIn className="size-3.5" aria-hidden="true" />
            {L.detail.zoom}
          </button>
        )}
      </div>

      {item && <RoutingDetail item={item} />}
      {item && <Text title={L.detail.input} text={asText(item.input)} labels={labels} />}
      {item && <Text title={L.detail.output} text={asText(item.output)} labels={labels} />}
    </div>
  )
}
