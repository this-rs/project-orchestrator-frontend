import { useState, type ReactNode } from 'react'
import {
  Activity,
  Bot,
  ChevronRight,
  FileText,
  Globe,
  Info,
  ListChecks,
  MessageSquare,
  Pencil,
  Radar,
  Search,
  Terminal,
  Wrench,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useT } from '@/i18n'
import { tr } from '@/i18n/lazy'
import { MetaLine } from '@/components/ui/MetaLine'
import { ProgressLine } from '@/components/ui/ProgressLine'
import { StatusDot, ToneText } from '@/components/ui/Status'
import { formatCompactNumber, formatDurationMs } from '@/components/ui/format'
import { focusRingInset, hitArea } from '@/components/ui/classes'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import {
  ACTIVITY_STATUS_META,
  agentProgress,
  runningTool,
  tailLines,
  toolCounts,
  type ActivityKind,
  type ActivityModel,
  type KeyValue,
  type ToolTick,
} from '@/utils/backgroundActivity'

const KIND_META: Record<ActivityKind, { icon: LucideIcon }> = {
  workflow: { icon: Workflow },
  shell: { icon: Terminal },
  monitor: { icon: Radar },
  agent: { icon: Bot },
  message: { icon: MessageSquare },
  notice: { icon: Info },
  generic: { icon: Activity },
}

/**
 * One glyph per TOOL — the smallest visible difference between a read and a
 * write. A background stream names its tools (`[tool_use: Read]`), so the glyph
 * is the only thing that has to be invented here; the tool keeps its identity
 * from the transcript's own vocabulary (`BashToolRenderer`, `ReadToolRenderer`…).
 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  Bash: Terminal,
  BashOutput: Terminal,
  Monitor: Radar,
  Read: FileText,
  Write: Pencil,
  Edit: Pencil,
  MultiEdit: Pencil,
  NotebookEdit: Pencil,
  Grep: Search,
  Glob: Search,
  WebFetch: Globe,
  WebSearch: Globe,
  TodoWrite: ListChecks,
  Task: Bot,
  Agent: Bot,
  Workflow,
}

/** The glyph of a tool, by canonical name — unknown and MCP tools get the wrench. */
function toolIcon(toolName: string): LucideIcon {
  const bare = toolName.replace(/^mcp__[a-z-]+__/i, '')
  return TOOL_ICONS[bare] ?? TOOL_ICONS[toolName] ?? Wrench
}

/** Tools whose result reads as code (monospace), the others as prose. */
const MONO_RESULT = /^(Bash|BashOutput|Read|Write|Edit|MultiEdit|NotebookEdit|Grep|Glob|Monitor)$/i

