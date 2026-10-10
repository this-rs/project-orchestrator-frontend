/**
 * EventChain — the detail of one timeline item and the chain around it.
 *
 * Reusable: it renders what `chainOf` returns. Upstream is read top to bottom
 * (the request first), then the item itself with its input and output, then
 * what it triggered. Every line of the chain is a button that selects it.
 */
import { StatusIcon } from '@/components/ui'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import { focusRing } from '@/components/ui/classes'
import { useT } from '@/i18n'
import { routingRejectionLabel } from '@/constants/routing'
import { STATUS_TONE, DEFAULT_TIMELINE_LABELS, formatItemDuration, type TimelineLabels } from './status'
import { shortModel, type TimelineItem } from './model'

export interface EventChainProps {
  item: TimelineItem
  upstream: ReadonlyArray<TimelineItem>
  downstream: ReadonlyArray<TimelineItem>
  onSelect?: (item: TimelineItem) => void
  labels?: TimelineLabels
  className?: string
}

function asText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function Line({ item, labels, onSelect, current = false }: { item: TimelineItem; labels: TimelineLabels; onSelect?: (i: TimelineItem) => void; current?: boolean }) {
  const tone = STATUS_TONE[item.status]
  const duration = formatItemDuration(item.durationMs)
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(item)}
        aria-current={current ? 'true' : undefined}
        className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${focusRing} ${current ? 'bg-white/[0.08] text-gray-100' : 'text-gray-300 hover:bg-white/[0.05]'}`}
      >
        <StatusIcon tone={tone} className={TONE_CLASSES[tone].text} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className={`shrink-0 text-xs ${TONE_CLASSES[tone].text}`}>{labels.status[item.status]}</span>
        {duration && <span className="shrink-0 text-xs tabular-nums text-gray-400">{duration}</span>}
      </button>
    </li>
  )
}

function Block({ title, text }: { title: string; text: string }) {
  if (!text) return null
  return (
    <section className="min-w-0">
      <h3 className="mb-1 text-xs text-gray-400">{title}</h3>
      <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs text-gray-300 whitespace-pre-wrap break-words">{text}</pre>
    </section>
  )
}

export function EventChain({ item, upstream, downstream, onSelect, labels = DEFAULT_TIMELINE_LABELS, className = '' }: EventChainProps) {
  return (
    <div className={`flex flex-col gap-4 ${className}`} data-testid="event-chain">
      <div>
        <h2 className="mb-1 text-xs text-gray-400">Chain</h2>
        <ol className="flex flex-col gap-0.5">
          {upstream.map((i) => <Line key={i.id} item={i} labels={labels} onSelect={onSelect} />)}
          <Line item={item} labels={labels} onSelect={onSelect} current />
          {downstream.map((i) => <Line key={i.id} item={i} labels={labels} onSelect={onSelect} />)}
        </ol>
      </div>
      <Where item={item} />
      <RoutingDetail item={item} />
      <Block title="Input" text={asText(item.input)} />
      <Block title="Output" text={asText(item.output)} />
    </div>
  )
}

function Fact({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2 text-xs">
      <dt className="w-24 shrink-0 text-gray-400">{name}</dt>
      <dd className="min-w-0 break-words text-gray-300">{value}</dd>
    </div>
  )
}

/** On which provider and model this happened. */
function Where({ item }: { item: TimelineItem }) {
  if (!item.provider && !item.model) return null
  return (
    <section>
      <h3 className="mb-1 text-xs text-gray-400">Ran on</h3>
      <dl className="flex flex-col gap-0.5" data-testid="event-where">
        {item.provider && <Fact name="Provider" value={item.provider} />}
        {item.model && <Fact name="Model" value={shortModel(item.model)} />}
      </dl>
    </section>
  )
}

/** The routing decision: what was chosen, why, and what lost. */
function RoutingDetail({ item }: { item: TimelineItem }) {
  const { t } = useT()
  const d = item.routing
  if (!d) return null
  const pct = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2))
  return (
    <section data-testid="event-routing">
      <h3 className="mb-1 text-xs text-gray-400">Routing decision</h3>
      <dl className="flex flex-col gap-0.5">
        <Fact name="Chosen" value={`${d.provider_id}${d.model ? ` / ${shortModel(d.model)}` : ''}`} />
        <Fact name="Score" value={pct(d.score)} />
        <Fact name="Mode" value={`${d.mode} · ${d.stage}${d.applied ? '' : ' · not applied (recorded only)'}`} />
        <Fact name="Task class" value={d.task_class} />
        <Fact name="Why" value={d.reason || '—'} />
        {d.explored && <Fact name="Exploration" value="The router tried this option to learn, not because it scored best." />}
        {d.outcome && (
          <Fact
            name="Outcome"
            value={[
              d.outcome.success == null ? null : d.outcome.success ? 'succeeded' : 'failed',
              d.outcome.reward == null ? null : `reward ${d.outcome.reward.toFixed(2)}`,
              d.outcome.cost_usd == null ? null : `$${d.outcome.cost_usd.toFixed(4)}`,
            ].filter(Boolean).join(' · ') || '—'}
          />
        )}
      </dl>
      {d.alternatives.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="mb-1 text-left text-gray-400">Candidates considered</caption>
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-0.5 pr-3 font-normal">Provider / model</th>
                <th className="py-0.5 pr-3 font-normal">Score</th>
                <th className="py-0.5 font-normal">Left out because</th>
              </tr>
            </thead>
            <tbody>
              {d.alternatives.map((a, i) => (
                <tr key={`${a.provider_id}/${a.model ?? ''}/${i}`} className="text-gray-300">
                  <td className="py-0.5 pr-3">{a.provider_id}{a.model ? ` / ${shortModel(a.model)}` : ''}</td>
                  <td className="py-0.5 pr-3 tabular-nums">{pct(a.score)}</td>
                  <td className="py-0.5">{a.rejected ? routingRejectionLabel(t, a.rejected, a.why) : 'outscored'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
