import { useState, type ReactNode } from 'react'
import { Activity, Bot, ChevronRight, Radar, Terminal, Workflow, type LucideIcon } from 'lucide-react'
import { MetaLine } from '@/components/ui/MetaLine'
import { ProgressLine } from '@/components/ui/ProgressLine'
import { StatusDot, ToneText } from '@/components/ui/Status'
import { formatCompactNumber, formatDurationMs, pluralize } from '@/components/ui/format'
import { focusRingInset, hitArea } from '@/components/ui/classes'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import {
  ACTIVITY_STATUS_META,
  agentProgress,
  tailLines,
  type ActivityKind,
  type ActivityModel,
  type KeyValue,
} from '@/utils/backgroundActivity'

const KIND_META: Record<ActivityKind, { icon: LucideIcon; label: string }> = {
  workflow: { icon: Workflow, label: 'Workflow' },
  shell: { icon: Terminal, label: 'Background command' },
  monitor: { icon: Radar, label: 'Monitor' },
  agent: { icon: Bot, label: 'Sub-agent' },
  generic: { icon: Activity, label: 'Background activity' },
}

const OUTPUT_TAIL_LINES = 12
const LONG_TEXT_CHARS = 160
const LONG_TEXT_LINES = 3

function localTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Text clamped to 3 lines with a keyboard-reachable Show more / Show less. */
export function ExpandableText({ text, mono = false, className = '' }: { text: string; mono?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > LONG_TEXT_CHARS || text.split('\n').length > LONG_TEXT_LINES
  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className={`break-words whitespace-pre-wrap ${mono ? 'font-mono' : ''} ${long && !open ? 'line-clamp-3' : ''}`}
      >
        {text}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`${hitArea} mt-0.5 text-[11px] text-indigo-400 hover:text-indigo-300 rounded ${focusRingInset}`}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

/** Small `label value` chip — the human-readable form of a parameter. */
export function ParamChip({ param }: { param: KeyValue }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1 rounded border border-white/[0.08] px-1.5 text-[11px] leading-5 text-gray-400">
      <span className="shrink-0 text-gray-500">{param.label}</span>
      <span className={`min-w-0 truncate text-gray-300 ${param.mono ? 'font-mono' : ''}`} title={param.value}>
        {param.value}
      </span>
    </span>
  )
}

function Disclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${hitArea} flex items-center gap-1 rounded text-[11px] text-gray-500 hover:text-gray-300 ${focusRingInset}`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`w-3 h-3 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        {label}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="rounded border border-white/[0.06] bg-black/20 px-2 py-1.5 text-[11px] text-gray-200">
      <ExpandableText text={command} mono />
    </div>
  )
}

/** Monospace tail of a text stream, oldest first, with the older part collapsed. */
function OutputTail({ lines, label }: { lines: string[]; label: string }) {
  const [all, setAll] = useState(false)
  if (lines.length === 0) return null
  const { shown, omitted } = tailLines(lines, all ? lines.length : OUTPUT_TAIL_LINES)
  return (
    <Disclosure label={`${label} · ${pluralize(lines.length, 'line')}`} defaultOpen={lines.length <= 3}>
      <pre
        tabIndex={0}
        aria-label={label}
        className={`max-h-40 overflow-auto rounded border border-white/[0.06] bg-black/20 px-2 py-1.5 text-[11px] leading-4 font-mono text-gray-300 whitespace-pre-wrap break-words ${focusRingInset}`}
      >
        {shown.join('\n')}
      </pre>
      {omitted > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={`${hitArea} mt-0.5 rounded text-[11px] text-indigo-400 hover:text-indigo-300 ${focusRingInset}`}
        >
          Show {pluralize(omitted, 'earlier line')}
        </button>
      )}
    </Disclosure>
  )
}

