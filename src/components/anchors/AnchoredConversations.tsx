/**
 * "Conversations anchored here": the reverse read of the anchors, in a detail page.
 *
 * One request per page of results (never one per row), live through
 * `/ws/events`. Each row opens the conversation in the chat panel and says how
 * it is anchored (role, state in words). A server without the anchors routes
 * says so in one quiet line — the page around it is unchanged.
 */
import { MessageSquare } from 'lucide-react'
import { useSetAtom } from 'jotai'
import { chatPanelModeAtom, chatSessionIdAtom } from '@/atoms'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/ui/Section'
import { EntityListSkeleton } from '@/components/ui/Skeleton'
import { RelativeTime } from '@/components/ui/MetaLine'
import { StatusDot } from '@/components/ui'
import { focusRing } from '@/components/ui/classes'
import { useAnchoredSessions } from '@/hooks/useAnchors'
import type { AnchorTargetType } from '@/services/anchors'
import { AnchorStateText } from './anchorDisplay'
import { ASK_HERE_SHORTCUT_LABEL } from './askHereShortcut'

export function AnchoredConversations({ targetType, targetId }: { targetType: AnchorTargetType; targetId: string }) {
  const { t } = useT()
  const { status, items, hasMore, loadingMore, loadMore, reload } = useAnchoredSessions({ type: targetType, id: targetId })
  const setSession = useSetAtom(chatSessionIdAtom)
  const setMode = useSetAtom(chatPanelModeAtom)
  const open = (id: string) => {
    setSession(id)
    setMode('open')
  }

  return (
    <Section
      title={t('anchors.linked.title')}
      count={status === 'ready' && !hasMore ? items.length : undefined}
      description={status === 'unavailable' ? undefined : t('anchors.linked.description')}
    >
      <div data-testid="anchored-conversations" data-status={status}>
        {status === 'loading' || status === 'idle' ? (
          <div role="status" aria-label={t('anchors.linked.loading')}>
            <EntityListSkeleton rows={2} />
          </div>
        ) : status === 'unavailable' ? (
          <p className="text-xs text-gray-400" data-testid="anchored-unavailable">
            {t('anchors.linked.unavailable')} <span className="text-gray-500">{t('anchors.linked.unavailableHelp')}</span>
          </p>
        ) : status === 'error' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-300" role="alert">
            {t('anchors.linked.error')}
            <Button size="sm" variant="secondary" onClick={reload}>
              {t('anchors.linked.retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-white/[0.06] px-4 py-5 text-center">
            <p className="text-sm text-gray-300">{t('anchors.linked.empty')}</p>
            <p className="mt-1 text-xs text-gray-400">{t('anchors.linked.emptyHelp', { shortcut: ASK_HERE_SHORTCUT_LABEL })}</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-white/[0.02]">
              {items.map(({ session, anchor }) => {
                const title = session.title?.trim() || t('anchors.linked.untitled')
                const running = !!session.activity?.streaming
                return (
                  <li key={anchor.id} data-testid="anchored-row" data-session-id={session.id}>
                    <button
                      type="button"
                      onClick={() => open(session.id)}
                      aria-label={t('anchors.linked.open', { title })}
                      className={`flex min-h-11 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-start hover:bg-white/[0.03] ${focusRing}`}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                      <span className="min-w-0 flex-1 break-words text-sm text-gray-200">{title}</span>
                      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                        {running && <StatusDot tone="progress" pulse label={t('anchors.linked.active')} />}
                        {running && <span>{t('anchors.linked.active')}</span>}
                        <span>{anchor.roles.map((r) => t(`anchors.role.${r}`)).join(' · ')}</span>
                        <AnchorStateText state={anchor.state} />
                        <RelativeTime date={session.updated_at} className="text-gray-500" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {hasMore && (
              <div className="mt-2">
                <Button size="sm" variant="ghost" onClick={loadMore} loading={loadingMore}>
                  {t('anchors.linked.more')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  )
}
