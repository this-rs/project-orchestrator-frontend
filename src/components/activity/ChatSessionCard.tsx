/**
 * A conversation, as a card — the only card that can be "quiet but still busy":
 * a session waiting on a permission request, or watching a background command,
 * produces no tokens for minutes and used to look dead everywhere else in the app.
 *
 * So the card leads with *what the session is doing* (streaming, waiting on you,
 * background work) rather than with the number of messages.
 */
import { Badge, RelativeTime } from '@/components/ui'
import { formatCost } from '@/components/ui/format'
import { useT } from '@/i18n'
import type { ChatSessionActivity } from '@/types/activity'
import { ActivityCard } from './ActivityCard'
import { CATEGORY_META } from './categoryMeta'
import { chatActivityDotClass } from './statusMeta'

interface ChatSessionCardProps {
  session: ChatSessionActivity
  href: string
  pulseSeq: number
  pulseEnabled: boolean
}

export function ChatSessionCard({ session, href, pulseSeq, pulseEnabled }: ChatSessionCardProps) {
  const { t } = useT()
  const meta = CATEGORY_META.chat_session
  const { activity } = session
  const label = session.title ?? session.preview ?? session.session_id.slice(0, 8)
  const cost = formatCost(session.cost_usd ?? null)
  const background = activity.monitors + activity.bash_tasks

  return (
    <ActivityCard
      cardId={`activity-card-${session.session_id}`}
      icon={meta.icon}
      tint={meta.tint}
      kind={t('nomenclature.segment.chat')}
      title={label}
      href={href}
      trailing={
        <>
          <div>
            <RelativeTime date={session.updated_at} />
          </div>
          {cost && <div className="text-gray-500">{cost}</div>}
        </>
      }
      pulseSeq={pulseSeq}
      pulseEnabled={pulseEnabled}
      status={
        <>
          <span className="flex items-center gap-1.5 text-xs text-gray-300">
            <span
              className={`size-1.5 rounded-full ${chatActivityDotClass(activity.streaming, activity.live)}`}
              aria-hidden="true"
            />
            {activity.streaming ? t('activity.status.running') : t('activity.hub.idle')}
          </span>
          {activity.pending_permissions > 0 && (
            <Badge variant="warning">
              {t('activity.hub.waiting', { count: activity.pending_permissions })}
            </Badge>
          )}
          {background > 0 && (
            <Badge variant="info">{t('activity.hub.background', { count: background })}</Badge>
          )}
          {session.model && <span className="truncate text-[11px] text-gray-500">{session.model}</span>}
        </>
      }
    >
      {session.preview && session.title && (
        <p className="mt-2 line-clamp-2 text-xs text-gray-400">{session.preview}</p>
      )}
    </ActivityCard>
  )
}
