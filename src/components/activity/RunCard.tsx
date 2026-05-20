/**
 * RunCard — discriminated-union dispatcher for the three Activity Hub card
 * variants:
 *
 *   { type: 'plan',     run: RunState }              → PlanRunCard
 *   { type: 'protocol', run: RunState }              → ProtocolRunCard
 *   { type: 'chat',     session: ChatSessionSummary } → ChatSessionCard
 *
 * Centralizing the navigation logic here (click → workspace-scoped URL) means
 * the underlying cards stay presentational and easy to test.
 */

import { useNavigate } from 'react-router-dom'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { RunState } from '@/hooks/useActivityStream'
import type { ChatSessionSummary } from '@/types'
import { PlanRunCard } from './PlanRunCard'
import { ProtocolRunCard } from './ProtocolRunCard'
import { ChatSessionCard } from './ChatSessionCard'

export type RunCardItem =
  | { type: 'plan'; run: RunState; planId?: string | null }
  | { type: 'protocol'; run: RunState; protocolId?: string | null }
  | { type: 'chat'; session: ChatSessionSummary }

export interface RunCardProps {
  item: RunCardItem
  /** Optional last-known tool_use to enrich chat cards. */
  lastToolUse?: string | null
  tokenCount?: number
}

export function RunCard({ item, lastToolUse, tokenCount }: RunCardProps) {
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()

  switch (item.type) {
    case 'plan': {
      const onClick = item.planId
        ? () => navigate(workspacePath(wsSlug, `/plans/${item.planId}/runner`))
        : undefined
      return <PlanRunCard run={item.run} onClick={onClick} />
    }
    case 'protocol': {
      const onClick = item.protocolId
        ? () => navigate(workspacePath(wsSlug, `/protocols/${item.protocolId}`))
        : undefined
      return <ProtocolRunCard run={item.run} onClick={onClick} />
    }
    case 'chat': {
      const onClick = () =>
        navigate(workspacePath(wsSlug, `/chat/${item.session.id}`))
      return (
        <ChatSessionCard
          session={item.session}
          lastToolUse={lastToolUse}
          tokenCount={tokenCount}
          onClick={onClick}
        />
      )
    }
    default: {
      // Exhaustiveness — fails at compile time if a new variant is added.
      const _exhaustive: never = item
      void _exhaustive
      return null
    }
  }
}

export default RunCard
