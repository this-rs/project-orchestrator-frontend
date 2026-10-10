import { useAtom, useAtomValue } from 'jotai'
import { ArrowRightLeft, X } from 'lucide-react'
import { chatFollowNoticeAtom, providersAtom } from '@/atoms'
import { useT } from '@/i18n'
import { providerDisplayName } from '@/types/provider'

/**
 * Said above the composer once this tab followed a conversation that moved to another
 * provider from somewhere else (another tab, another device, PO): the tab did not go
 * "disconnected", it now shows the session that continues the conversation.
 */
export function FollowNotice({ sessionId }: { sessionId: string | null }) {
  const { t } = useT()
  const [notice, setNotice] = useAtom(chatFollowNoticeAtom)
  const list = useAtomValue(providersAtom)
  if (!notice || !sessionId || notice.sessionId !== sessionId) return null
  const label = (id: string) => {
    const p = list?.providers.find((x) => x.id === id)
    return p ? providerDisplayName(p) : id
  }
  const vars = { from: label(notice.fromProvider), to: label(notice.toProvider) }
  return (
    <div role="status" data-testid="follow-notice" className="mx-3 mb-1 flex items-start gap-2 rounded-lg border border-indigo-400/30 bg-surface-popover px-3 py-2 text-xs text-gray-200">
      <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden="true" />
      <p className="min-w-0 flex-1">{notice.movedBy === 'auto' ? t('app.chat.followedAuto', vars) : t('app.chat.followed', vars)}</p>
      <button
        type="button"
        onClick={() => setNotice(null)}
        aria-label={t('app.chat.dismissNotice')}
        className="grid size-6 shrink-0 place-items-center rounded text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 pointer-coarse:size-11"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
