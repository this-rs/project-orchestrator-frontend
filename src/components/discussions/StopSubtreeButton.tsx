import { useState } from 'react'
import { Square } from 'lucide-react'
import { chatApi } from '@/services/chat'
import { flattenSubtree, stopSubtree } from '@/utils/discussionTree'
import type { DiscussionNode } from '@/services/discussions'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'

interface StopSubtreeButtonProps {
  node: DiscussionNode
  /** Re-read the tree once the sessions were told to stop. */
  onStopped?: () => void
}

/**
 * "Stop subtree": interrupts the session and every live session below it.
 * Asks first when it would stop more than one, and reports "stopped n of m" —
 * a session that could not be reached is said so, not hidden.
 */
export function StopSubtreeButton({ node, onStopped }: StopSubtreeButtonProps) {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<string | null>(null)

  const live = flattenSubtree(node).filter((n) => n.status === 'streaming').length
  if (live === 0 && !report) return null

  const run = async () => {
    setConfirming(false)
    setBusy(true)
    try {
      const result = await stopSubtree(node, (id, options) => chatApi.interruptSession(id, 'turn_and_tools', options))
      setReport(t('siteChat.discussions.stoppedReport', { stopped: result.stopped, total: result.total }))
      onStopped?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {live > 0 && !confirming && (
        // One session stops on the word itself (neutral); a whole subtree asks first (red glass + confirm).
        <Button
          size="sm"
          variant={live > 1 ? 'danger' : 'secondary'}
          flat
          disabled={busy}
          aria-label={t('siteChat.discussions.stopAria', {
            action: live > 1 ? t('siteChat.discussions.stopSubtree') : t('siteChat.discussions.stop'),
            name: node.title || node.session_id.slice(0, 8),
          })}
          onClick={() => (live > 1 ? setConfirming(true) : void run())}
          className="gap-1 text-xs"
        >
          <Square className="h-3 w-3" aria-hidden="true" />
          {live > 1 ? t('siteChat.discussions.stopSubtree') : t('siteChat.discussions.stop')}
        </Button>
      )}
      {confirming && (
        <span role="group" aria-label={t('siteChat.discussions.confirmStopAria')} className="inline-flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <span>{t(live === 1 ? 'siteChat.discussions.confirmStop.one' : 'siteChat.discussions.confirmStop.other', { count: live })}</span>
          <Button size="sm" variant="danger" flat onClick={() => void run()} className="text-xs">
            {t('siteChat.discussions.stopAll')}
          </Button>
          <Button size="sm" variant="ghost" flat onClick={() => setConfirming(false)} className="text-xs">
            {t('siteChat.discussions.cancel')}
          </Button>
        </span>
      )}
      <span role="status" className="text-xs text-gray-400">
        {report}
      </span>
    </span>
  )
}
