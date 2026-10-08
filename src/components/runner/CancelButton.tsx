import { useState } from 'react'
import { StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ToneText } from '@/components/ui/Status'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { runnerApi } from '@/services/runner'

type CancelState = 'idle' | 'cancelling' | 'cancelled'

interface CancelButtonProps {
  planId: string
  isRunning: boolean
}

export function CancelButton({ planId, isRunning }: CancelButtonProps) {
  const [cancelState, setCancelState] = useState<CancelState>('idle')
  const confirm = useConfirmDialog()

  // Reset to idle when a new run starts
  // (runStatus goes back to 'running' after a previous cancel)
  const effectiveState: CancelState =
    cancelState === 'cancelled' && isRunning ? 'idle' : cancelState

  const handleClick = () => {
    confirm.open({
      title: 'Cancel run?',
      description:
        'This stops every running assistant. The ones that already finished keep their results.',
      confirmLabel: 'Cancel run',
      variant: 'danger',
      onConfirm: async () => {
        setCancelState('cancelling')
        try {
          await runnerApi.cancelRun(planId)
          setCancelState('cancelled')
        } catch (err) {
          // If already cancelling (409), reflect that state
          if (err instanceof Error && err.message === 'Cancellation already in progress') {
            setCancelState('cancelling')
          } else {
            // Reset on unexpected error so user can retry
            setCancelState('idle')
            throw err
          }
        }
      },
    })
  }

  // Once asked, the cancellation is a state of the run, not a button any more:
  // dot + word (DESIGN.md § 4), pulsing while the agents are being stopped.
  return (
    <>
      {effectiveState === 'idle' ? (
        <Button variant="danger" size="sm" onClick={handleClick} disabled={!isRunning} className="gap-1.5">
          <StopCircle className="w-4 h-4" aria-hidden="true" />
          Cancel run
        </Button>
      ) : effectiveState === 'cancelling' ? (
        <ToneText tone="warning" pulse label="Cancelling…" className="text-sm" />
      ) : (
        <ToneText tone="muted" label="Cancelled" className="text-sm" />
      )}
      <ConfirmDialog {...confirm.dialogProps} />
    </>
  )
}
