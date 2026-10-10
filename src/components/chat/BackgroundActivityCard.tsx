import { useState, type ReactNode } from 'react'
import { Activity, Bot, ChevronRight, Radar, Terminal, Workflow, type LucideIcon } from 'lucide-react'
import { useT } from '@/i18n'
import { MetaLine } from '@/components/ui/MetaLine'
import { ProgressLine } from '@/components/ui/ProgressLine'
import { StatusDot, ToneText } from '@/components/ui/Status'
import { formatCompactNumber, formatDurationMs } from '@/components/ui/format'
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

const KIND_META: Record<ActivityKind, { icon: LucideIcon }> = {
  workflow: { icon: Workflow },
  shell: { icon: Terminal },
  monitor: { icon: Radar },
  agent: { icon: Bot },
  generic: { icon: Activity },
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
  const { t } = useT()
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
          {open ? t('chatA-activity.card.showLess') : t('chatA-activity.card.showMore')}
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
  const { t } = useT()
  const [all, setAll] = useState(false)
  if (lines.length === 0) return null
  const { shown, omitted } = tailLines(lines, all ? lines.length : OUTPUT_TAIL_LINES)
  return (
    <Disclosure label={`${label} · ${t(lines.length === 1 ? 'chatA-activity.card.lineOne' : 'chatA-activity.card.lineMany', { count: lines.length })}`} defaultOpen={lines.length <= 3}>
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
          {t(omitted === 1 ? 'chatA-activity.card.earlierLineOne' : 'chatA-activity.card.earlierLineMany', { count: omitted })}
        </button>
      )}
    </Disclosure>
  )
}

function AgentList({ activity }: { activity: ActivityModel }) {
  const { t } = useT()
  const { settled, total, pct } = agentProgress(activity.agents)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <ProgressLine value={pct} label={t('chatA-activity.card.progressOf', { title: activity.title })} className="flex-1" />
        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
          {t('chatA-activity.card.agents', { settled, total })}
        </span>
      </div>
      <ul aria-label={t('chatA-activity.card.agentsOf', { title: activity.title })} className="divide-y divide-white/[0.04] rounded border border-white/[0.06]">
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
              <span className={`shrink-0 text-[11px] ${TONE_CLASSES[meta.tone].text}`}>{t(`chatA-activity.card.status.${agent.state}`)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function UsageLine({ usage }: { usage: NonNullable<ActivityModel['usage']> }) {
  const { t } = useT()
  return (
    <MetaLine
      items={[
        usage.tokens !== undefined && <span key="t" className="tabular-nums">{t('chatA-activity.card.tokens', { count: formatCompactNumber(usage.tokens) })}</span>,
        usage.toolUses !== undefined && <span key="u" className="tabular-nums">{t(usage.toolUses === 1 ? 'chatA-activity.card.toolUseOne' : 'chatA-activity.card.toolUseMany', { count: usage.toolUses })}</span>,
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
  const { t } = useT()
  if (activity.events.length === 0) return null
  return (
    <Disclosure label={`${t('chatA-activity.card.timeline')} · ${t(activity.count === 1 ? 'chatA-activity.card.eventOne' : 'chatA-activity.card.eventMany', { count: activity.count })}`}>
      <ul
        aria-label={t('chatA-activity.card.eventsOf', { title: activity.title })}
        className="max-h-40 overflow-y-auto rounded border border-white/[0.06] divide-y divide-white/[0.04]"
      >
        {activity.hiddenCount > 0 && (
          <li className="px-2 py-1 text-[11px] text-gray-600">
            {t(activity.hiddenCount === 1 ? 'chatA-activity.card.hiddenEventOne' : 'chatA-activity.card.hiddenEventMany', { count: activity.hiddenCount })}
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
  const { t } = useT()
  return (
    <Disclosure label={t('chatA-activity.card.rawPayload')}>
      <pre
        tabIndex={0}
        aria-label={t('chatA-activity.card.rawPayload')}
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
  const { t } = useT()
  const { kind } = activity
  const chips = activity.params
  return (
    <div className="space-y-2 px-3 pb-2.5 pt-1 text-xs">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label={t('chatA-activity.card.parameters')}>
          {chips.map((p) => (
            <ParamChip key={p.label} param={p} />
          ))}
        </div>
      )}

      {kind === 'workflow' && activity.agents.length > 0 && <AgentList activity={activity} />}
      {(kind === 'shell' || kind === 'monitor') && activity.command && <CommandBlock command={activity.command} />}
      {kind === 'generic' && <DetailList details={activity.details} />}
      {activity.usage && <UsageLine usage={activity.usage} />}

      <OutputTail lines={activity.outputLines} label={kind === 'agent' ? t('chatA-activity.card.latestOutput') : t('chatA-activity.card.output')} />
      <Timeline activity={activity} />
      {activity.raw && <RawPayload raw={activity.raw} />}
    </div>
  )
}

/** One line under the title while collapsed: the freshest thing worth knowing. */
function collapsedHint(activity: ActivityModel, agentsLabel: (settled: number, total: number) => string): string {
  if (activity.kind === 'workflow' && activity.agents.length > 0) {
    const { settled, total } = agentProgress(activity.agents)
    return agentsLabel(settled, total)
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
  const { t } = useT()
  const [open, setOpen] = useState(defaultOpen)
  const meta = ACTIVITY_STATUS_META[activity.status]
  const Icon = KIND_META[activity.kind].icon
  const kindLabel = t(`chatA-activity.card.kind.${activity.kind}`)
  const hint = collapsedHint(activity, (settled, total) => t('chatA-activity.card.agents', { settled, total }))
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
          <span className="sr-only">{kindLabel}: </span>
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
          <ToneText tone={meta.tone} label={t(`chatA-activity.card.status.${activity.status}`)} pulse={activity.status === 'running'} />
          {activity.durationMs !== undefined && (
            <span className="tabular-nums text-gray-500">{formatDurationMs(activity.durationMs)}</span>
          )}
        </span>
      </button>
      {open && <ActivityBody activity={activity} />}
    </div>
  )
}
