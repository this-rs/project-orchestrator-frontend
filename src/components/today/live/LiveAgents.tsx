import { useState } from 'react'
import { useSetAtom } from 'jotai'
import { ChevronRight } from 'lucide-react'
import { chatPanelModeAtom, chatSessionIdAtom } from '@/atoms'
import { PulseIndicator } from '@/components/ui/PulseIndicator'
import { ErrorState, Skeleton } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { focusRing, metaTextReadable as metaText, pressFeedback } from '@/components/ui/classes'
import { formatCost } from '@/components/ui/format'
import { useLiveAgents } from '@/hooks/useLiveAgents'
import type { LiveAgent } from '@/types/liveAgents'
import { LIVE_TEXT, STATE_LABEL, agentTitle, formatSecs, originLabel, summaryLine } from './text'

function StateDot({ state }: { state: LiveAgent['state'] }) {
  if (state === 'streaming') return <PulseIndicator variant="active" />
  if (state === 'waiting_input') return <PulseIndicator variant="pending" />
  return <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-gray-500" />
}

/**
 * One agent = ONE line, and the line is the button: dot, title, what started it, its state in a
 * word, since when. Model, message count and cost are in the conversation it opens; here they made
 * every row three lines tall.
 */
export function LiveAgentRow({ agent, onOpen }: { agent: LiveAgent; onOpen: (sessionId: string) => void }) {
  const waiting = agent.state === 'waiting_input'
  const since = agent.state === 'idle' ? formatSecs(agent.idle_secs) : formatSecs(agent.age_secs)
  const cost = formatCost(agent.total_cost_usd)
  const detail = [agent.project_slug, agent.model, `${agent.message_count} msg`, cost].filter(Boolean).join(' · ')
  return (
    <li data-testid="live-agent" data-state={agent.state}>
      <button
        type="button"
        onClick={() => onOpen(agent.session_id)}
        aria-label={`${LIVE_TEXT.open} ${agentTitle(agent)}`}
        title={detail}
        className={`flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04] ${pressFeedback} ${focusRing}`}
      >
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

/** Today's "Agents en cours": every agent whose CLI runs now, whatever started it. */
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

  return (
    <section aria-label={LIVE_TEXT.region} className="@container/live min-w-0 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight text-gray-100">{LIVE_TEXT.title}</h2>
        {data && (
          <p className="text-xs text-gray-400" aria-live="polite">
            {summaryLine(data)}
          </p>
        )}
      </div>

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
            <LiveAgentRow key={a.session_id} agent={a} onOpen={open} />
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
