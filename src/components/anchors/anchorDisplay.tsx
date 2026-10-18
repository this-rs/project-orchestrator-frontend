/**
 * How an anchor is drawn: its name, where it links, and its state — always an
 * icon AND words, never a colour alone (DESIGN.md § 4).
 */
import { Archive, ArrowRightLeft, CircleCheck, CircleHelp, Unlink, type LucideIcon } from 'lucide-react'
import { useT } from '@/i18n'
import { TONE_CLASSES, type StatusTone } from '@/components/ui/statusMeta'
import type { AnchorState } from '@/services/anchors'

const STATE_LOOK: Record<AnchorState, { Icon: LucideIcon; tone: StatusTone }> = {
  live: { Icon: CircleCheck, tone: 'success' },
  moved: { Icon: ArrowRightLeft, tone: 'info' },
  archived: { Icon: Archive, tone: 'muted' },
  dangling: { Icon: Unlink, tone: 'danger' },
  unknown: { Icon: CircleHelp, tone: 'warning' },
}

export function AnchorStateText({ state, className = '' }: { state: AnchorState; className?: string }) {
  const { t } = useT()
  const look = STATE_LOOK[state] ?? STATE_LOOK.unknown
  return (
    <span data-testid="anchor-state" data-state={state} className={`inline-flex items-center gap-1 whitespace-nowrap ${TONE_CLASSES[look.tone].text} ${className}`}>
      <look.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t(`anchors.state.${state}`)}
    </span>
  )
}
