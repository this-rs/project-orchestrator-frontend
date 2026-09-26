import { useState } from 'react'
import type { BackgroundActivityMetadata, ContentBlock } from '@/types'
import { Activity, ChevronRight } from 'lucide-react'

interface BackgroundActivityBlockProps {
  block: ContentBlock
}

/** Trim a tick to a single short line for the collapsed summary. */
function shortContent(content: string, max = 80): string {
  const line = content.split('\n')[0]?.trim() ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function localTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * F10 (plan 5985a7c4) — orphan background output. Renders the ticks a
 * background sub-agent emitted when their parent tool_use block is not
 * in the loaded window. Deliberately calm and secondary: one collapsed
 * line by default, expandable to the retained entries, using the same
 * visual language as ToolCallBlock's nested child outputs.
 */
export function BackgroundActivityBlock({ block }: BackgroundActivityBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const meta = (block.metadata ?? {}) as unknown as Partial<BackgroundActivityMetadata>
  const entries = meta.entries ?? []
  const count = meta.count ?? entries.length
  const label = meta.subagent_type ?? meta.description ?? meta.source ?? 'background'
  const last = entries[entries.length - 1]
  const lastText = shortContent(last?.content ?? block.content)
  const hidden = Math.max(0, count - entries.length)

  return (
    <div
      className="my-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] overflow-hidden"
      data-testid="background-activity-block"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] text-gray-500 hover:bg-white/[0.02] transition-colors"
      >
        <ChevronRight
          className={`w-3 h-3 text-gray-600 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <Activity className="w-3 h-3 text-gray-500 shrink-0" />
        <span className="shrink-0">Background activity</span>
        <span className="text-gray-600 shrink-0">·</span>
        <span className="font-mono text-gray-400 truncate max-w-[12rem] shrink-0" title={label}>
          {label}
        </span>
        <span className="text-gray-600 shrink-0">·</span>
        <span className="shrink-0">{count} event{count === 1 ? '' : 's'}</span>
        {lastText && (
          <>
            <span className="text-gray-600 shrink-0">·</span>
            <span className="font-mono text-gray-500 truncate" title={last?.content ?? block.content}>
              last: {lastText}
            </span>
          </>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2">
          {meta.description && meta.subagent_type && (
            <div className="mb-1 text-[10px] text-gray-500 truncate" title={meta.description}>
              {meta.description}
            </div>
          )}
          <ul
            className="max-h-40 overflow-y-auto rounded border border-white/[0.04] bg-white/[0.02] divide-y divide-white/[0.04]"
            aria-label={`${count} background event${count === 1 ? '' : 's'} from ${label}`}
          >
            {hidden > 0 && (
              <li className="px-2 py-1 text-[10px] font-mono text-gray-600">
                … {hidden} earlier event{hidden === 1 ? '' : 's'} not kept
              </li>
            )}
            {entries.map((out, i) => (
              <li
                key={`${out.received_at}-${i}`}
                className="px-2 py-1 flex gap-2 text-[10px] font-mono"
              >
                <span className="text-gray-600 shrink-0">{localTime(out.received_at)}</span>
                <span className="text-gray-500 shrink-0">{out.source}</span>
                <span className="text-gray-300 truncate" title={out.content}>
                  {out.content}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
