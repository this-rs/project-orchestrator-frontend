/**
 * An FSM protocol execution, as a card.
 *
 * Its anatomy is a *state machine*, not a progress bar: the current state is the
 * headline fact, and the chain it went through is what tells a person whether the
 * run is moving or stuck on the same state for ten minutes.
 */
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui'
import { useElapsedTime } from '@/hooks/useElapsedTime'
import { useT } from '@/i18n'
import type { ProtocolRunActivity } from '@/types/activity'
import { ActivityCard } from './ActivityCard'
import { CATEGORY_META } from './categoryMeta'
import { runStatusBadge } from './statusMeta'

interface ProtocolRunCardProps {
  run: ProtocolRunActivity
  href: string
  pulseSeq: number
  pulseEnabled: boolean
}

export function ProtocolRunCard({ run, href, pulseSeq, pulseEnabled }: ProtocolRunCardProps) {
  const { t } = useT()
  const meta = CATEGORY_META.protocol_run
  const elapsed = useElapsedTime(run.started_at, run.status === 'running')
  const status = runStatusBadge(run.status)

  return (
    <ActivityCard
      cardId={`activity-card-${run.run_id}`}
      icon={meta.icon}
      tint={meta.tint}
      kind={t('nomenclature.protocols.singular')}
      title={run.protocol_name ?? run.protocol_id}
      href={href}
      trailing={<div>{elapsed}</div>}
      pulseSeq={pulseSeq}
      pulseEnabled={pulseEnabled}
      status={
        <>
          <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
          {run.current_state_name && (
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-gray-200">
              {run.current_state_name}
            </span>
          )}
        </>
      }
    >
      {/* The state machine's own line: how far it walked, and how it was started. */}
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
        <span className="tabular-nums">{run.states_visited}</span>
        <ArrowRight className="size-3" aria-hidden="true" />
        <span className="truncate">{run.triggered_by}</span>
        {run.parent_run_id && (
          <span className="ml-auto shrink-0 font-mono">{run.parent_run_id.slice(0, 8)}</span>
        )}
      </p>
    </ActivityCard>
  )
}