/** One colour per NATURE, on a 2 px rail: the eye sorts the list before reading it. */
const KIND_RAIL: Record<ActivityKind, string> = {
  shell: 'border-l-emerald-500/40',
  agent: 'border-l-sky-500/40',
  workflow: 'border-l-violet-500/40',
  message: 'border-l-amber-500/40',
  monitor: 'border-l-teal-500/40',
  generic: 'border-l-white/[0.12]',
  notice: 'border-l-white/[0.12]',
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

/** Serialised pipelines are one "tool", whatever the name the provider gives. */
function sameTool(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * What the activity is doing, by TOOL, on one line: `Bash ×12 · Read ×4 · Edit`.
 *
 * This is the line that was missing: a background sub-agent was one grey row
 * saying "running", while the stream it emits names every tool it calls. The
 * tool running NOW pulses; the rest are counts.
 */
function ToolStrip({ tools, max = 4 }: { tools: ReadonlyArray<ToolTick>; max?: number }) {
  const counts = toolCounts(tools)
  const live = runningTool(tools)
  if (counts.length === 0) return null
  const shown = counts.slice(0, max)
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5" aria-hidden="true">
      {shown.map(({ name, count }) => {
        const Icon = toolIcon(name)
        const isLive = live && sameTool(live.name, name) && count === 1
        return (
          <span key={name} className="inline-flex items-center gap-1" title={`${name} ×${count}`}>
            <Icon className={`h-3 w-3 shrink-0 ${isLive ? 'animate-pulse text-emerald-400/80' : 'text-gray-600'}`} />
            <span className="text-gray-500">{name}</span>
            {count > 1 && <span className="tabular-nums text-gray-600">×{count}</span>}
          </span>
        )
      })}
      {counts.length > shown.length && <span className="text-gray-700">+{counts.length - shown.length}</span>}
    </span>
  )
}

/** Last tools of a stream, drawn one per line: the glyph, the name, what came back. */
function ToolFlowPanel({ tools }: { tools: ReadonlyArray<ToolTick> }) {
  const { t } = useT()
  const [all, setAll] = useState(false)
  if (tools.length === 0) return null
  const limit = all ? tools.length : 6
  const shown = tools.slice(-limit)
  const omitted = tools.length - shown.length
  const live = runningTool(tools)
  return (
    <div>
      <ol aria-label={t('chatA-activity.card.toolsAria')} className="space-y-0.5">
        {omitted > 0 && (
          <li className="text-[11px] text-gray-600">
            {t(omitted === 1 ? 'chatA-activity.card.hiddenEventOne' : 'chatA-activity.card.hiddenEventMany', { count: omitted })}
          </li>
        )}
        {shown.map((tick) => {
          const Icon = toolIcon(tick.name)
          const isLive = live?.key === tick.key
          return (
            <li key={tick.key} className="flex min-w-0 items-baseline gap-1.5 text-[11px]">
              <Icon
                aria-hidden="true"
                className={`mt-0.5 h-3 w-3 shrink-0 ${isLive ? 'animate-pulse text-emerald-400/80' : 'text-gray-600'}`}
              />
              <span className="shrink-0 text-gray-400">{tick.name}</span>
              {tick.resultHead ? (
                <span
                  className={`min-w-0 truncate text-gray-500 ${MONO_RESULT.test(tick.name) ? 'font-mono' : ''}`}
                  title={tick.resultBody}
                >
                  {tick.resultHead}
                </span>
              ) : (
                <span className="text-gray-600">{t('chatA-activity.card.status.running')}</span>
              )}
            </li>
          )
        })}
      </ol>
      {omitted > 0 && !all && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={`${hitArea} mt-0.5 rounded text-[11px] text-indigo-400 hover:text-indigo-300 ${focusRingInset}`}
        >
          {t('chatA-activity.card.showMore')}
        </button>
      )}
    </div>
  )
}
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
  plain = false,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
  /** Inside a terminal: the disclosure sits on the terminal's own surface. */
  plain?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={plain ? 'bg-black/40' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${hitArea} flex items-center gap-1 rounded text-[11px] text-gray-500 hover:text-gray-300 ${focusRingInset} ${plain ? 'w-full px-2.5 text-left font-mono' : ''}`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`w-3 h-3 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        {label}
      </button>
      {open && <div className={plain ? undefined : 'mt-1'}>{children}</div>}
    </div>
  )
}

/** Lines of a command shown before the row offers to unfold it. */
const COMMAND_CLAMP_LINES = 3

/**
 * A background command, drawn as its TERMINAL — no window decoration.
 *
 * Three dots and a title bar say "this is an app window"; nothing here is a
 * window. What is left is what a shell shows: a prompt, the stream it writes,
 * and how it ended, inline at the end of the prompt line.
 *
 * - `$` then the command, clamped, "+N lines", unfold on click — `description`
 *   of a CLI Bash task is the whole script (heredocs, `python3 - <<'EOF'`);
 * - the stream below, tail-first, with the caret of a task still writing;
 * - `exit 0` / `exit ≠ 0` and the duration, on the prompt line: the two facts
 *   a person looks for after "what did it run".
 */
function TerminalCard({
  command,
  commandLines,
  exit,
  failed,
  duration,
  running,
  showPrompt = true,
  children,
}: {
  command: string
  commandLines: number
  exit?: string
  failed?: boolean
  duration?: string
  running: boolean
  /** False when the row above already shows this exact command. */
  showPrompt?: boolean
  children?: ReactNode
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const long = commandLines > COMMAND_CLAMP_LINES
  const facts = (exit !== undefined || failed || duration) && (
    <span className="flex shrink-0 items-center gap-1.5 self-start text-[10px]">
      {(exit !== undefined || failed) && (
        <span className={failed ? 'text-red-400/90' : 'text-emerald-400/80'}>exit {exit ?? '≠ 0'}</span>
      )}
      {duration && <span className="tabular-nums text-gray-500">{duration}</span>}
    </span>
  )
  return (
    <div className="overflow-hidden rounded-md border border-white/[0.08] bg-[#0b0e13]" data-testid="activity-terminal">
      {showPrompt ? (
        <div className="flex items-start gap-1.5 px-2.5 py-1.5 font-mono text-[11px] leading-4 text-gray-200">
          <span aria-hidden="true" className="shrink-0 select-none text-emerald-400/90">
            $
          </span>
          <div
            role={long ? 'button' : undefined}
            tabIndex={long ? 0 : undefined}
            onClick={long ? () => setOpen((v) => !v) : undefined}
            onKeyDown={
              long
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpen((v) => !v)
                    }
                  }
                : undefined
            }
            className={`min-w-0 flex-1 whitespace-pre-wrap break-all ${long && !open ? 'line-clamp-3' : ''} ${long ? 'cursor-pointer' : ''}`}
            title={long ? command : undefined}
          >
            {command}
          </div>
          {long && (
            <span className="shrink-0 select-none text-[10px] tabular-nums text-gray-600">
              {t('chatA-activity.card.lineMany', { count: commandLines })}
            </span>
          )}
          {facts}
        </div>
      ) : (
        // The row above already shows this command: no second prompt, just the
        // facts a shell would print after it.
        facts && <div className="flex justify-end px-2.5 pt-1 font-mono">{facts}</div>
      )}

      {children}

      {/* The caret of a task still writing: the one live signal a shell has. */}
      {running && (
        <div aria-hidden="true" className="px-2.5 pb-1 font-mono text-[11px] leading-3 text-emerald-400/70">
          <span className="animate-pulse">█</span>
        </div>
      )}
    </div>
  )
}

