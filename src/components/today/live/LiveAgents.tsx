import { useState } from 'react'
import { useSetAtom } from 'jotai'
import { ChevronRight } from 'lucide-react'
import { chatPanelModeAtom, chatSessionIdAtom } from '@/atoms'
import { PulseIndicator } from '@/components/ui/PulseIndicator'
import { ErrorState, Skeleton } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { focusRing, metaTextReadable as metaText, pressFeedback } from '@/components/ui/classes'
import { costReport, costToText, formatCostSum, formatUsd2, sumCosts } from '@/utils/cost'
import { useLiveAgents } from '@/hooks/useLiveAgents'
import { StackedBar } from '../charts'
import { PANEL } from '../BandFrame'
import type { LiveAgent } from '@/types/liveAgents'
import { LIVE_TEXT, STATE_LABEL, agentTitle, formatSecs, originLabel, summaryLine } from './text'

function StateDot({ state }: { state: LiveAgent['state'] }) {
  if (state === 'streaming') return <PulseIndicator variant="active" />
  if (state === 'waiting_input') return <PulseIndicator variant="pending" />
  return <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-gray-500" />
}

/**
 * One assistant = ONE line, and the line is the button: dot, title, what started it, its state in a
 * word, since when. Model, message count and cost are in the conversation it opens; here they made
 * every row three lines tall.
 */
export function LiveAgentRow({ agent, onOpen, scale }: { agent: LiveAgent; onOpen: (sessionId: string) => void; /** Longest age on screen, in seconds: the row's time bar is drawn against it. */ scale?: number }) {
  const waiting = agent.state === 'waiting_input'
  const since = agent.state === 'idle' ? formatSecs(agent.idle_secs) : formatSecs(agent.age_secs)
  const cost = costToText(costReport(agent.total_cost_usd, agent.cost_basis), { format: formatUsd2, hideZero: true })
  const detail = [agent.project_slug, agent.model, `${agent.message_count} msg`, cost].filter(Boolean).join(' · ')
  return (
    <li data-testid="live-agent" data-state={agent.state}>
      <button
        type="button"
        onClick={() => onOpen(agent.session_id)}
        aria-label={`${LIVE_TEXT.open} ${agentTitle(agent)}`}
        title={detail}
        className={`relative flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 pb-2.5 pt-1.5 text-left hover:bg-white/[0.04] ${pressFeedback} ${focusRing}`}
      >
        {/* How long it has been running, against the longest on screen: the list reads as a timeline. */}
        {scale ? (
          <span aria-hidden="true" data-chart="age" className="absolute bottom-1 left-[2.125rem] right-2 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
            <span
              className={`block h-full rounded-full ${waiting ? 'bg-amber-400' : agent.state === 'streaming' ? 'bg-emerald-400/80' : 'bg-gray-500'}`}
              style={{ width: `${Math.max(2, Math.min(100, (agent.age_secs / scale) * 100))}%` }}
            />
          </span>
        ) : null}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <StateDot state={agent.state} />
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm ${agent.state === 'idle' ? 'text-gray-400' : 'text-gray-100'}`}>{agentTitle(agent)}</span>
        <span className={`hidden shrink-0 @md/live:inline ${metaText}`}>{originLabel(agent.origin)}</span>
        <span
          className={`shrink-0 text-xs ${waiting ? 'font-medium text-amber-300' : agent.state === 'streaming' ? 'text-emerald-300' : 'text-gray-400'}`}
        >
          {STATE_LABEL[agent.state]}
          {agent.pending_requests > 1 ? ` (${agent.pending_requests})` : ''}
        </span>
        <span className={`w-12 shrink-0 text-right tabular-nums ${metaText}`}>{since}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-600" aria-hidden="true" />
      </button>
    </li>
  )
}

/** Today's "Assistants": every assistant whose conversation is alive now, whatever started it. */
export function LiveAgents() {
  const { status, data, stale, refresh } = useLiveAgents()
  const setSession = useSetAtom(chatSessionIdAtom)
  const setMode = useSetAtom(chatPanelModeAtom)
  const [showIdle, setShowIdle] = useState(false)
  const open = (id: string) => {
    setSession(id)
    setMode('open')
  }

  // Who needs the user first, then who works; the idle ones are folded (nothing happens there).
  const order = { waiting_input: 0, streaming: 1, idle: 2 } as const
  const active = (data?.agents ?? []).filter((a) => a.state !== 'idle').sort((a, b) => order[a.state] - order[b.state])
  const idle = (data?.agents ?? []).filter((a) => a.state === 'idle')

  const scale = Math.max(0, ...active.map((a) => a.age_secs))
  // Agents without a figure make this a floor ("≥ $x"); nothing known, or a zero, shows nothing.
  const costSum = sumCosts((data?.agents ?? []).map((a) => costReport(a.total_cost_usd, a.cost_basis)))
  const cost = costSum.usd > 0 ? formatCostSum(costSum) : null

  return (
    <section aria-label={LIVE_TEXT.region} className={`@container/live min-w-0 space-y-2 ${PANEL}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight text-gray-100">{LIVE_TEXT.title}</h2>
        {data && (
          <p className="text-xs text-gray-400" aria-live="polite">
            {summaryLine(data)}
          </p>
        )}
        {data && data.total > 0 && cost && <p className="ml-auto text-xs tabular-nums text-gray-400">{cost}</p>}
      </div>
      {data && data.total > 0 && (
        <StackedBar
          segments={[
            { value: data.waiting_input, className: 'text-amber-400' },
            { value: data.streaming, className: 'text-emerald-400' },
            { value: data.idle, className: 'text-gray-500' },
          ]}
        />
      )}

      {stale && data && (
        <p role="status" className="text-xs text-amber-400">
          {LIVE_TEXT.stale}
        </p>
      )}

      {status === 'loading' && <Skeleton className="h-12 w-full" />}
      {status === 'error' && !data && <ErrorState title={LIVE_TEXT.loadError} onRetry={refresh} />}

      {data && data.agents.length === 0 && (
        <div className="py-2">
          <p className="text-sm text-gray-300">{LIVE_TEXT.empty}</p>
          <p className="text-xs text-gray-500">{LIVE_TEXT.emptyHint}</p>
        </div>
      )}

      {data && active.length > 0 && (
        <ul className="-mx-2">
          {active.map((a) => (
            <LiveAgentRow key={a.session_id} agent={a} onOpen={open} scale={scale} />
          ))}
        </ul>
      )}
      {data && idle.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={showIdle} onClick={() => setShowIdle((v) => !v)}>
            <ChevronRight className={`mr-1 h-3.5 w-3.5 ${showIdle ? 'rotate-90' : ''}`} aria-hidden="true" />
            {LIVE_TEXT.idle(idle.length)}
          </Button>
          {showIdle && (
            <ul className="-mx-2">
              {idle.map((a) => (
                <LiveAgentRow key={a.session_id} agent={a} onOpen={open} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