function AgentList({ activity }: { activity: ActivityModel }) {
  const { settled, total, pct } = agentProgress(activity.agents)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <ProgressLine value={pct} label={`${activity.title} progress`} className="flex-1" />
        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
          {settled}/{total} agents
        </span>
      </div>
      <ul aria-label={`Agents of ${activity.title}`} className="divide-y divide-white/[0.04] rounded border border-white/[0.06]">
        {activity.agents.map((agent) => {
          const meta = ACTIVITY_STATUS_META[agent.state]
          return (
            <li key={agent.key} className="flex items-start gap-2 px-2 py-1 text-xs">
              <span className="mt-1.5">
                <StatusDot tone={meta.tone} pulse={agent.state === 'running'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="break-words text-gray-300">{agent.name}</span>
                {agent.detail && <span className="ml-1.5 font-mono text-[11px] text-gray-500 break-all">{agent.detail}</span>}
              </span>
              <span className={`shrink-0 text-[11px] ${TONE_CLASSES[meta.tone].text}`}>{meta.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function UsageLine({ usage }: { usage: NonNullable<ActivityModel['usage']> }) {
  return (
    <MetaLine
      items={[
        usage.tokens !== undefined && <span key="t" className="tabular-nums">{formatCompactNumber(usage.tokens)} tokens</span>,
        usage.toolUses !== undefined && <span key="u" className="tabular-nums">{pluralize(usage.toolUses, 'tool use')}</span>,
        usage.durationMs !== undefined && <span key="d" className="tabular-nums">{formatDurationMs(usage.durationMs)}</span>,
      ]}
    />
  )
}

function DetailList({ details }: { details: KeyValue[] }) {
  if (details.length === 0) return null
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
      {details.map((kv) => (
        <div key={kv.label} className="contents">
          <dt className="text-gray-500">{kv.label}</dt>
          <dd className="min-w-0 text-gray-300">
            <ExpandableText text={kv.value} mono={kv.mono} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Timeline({ activity }: { activity: ActivityModel }) {
  if (activity.events.length === 0) return null
  return (
    <Disclosure label={`Timeline · ${pluralize(activity.count, 'event')}`}>
      <ul
        aria-label={`Events of ${activity.title}`}
        className="max-h-40 overflow-y-auto rounded border border-white/[0.06] divide-y divide-white/[0.04]"
      >
        {activity.hiddenCount > 0 && (
          <li className="px-2 py-1 text-[11px] text-gray-600">
            … {pluralize(activity.hiddenCount, 'earlier event')} not kept
          </li>
        )}
        {activity.events.map((ev, i) => (
          <li key={`${ev.at}-${i}`} className="flex gap-2 px-2 py-1 text-[11px]">
            <span className="shrink-0 tabular-nums text-gray-600">{localTime(ev.at)}</span>
            <span className="shrink-0 text-gray-400">{ev.label}</span>
            <span className="min-w-0 truncate text-gray-300" title={ev.detail}>
              {ev.detail}
            </span>
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}

/** Last resort: the structured payload, pretty-printed — collapsed, never the default view. */
function RawPayload({ raw }: { raw: NonNullable<ActivityModel['raw']> }) {
  return (
    <Disclosure label="Raw payload">
      <pre
        tabIndex={0}
        aria-label="Raw payload"
        className={`max-h-48 overflow-auto rounded border border-white/[0.06] bg-black/20 px-2 py-1.5 text-[11px] leading-4 font-mono text-gray-400 ${focusRingInset}`}
      >
        {JSON.stringify(raw, null, 2)}
      </pre>
    </Disclosure>
  )
}

// ---------------------------------------------------------------------------
// Specialised bodies
// ---------------------------------------------------------------------------

function ActivityBody({ activity }: { activity: ActivityModel }) {
  const { kind } = activity
  const chips = activity.params
  return (
    <div className="space-y-2 px-3 pb-2.5 pt-1 text-xs">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Parameters">
          {chips.map((p) => (
            <ParamChip key={p.label} param={p} />
          ))}
        </div>
      )}

      {kind === 'workflow' && activity.agents.length > 0 && <AgentList activity={activity} />}
      {(kind === 'shell' || kind === 'monitor') && activity.command && <CommandBlock command={activity.command} />}
      {kind === 'generic' && <DetailList details={activity.details} />}
      {activity.usage && <UsageLine usage={activity.usage} />}

      <OutputTail lines={activity.outputLines} label={kind === 'agent' ? 'Latest output' : 'Output'} />
      <Timeline activity={activity} />
      {activity.raw && <RawPayload raw={activity.raw} />}
    </div>
  )
}

/** One line under the title while collapsed: the freshest thing worth knowing. */
function collapsedHint(activity: ActivityModel): string {
  if (activity.kind === 'workflow' && activity.agents.length > 0) {
    const { settled, total } = agentProgress(activity.agents)
    return `${settled}/${total} agents`
  }
  const last = activity.events[activity.events.length - 1]
  return last?.detail ?? ''
}

interface ActivityCardProps {
  activity: ActivityModel
  /** Start expanded (mount-time only — later status changes never move the layout). */
  defaultOpen?: boolean
  className?: string
}

export function ActivityCard({ activity, defaultOpen = false, className = '' }: ActivityCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const meta = ACTIVITY_STATUS_META[activity.status]
  const kind = KIND_META[activity.kind]
  const Icon = kind.icon
  const hint = collapsedHint(activity)
  const chipPreview = activity.params.slice(0, 3)

  return (
    <div
      className={`rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden ${className}`}
      data-testid="background-activity-card"
      data-kind={activity.kind}
      data-status={activity.status}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors motion-reduce:transition-none min-h-9 ${focusRingInset}`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`mt-0.5 w-3 h-3 shrink-0 text-gray-600 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        <Icon aria-hidden="true" className="mt-0.5 w-3.5 h-3.5 shrink-0 text-gray-500" />
        <span className="min-w-0 flex-1">
          <span className="sr-only">{kind.label}: </span>
          <span
            className={`block text-xs text-gray-200 break-words line-clamp-2 ${activity.kind === 'shell' ? 'font-mono' : ''}`}
            title={activity.title}
          >
            {activity.title}
          </span>
          {!open && (
            <MetaLine
              className="mt-0.5"
              items={[
                ...chipPreview.map((p) => (
                  <span key={p.label} className="min-w-0 truncate max-w-[14rem]" title={`${p.label}: ${p.value}`}>
                    <span className="text-gray-600">{p.label} </span>
                    <span className={p.mono ? 'font-mono' : ''}>{p.value}</span>
                  </span>
                )),
                hint && <span key="hint" className="min-w-0 truncate max-w-[16rem]" title={hint}>{hint}</span>,
              ]}
            />
          )}
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-2 text-[11px] leading-4">
          <ToneText tone={meta.tone} label={meta.label} pulse={activity.status === 'running'} />
          {activity.durationMs !== undefined && (
            <span className="tabular-nums text-gray-500">{formatDurationMs(activity.durationMs)}</span>
          )}
        </span>
      </button>
      {open && <ActivityBody activity={activity} />}
    </div>
  )
}