/** Where a background task puts its output, said plainly — the backend cannot read it for us. */
function OutputFile({ path }: { path: string }) {
  const { t } = useT()
  return (
    <p className="flex min-w-0 items-baseline gap-1 text-[11px] text-gray-500">
      <span className="shrink-0">{t('activity.param.outputFile')}</span>
      <span className="min-w-0 truncate font-mono text-gray-400" title={path}>
        {path}
      </span>
    </p>
  )
}

/** Monospace tail of a text stream, oldest first, with the older part collapsed. */
function OutputTail({ lines, label, plain = false }: { lines: string[]; label: string; plain?: boolean }) {
  const { t } = useT()
  const [all, setAll] = useState(false)
  if (lines.length === 0) return null
  const { shown, omitted } = tailLines(lines, all ? lines.length : OUTPUT_TAIL_LINES)
  return (
    <Disclosure label={`${label} · ${t(lines.length === 1 ? 'chatA-activity.card.lineOne' : 'chatA-activity.card.lineMany', { count: lines.length })}`} defaultOpen={lines.length <= 3} plain={plain}>
      <pre
        tabIndex={0}
        aria-label={label}
        className={`max-h-40 overflow-auto text-[11px] leading-4 font-mono whitespace-pre-wrap break-words ${focusRingInset} ${
          plain
            ? // Inside a terminal the stream IS the surface: no box in the box.
              'bg-black/40 px-2.5 py-1.5 text-gray-400'
            : 'rounded border border-white/[0.06] bg-black/20 px-2 py-1.5 text-gray-300'
        }`}
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

/**
 * A Workflow is a FAN-OUT, so it is drawn as a board of agents, not as a list
 * of lines: one tile per agent, its state shown by a dot AND a word, the last
 * tool it called underneath. The bar above is the wave's progress — the only
 * thing that moves while it runs.
 */
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
      <ul
        aria-label={t('chatA-activity.card.agentsOf', { title: activity.title })}
        className="grid list-none grid-cols-1 gap-1 sm:grid-cols-2"
      >
        {activity.agents.map((agent) => {
          const meta = ACTIVITY_STATUS_META[agent.state]
          return (
            <li
              key={agent.key}
              className="min-w-0 rounded border border-white/[0.06] bg-white/[0.015] px-2 py-1 text-xs"
              data-agent-state={agent.state}
            >
              <span className="flex items-center gap-1.5">
                <StatusDot tone={meta.tone} pulse={agent.state === 'running'} />
                <span className="min-w-0 flex-1 truncate text-gray-300" title={agent.name}>
                  {agent.name}
                </span>
                <span className={`shrink-0 text-[11px] ${TONE_CLASSES[meta.tone].text}`}>
                  {t(`chatA-activity.card.status.${agent.state}`)}
                </span>
              </span>
              {agent.detail && (
                <span className="mt-0.5 block truncate font-mono text-[10px] text-gray-500" title={agent.detail}>
                  {agent.detail}
                </span>
              )}
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
// Specialised bodies — one shape per NATURE of thing, never one shape for all
// ---------------------------------------------------------------------------

/** The output file a task names, when it is a real path the provider wrote. */
function outputFilePath(activity: ActivityModel): string | undefined {
  const param = activity.params.find((p) => p.label === tr('activity.param.outputFile'))
  return param?.value?.trim() || undefined
}

function lines(text: string | undefined): string[] {
  if (!text) return []
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
}

/**
 * A background command IS a terminal: prompt, stream, exit status.
 *
 * The row above already reads the command, so the body repeats it only when it
 * does not fit on one line (a script); everything else is what the command
 * printed — the thing the person actually wants to see.
 */
function ShellBody({ activity }: { activity: ActivityModel }) {
  const { t } = useT()
  const streamLines = activity.outputLines
  const file = outputFilePath(activity)
  const running = activity.status === 'running' || activity.status === 'queued'
  const exit = activity.params.find((p) => p.label === tr('activity.param.exitCode'))?.value
  const failed = activity.status === 'failed' || activity.status === 'cancelled'
  // The row already shows this exact command (single line, not truncated):
  // printing it again under a `$` is the duplication that made the panel noisy.
  const showPrompt = activity.commandLines > 1 || activity.title !== activity.command
  return (
    <div className="space-y-1.5 px-3 pb-2.5 pt-1">
      <TerminalCard
        command={activity.command ?? activity.title}
        commandLines={activity.commandLines}
        showPrompt={showPrompt}
        exit={exit}
        failed={failed}
        duration={activity.durationMs !== undefined ? formatDurationMs(activity.durationMs) : undefined}
        running={running}
      >
        <OutputTail lines={streamLines} label={t('chatA-activity.card.output')} plain />
      </TerminalCard>
      {file && <OutputFile path={file} />}
      {streamLines.length === 0 && !running && file && (
        <p className="text-[11px] text-gray-600">{t('chatA-activity.card.outputInFile')}</p>
      )}
    </div>
  )
}

/** A background sub-agent: what it was asked, WHICH TOOLS it called, what it answered. */
function AgentBody({ activity }: { activity: ActivityModel }) {
  const { t } = useT()
  return (
    <div className="space-y-2 px-3 pb-2.5 pt-1">
      {activity.tools.length > 0 ? (
        <ToolFlowPanel tools={activity.tools} />
      ) : (
        // A stream with no structured tool call: its lines ARE what it says.
        <OutputTail lines={activity.outputLines} label={t('chatA-activity.card.latestOutput')} />
      )}
      <OutputTail lines={lines(activity.result)} label={t('chatA-activity.card.result')} />
      {activity.usage && <UsageLine usage={activity.usage} />}
      <Timeline activity={activity} />
      {activity.raw && <RawPayload raw={activity.raw} />}
    </div>
  )
}

/** A background agent's own words: a message, drawn as text — not a task with a payload. */
function MessageBody({ activity }: { activity: ActivityModel }) {
  const text = activity.outputLines.join('\n').trim() || activity.result || ''
  // The row already reads the first line; the body only adds what does not fit.
  const more = text.length > activity.title.length
  return (
    <div className="space-y-1.5 px-3 pb-2.5 pt-1 text-xs">
      {more ? (
        <div className="border-l-2 border-l-amber-500/25 pl-2">
          <ExpandableText text={text} className="text-gray-300" />
        </div>
      ) : null}
      {activity.model && (
        <p className="text-[11px] text-gray-600">
          {tr('activity.param.model')} <span className="font-mono text-gray-500">{activity.model}</span>
        </p>
      )}
    </div>
  )
}

/** A Workflow tool: the fan-out when the provider reports agents, its report otherwise. */
function WorkflowBody({ activity }: { activity: ActivityModel }) {
  const { t } = useT()
  return (
    <div className="space-y-2 px-3 pb-2.5 pt-1">
      {activity.agents.length > 0 ? (
        <AgentList activity={activity} />
      ) : (
        <OutputTail lines={lines(activity.result)} label={t('chatA-activity.card.result')} />
      )}
      {activity.usage && <UsageLine usage={activity.usage} />}
      <Timeline activity={activity} />
      {activity.raw && <RawPayload raw={activity.raw} />}
    </div>
  )
}

/** A Monitor: the stream it watched, newest last. */
function MonitorBody({ activity }: { activity: ActivityModel }) {
  const { t } = useT()
  // A monitor watches a command: it reads as the same terminal, still writing.
  return (
    <div className="space-y-1.5 px-3 pb-2.5 pt-1">
      <TerminalCard
        command={activity.command ?? activity.title}
        commandLines={activity.commandLines}
        showPrompt={activity.title !== activity.command}
        duration={activity.durationMs !== undefined ? formatDurationMs(activity.durationMs) : undefined}
        failed={activity.status === 'failed' || activity.status === 'cancelled'}
        running={activity.status === 'running' || activity.status === 'queued'}
      >
        <OutputTail lines={activity.outputLines} label={t('chatA-activity.card.watched')} plain />
      </TerminalCard>
    </div>
  )
}

function ActivityBody({ activity }: { activity: ActivityModel }) {
  const { t } = useT()
  const chips = activity.params
  return (
    <div className="space-y-2 px-3 pb-2.5 pt-1 text-xs">
      {chips.length > 0 && activity.kind !== 'shell' && (
        <div className="flex flex-wrap gap-1" aria-label={t('chatA-activity.card.parameters')}>
          {chips.map((p) => (
            <ParamChip key={p.label} param={p} />
          ))}
        </div>
      )}

      {activity.kind === 'shell' && <ShellBody activity={activity} />}
      {activity.kind === 'monitor' && <MonitorBody activity={activity} />}
      {activity.kind === 'agent' && <AgentBody activity={activity} />}
      {activity.kind === 'message' && <MessageBody activity={activity} />}
      {activity.kind === 'message' && activity.tools.length > 0 && <ToolFlowPanel tools={activity.tools} />}
      {activity.kind === 'workflow' && <WorkflowBody activity={activity} />}
      {/* What is NOT known keeps everything: an unknown payload is the one case
          where the raw data is the only honest thing to show, folded. */}
      {activity.kind === 'generic' && (
        <>
          <ToolFlowPanel tools={activity.tools} />
          <DetailList details={activity.details} />
          <OutputTail lines={activity.outputLines} label={t('chatA-activity.card.output')} />
          <Timeline activity={activity} />
          {activity.raw && <RawPayload raw={activity.raw} />}
        </>
      )}
      {activity.kind === 'notice' && <DetailList details={activity.details} />}
    </div>
  )
}

/** One line under the title while collapsed: the freshest thing worth knowing. */
function collapsedHint(activity: ActivityModel, agentsLabel: (settled: number, total: number) => string): string {
  if (activity.kind === 'workflow' && activity.agents.length > 0) {
    const { settled, total } = agentProgress(activity.agents)
    return agentsLabel(settled, total)
  }
  // A shell task's title already IS its command, and its last event repeats it:
  // the useful line is what came back, or nothing.
  if (activity.kind === 'shell') {
    const first = activity.result?.split('\n').find((l) => l.trim() !== '')?.trim()
    return first ?? ''
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
  // A command IS its own tool; every other nature is a stream of tool calls.
  const showTools = activity.tools.length > 0 && activity.kind !== 'shell' && activity.kind !== 'monitor'

  return (
    <div
      className={`rounded-lg border border-l-2 border-white/[0.06] bg-white/[0.02] overflow-hidden ${KIND_RAIL[activity.kind]} ${className}`}
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
        {/* A command is recognised by its prompt, not by a 14 px pictogram. */}
        {activity.kind === 'shell' ? (
          <span aria-hidden="true" className="mt-0.5 w-3.5 shrink-0 select-none text-center font-mono text-[13px] leading-4 text-emerald-400/80">
            $
          </span>
        ) : (
          <Icon aria-hidden="true" className="mt-0.5 w-3.5 h-3.5 shrink-0 text-gray-500" />
        )}
        <span className="min-w-0 flex-1">
          <span className="sr-only">{kindLabel}: </span>
          {/* ONE line always: a background script's twenty lines belong in the
              body, never in the row that stands for it. */}
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span
              className={`min-w-0 truncate text-xs text-gray-200 ${activity.kind === 'shell' ? 'font-mono' : ''}`}
              title={activity.command ?? activity.title}
            >
              {activity.title}
            </span>
            {activity.kind === 'shell' && activity.commandLines > 1 && (
              <span
                className="shrink-0 text-[10px] tabular-nums text-gray-600"
                title={t('chatA-activity.card.lineMany', { count: activity.commandLines })}
              >
                +{activity.commandLines - 1}
              </span>
            )}
          </span>
          {!open && (
            <MetaLine
              className="mt-0.5"
              items={[
                // By TOOL first: what it called says more about a background
                // agent than the chips of its payload ever did.
                showTools && <ToolStrip key="tools" tools={activity.tools} />,
                ...chipPreview.map((p) => (
                  <span key={p.label} className="min-w-0 truncate max-w-[14rem]" title={`${p.label}: ${p.value}`}>
                    <span className="text-gray-600">{p.label} </span>
                    <span className={p.mono ? 'font-mono' : ''}>{p.value}</span>
                  </span>
                )),
                !showTools && hint && <span key="hint" className="min-w-0 truncate max-w-[16rem]" title={hint}>{hint}</span>,
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
