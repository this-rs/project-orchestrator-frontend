import { useAtomValue, useSetAtom } from 'jotai'
import { ArrowRightLeft, History, PowerOff } from 'lucide-react'
import { chatFollowRequestAtom, providersAtom } from '@/atoms'
import { useT } from '@/i18n'
import type { ContentBlock } from '@/types'
import { providerDisplayName } from '@/types/provider'
import { useChatSessionId } from './ChatSessionContext'

/** Visible keyboard focus, 24px target at least (44px on a touch screen). */
const LINK = 'inline-flex min-h-6 pointer-coarse:min-h-11 items-center rounded px-1 text-[11px] text-indigo-300 underline underline-offset-2 hover:text-indigo-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'

/** The label of a provider instance id, as the provider list names it (the id itself otherwise). */
function useProviderLabel(): (id: string) => string {
  const list = useAtomValue(providersAtom)
  return (id) => {
    const p = list?.providers.find((x) => x.id === id)
    return p ? providerDisplayName(p) : id
  }
}

/**
 * A session-level event on its own line of the transcript: the conversation moved to
 * another provider, the server closed the session, or the context was re-injected after
 * a compaction. Each says what happened in words and carries its own icon: the state is
 * never told by colour alone.
 */
export function SessionEventBlock({ block }: { block: ContentBlock }) {
  const { t } = useT()
  const label = useProviderLabel()
  const sessionId = useChatSessionId()
  const follow = useSetAtom(chatFollowRequestAtom)
  const m = block.metadata ?? {}

  if (block.type === 'conversation_relayed') {
    const from = label(String(m.from_provider ?? ''))
    const to = label(String(m.to_provider ?? ''))
    const toSession = String(m.to_session_id ?? '')
    // On the thread it reached: what was replayed. On the thread it left: where it went.
    const left = !!sessionId && toSession !== '' && toSession !== sessionId
    return (
      <div role="note" data-testid="conversation-relayed" data-direction={left ? 'out' : 'in'} className="my-2 flex items-start gap-2 rounded-md border border-indigo-400/20 bg-indigo-500/[0.06] px-3 py-2 text-xs text-gray-300">
        <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p>{t('app.chat.relayed', { from, to, relayed: Number(m.relayed_entries ?? 0), omitted: Number(m.omitted_entries ?? 0) })}</p>
          {m.moved_by === 'auto' && <p className="text-gray-400">{t('app.chat.relayedAuto')}</p>}
          {left && (
            <p className="flex flex-wrap items-center gap-x-2 text-gray-400">
              <span>{t('app.chat.relayedOut', { to })}</span>
              <button type="button" data-testid="relay-open-continuation" className={LINK} onClick={() => follow({ sessionId: toSession, fromSessionId: sessionId, notice: null })}>
                {t('app.chat.openContinuation')}
              </button>
            </p>
          )}
        </div>
      </div>
    )
  }

  if (block.type === 'session_closed') {
    const reason = String(m.reason ?? 'closed')
    const key = reason === 'idle' ? 'app.chat.sessionClosed.idle' : reason === 'error' ? 'app.chat.sessionClosed.error' : 'app.chat.sessionClosed.closed'
    return (
      <div role="status" data-testid="session-closed" data-reason={reason} className="my-2 flex items-start gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
        <PowerOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
        <p className="min-w-0 flex-1">{t(key)}</p>
      </div>
    )
  }

  if (block.type === 'compaction_recovery') {
    const ok = m.recovery_success === true
    return (
      <div data-testid="compaction-recovery" data-success={ok} className="my-1 flex items-start gap-2 py-1 text-[11px] text-gray-500">
        <History className={`mt-0.5 h-3 w-3 shrink-0 ${ok ? 'text-gray-500' : 'text-amber-400'}`} aria-hidden="true" />
        <p className={`min-w-0 flex-1 ${ok ? '' : 'text-amber-200/90'}`}>
          {ok
            ? t('app.chat.compactionRecovered', { tokens: Number(m.hint_tokens ?? 0), ms: Number(m.build_latency_ms ?? 0) })
            : t('app.chat.compactionRecoveryFailed', { ms: Number(m.build_latency_ms ?? 0) })}
        </p>
      </div>
    )
  }

  return null
}
