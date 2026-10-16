/**
 * What the timeline knows of one span or one bar, as the lines of the hover
 * card (`<TimelineTooltip>`).
 *
 * Pure: the words come from the labels, everything else from the item itself.
 * Called on hover AND on keyboard focus, so the card is never the only way to
 * the information — every row and every bar already carries the same facts in
 * its accessible name (`aria-label`) and in its native `title`.
 */
import { shortModel, type TimelineItem } from './model'
import { formatItemDuration, runNote, type TimelineLabels } from './status'
import { formatClock } from './viewport'

export interface HoverLine {
  /** Omitted for a sentence that stands on its own (a run note). */
  label?: string
  value: string
}

export interface HoverInfo {
  /** The item's own line (its label), or its kind when the label is empty. */
  title: string
  lines: HoverLine[]
}

export interface HoverCard {
  info: HoverInfo
  /** Position in px, relative to the container the card is drawn in. */
  x: number
  y: number
}

export function hoverInfo(item: TimelineItem, labels: TimelineLabels): HoverInfo {
  const L = labels.trace.detail
  const kindWord = labels.trace.kind[item.kind]
  const duration = formatItemDuration(
    item.durationMs ?? (item.endedAt != null ? Math.max(0, item.endedAt - item.startedAt) : undefined),
  )
  const lines: HoverLine[] = [
    { label: L.status, value: labels.status[item.status] },
    { label: L.kind, value: kindWord },
  ]
  if (item.provider) lines.push({ label: L.provider, value: item.provider })
  if (item.model) lines.push({ label: L.model, value: shortModel(item.model) })
  if (duration) lines.push({ label: L.total, value: duration })
  // The bounds: when it started, when it ended (an open span has no end yet).
  lines.push({ label: L.start, value: formatClock(item.startedAt) })
  if (item.endedAt != null) lines.push({ label: L.end, value: formatClock(item.endedAt) })
  const note = runNote(item, labels.trace.detail)
  if (note) lines.push({ value: note })
  return { title: item.label || kindWord, lines }
}
