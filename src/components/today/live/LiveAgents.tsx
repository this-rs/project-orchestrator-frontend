import { useSetAtom } from 'jotai'
import { Bot, FolderGit2 } from 'lucide-react'
import { chatPanelModeAtom, chatSessionIdAtom } from '@/atoms'
import { PulseIndicator } from '@/components/ui/PulseIndicator'
import { ErrorState, Skeleton } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { metaTextReadable as metaText } from '@/components/ui/classes'
import { formatCost } from '@/components/ui/format'
import { useLiveAgents } from '@/hooks/useLiveAgents'
import type { LiveAgent } from '@/types/liveAgents'
import { LIVE_TEXT, STATE_LABEL, agentTitle, formatSecs, originLabel, summaryLine } from './text'

function StateDot({ state }: { state: LiveAgent['state'] }) {
  if (state === 'streaming') return <PulseIndicator variant="active" />
  if (state === 'waiting_input') return <PulseIndicator variant="pending" />
  return <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-gray-500" />
}

export function LiveAgentRow({ agent, onOpen }: { agent: LiveAgent; onOpen: (sessionId: string) => void }) {
  const cost = formatCost(agent.total_cost_usd)
  const facts = [
    originLabel(agent.origin),
    agent.model,
    `depuis ${formatSecs(agent.age_secs)}`,
    agent.state === 'idle' ? `inactif depuis ${formatSecs(agent.idle_secs)}` : null,
    `${agent.message_count} msg`,
    cost,
  ].filter(Boolean)
  return (
    <li
      data-testid="live-agent"
      data-state={agent.state}
      className="flex items-center gap-3 px-1 py-2.5 min-h-12"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center" title={STATE_LABEL[agent.state]}>
        <StateDot state={agent.state} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-gray-100">{agentTitle(agent)}</span>
          <span
            className={`shrink-0 text-[11px] ${agent.state === 'waiting_input' ? 'text-amber-400' : agent.state === 'streaming' ? 'text-green-400' : 'text-gray-500'}`}
          >
            {STATE_LABEL[agent.state]}
            {agent.pending_requests > 1 ? ` (${agent.pending_requests})` : ''}
          </span>
        </div>
        <div className={`mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs ${metaText}`}>
          {agent.project_slug && (
            <span className="inline-flex items-center gap-1">
              <FolderGit2 className="h-3 w-3" aria-hidden="true" />
              {agent.project_slug}
            </span>
          )}
          {facts.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpen(agent.session_id)}
        aria-label={`${LIVE_TEXT.open} ${agentTitle(agent)}`}
      >
        {LIVE_TEXT.open}
      </Button>
    </li>
  )
}

/** Today's "Agents en cours": every agent whose CLI runs now, whatever started it. */
export function LiveAgents() {
  const { status, data, stale, refresh } = useLiveAgents()
  const setSession = useSetAtom(chatSessionIdAtom)
  const setMode = useSetAtom(chatPanelModeAtom)
  const open = (id: string) => {
    setSession(id)
    setMode('open')
  }

  return (
    <section aria-label={LIVE_TEXT.region} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Bot className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {LIVE_TEXT.title}
        </h2>
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

      {data && data.agents.length > 0 && (
        <ul className="divide-y divide-white/[0.06]">
          {data.agents.map((a) => (
            <LiveAgentRow key={a.session_id} agent={a} onOpen={open} />
          ))}
        </ul>
      )}
    </section>
  )
}
