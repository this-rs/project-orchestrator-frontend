/**
 * ChatSessionCard — compact tile representing an active chat session in the
 * Activity Hub.
 *
 * Shows
 * - Title (session title or preview) + type icon (MessageCircle)
 * - Model + message count + cost
 * - Last tool_use (when known) — surfaced as a "Tool: …" line
 * - Elapsed time since the session was last updated
 *
 * Unlike PlanRunCard / ProtocolRunCard, the chat session payload comes from
 * `ChatSessionSummary` (snapshot only — no aggregated live state). We accept
 * a typed prop instead of `RunState` so the dispatcher can pass through
 * sessions directly.
 */

import { MessageCircle, Wrench } from 'lucide-react'
import type { ChatSessionSummary } from '@/types'
import { CardFrame, CostChip, ElapsedChip } from './RunCardShared'

export interface ChatSessionCardProps {
  session: ChatSessionSummary
  /** Optional latest tool name observed via live events. */
  lastToolUse?: string | null
  /** Optional token count from the latest delta. */
  tokenCount?: number
  onClick?: () => void
}

function formatTokens(n?: number): string | null {
  if (n == null || n <= 0) return null
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function ChatSessionCard({ session, lastToolUse, tokenCount, onClick }: ChatSessionCardProps) {
  const title = session.title || session.preview || 'Untitled session'
  const tokens = formatTokens(tokenCount)

  return (
    <CardFrame
      onClick={onClick}
      accent="emerald"
      ariaLabel={`Chat session: ${title}`}
    >
      <div className="flex flex-col p-3 gap-2 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <MessageCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-100 leading-snug truncate">
                {title}
              </h3>
              <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                {session.model} · {session.message_count} msg{session.message_count > 1 ? 's' : ''}
                {tokens && <span> · {tokens} tok</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Preview / last tool_use */}
        <div className="flex-1 min-h-[60px] rounded border border-white/[0.04] bg-white/[0.02] p-2 overflow-hidden">
          {lastToolUse ? (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-300">
              <Wrench className="w-3 h-3" />
              <span className="font-mono truncate">{lastToolUse}</span>
            </div>
          ) : null}
          {session.preview && (
            <p className="text-[11px] text-gray-400 leading-snug line-clamp-3 mt-1">
              {session.preview}
            </p>
          )}
          {!session.preview && !lastToolUse && (
            <p className="text-[10px] text-gray-600 italic">No recent activity</p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between text-[10px] text-gray-500">
          <ElapsedChip startedAt={session.updated_at} isRunning={false} />
          <CostChip usd={session.total_cost_usd} />
        </div>
      </div>
    </CardFrame>
  )
}

export default ChatSessionCard
