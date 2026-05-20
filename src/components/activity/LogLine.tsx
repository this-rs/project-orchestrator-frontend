/**
 * LogLine — single-row renderer for the ActivityLog terminal-style stream.
 *
 * Pure presentational; given a `text` (may contain ANSI SGR escapes) and a
 * severity, returns a styled `<div>` row coloring the prefix dot by severity
 * and rendering ANSI segments via `parseAnsi()`.
 *
 * Verification: accepts strings with `\x1b[…m` escapes and renders coloured
 * segments without injecting raw HTML (XSS-safe).
 */

import { memo, useMemo } from 'react'
import { parseAnsi, type AnsiSegment } from '@/utils/ansi'

export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'success'

export interface LogLineProps {
  /** Raw text — may include ANSI SGR escape codes. */
  text: string
  /** Severity drives the leading dot color + the default text tone. */
  severity?: LogSeverity
  /** Optional ISO timestamp rendered on the left, dimmed. */
  timestamp?: string
  /** Optional source label (e.g. run_id short) — rendered before text. */
  source?: string
  /** Whether the line is currently highlighted (active jump target). */
  highlighted?: boolean
  /** Click handler — used to jump to the source RunCard. */
  onClick?: () => void
}

const SEVERITY_DOT: Record<LogSeverity, string> = {
  debug: 'bg-gray-500',
  info: 'bg-blue-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
  success: 'bg-green-400',
}

const SEVERITY_TEXT_FALLBACK: Record<LogSeverity, string> = {
  debug: 'text-gray-500',
  info: 'text-gray-200',
  warn: 'text-amber-200',
  error: 'text-red-300',
  success: 'text-green-200',
}

function fmtTime(iso?: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function segmentClass(seg: AnsiSegment): string {
  let c = ''
  if (seg.bold) c += ' font-semibold'
  if (seg.dim) c += ' opacity-60'
  if (seg.italic) c += ' italic'
  if (seg.underline) c += ' underline'
  return c.trim()
}

export const LogLine = memo(function LogLine({
  text,
  severity = 'info',
  timestamp,
  source,
  highlighted = false,
  onClick,
}: LogLineProps) {
  const segments = useMemo(() => parseAnsi(text), [text])
  const clickable = Boolean(onClick)
  const time = fmtTime(timestamp)

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`
        group flex items-start gap-2 px-2 py-0.5 font-mono text-[11px] leading-5
        ${clickable ? 'cursor-pointer hover:bg-white/[0.04]' : ''}
        ${highlighted ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/30' : ''}
        ${SEVERITY_TEXT_FALLBACK[severity]}
      `.replace(/\s+/g, ' ').trim()}
    >
      <span
        className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[severity]}`}
        aria-hidden
      />
      {time && (
        <span className="text-gray-600 flex-shrink-0 tabular-nums select-none">
          {time}
        </span>
      )}
      {source && (
        <span className="text-gray-500 flex-shrink-0 truncate max-w-[8rem]" title={source}>
          [{source}]
        </span>
      )}
      <span className="whitespace-pre-wrap break-all min-w-0 flex-1">
        {segments.length === 0 ? (
          text
        ) : (
          segments.map((seg, i) => (
            <span
              key={i}
              className={segmentClass(seg)}
              style={seg.color ? { color: seg.color } : undefined}
            >
              {seg.text}
            </span>
          ))
        )}
      </span>
    </div>
  )
})

export default LogLine
