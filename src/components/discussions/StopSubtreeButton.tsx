import { useState } from 'react'
import { Square } from 'lucide-react'
import { chatApi } from '@/services/chat'
import { flattenSubtree, stopSubtree } from '@/utils/discussionTree'
import type { DiscussionNode } from '@/services/discussions'
import { pluralize } from '@/components/ui'

interface StopSubtreeButtonProps {
  node: DiscussionNode
  /** Re-read the tree once the sessions were told to stop. */
  onStopped?: () => void
}

const BUTTON =
  'inline-flex min-h-8 items-center gap-1 rounded px-2 text-xs text-red-300 hover:bg-red-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400'

/**
 * "Stop subtree": interrupts the session and every live session below it.
 * Asks first when it would stop more than one, and reports "stopped n of m" —
 * a session that could not be reached is said so, not hidden.
 */
export function StopSubtreeButton({ node, onStopped }: StopSubtreeButtonProps) {
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
      setReport(`Stopped ${result.stopped} of ${result.total}`)
      onStopped?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {live > 0 && !confirming && (
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          aria-label={`${live > 1 ? 'Stop subtree' : 'Stop'}: ${node.title || node.session_id.slice(0, 8)}`}
          onClick={() => (live > 1 ? setConfirming(true) : void run())}
        >
          <Square className="h-3 w-3" aria-hidden="true" />
          {live > 1 ? 'Stop subtree' : 'Stop'}
        </button>
      )}
      {confirming && (
        <span role="group" aria-label="Confirm stopping the subtree" className="inline-flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <span>Stop {pluralize(live, 'running session')}?</span>
          <button type="button" className={BUTTON} onClick={() => void run()}>
            Stop all
          </button>
          <button type="button" className="min-h-8 px-2 text-xs text-gray-400 hover:text-gray-200" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      )}
      <span role="status" className="text-xs text-gray-400">
        {report}
      </span>
    </span>
  )
}
