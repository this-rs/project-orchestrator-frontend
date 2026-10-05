import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { hasKnownPrice } from '@/constants/runProviders'
import { useRunTarget } from '@/hooks/useRunTarget'
import type { PendingRun } from '@/hooks/useRunTargetGate'
import { RunTargetPicker } from './RunTargetPicker'

interface RunTargetDialogProps {
  pending: PendingRun | null
  onCancel: () => void
}

/**
 * Provider/model choice for the run buttons that launch in one click
 * (resume from a discussion, "start" in the work dashboard, retry of the runner).
 * Only mounted open: it asks the project's own consent answer when it opens.
 */
export function RunTargetDialog({ pending, onCancel }: RunTargetDialogProps) {
  if (!pending) return null
  return <OpenRunTargetDialog pending={pending} onCancel={onCancel} />
}

function OpenRunTargetDialog({ pending, onCancel }: { pending: PendingRun; onCancel: () => void }) {
  const target = useRunTarget(pending.projectSlug)
  const [busy, setBusy] = useState(false)
  const unpriced = target.visible && !hasKnownPrice(target.instance)

  const confirm = async () => {
    setBusy(true)
    try {
      await pending.run(target.options, unpriced)
    } finally {
      setBusy(false)
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Choose where to run">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="relative bg-[#1a1a2e] border border-white/[0.08] rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-100">Run on which provider?</h3>
        <p className="text-sm text-gray-400 truncate">{pending.title}</p>
        <RunTargetPicker target={target} />
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={confirm} loading={busy} className="bg-indigo-600 hover:bg-indigo-500">
            <Rocket className="w-4 h-4 mr-1.5" />
            Launch
          </Button>
        </div>
      </div>
    </div>
  )
}
