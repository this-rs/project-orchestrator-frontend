import { useState } from 'react'
import { StopCircle, Loader2, Ban } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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

  const disabled = !isRunning || effectiveState !== 'idle'

  const handleClick = () => {
    confirm.open({
      title: 'Cancel run?',
      description:
        'Are you sure? This will stop all running agents. Agents that have already completed will keep their results.',
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

  // Visual config per state
  const config = {
    idle: {
      icon: <StopCircle className="w-4 h-4" />,
      label: 'Cancel run',
      className: '',
    },
    cancelling: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      label: 'Cancelling...',
      className: '!bg-orange-500/15 !text-orange-400 !border-orange-500/30',
    },
    cancelled: {
      icon: <Ban className="w-4 h-4" />,
      label: 'Cancelled',
      className: '!bg-gray-500/15 !text-gray-400 !border-gray-500/30',
    },
  } as const

  const current = config[effectiveState]

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        onClick={handleClick}
        disabled={disabled}
        className={current.className}
      >
        {current.icon}
        {current.label}
      </Button>
      <ConfirmDialog {...confirm.dialogProps} />
    </>
  )
}
