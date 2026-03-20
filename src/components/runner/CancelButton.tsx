import { useState, useEffect, useRef } from 'react'
import { StopCircle, Loader2, Ban, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { runnerApi } from '@/services/runner'

type CancelState = 'idle' | 'cancelling' | 'cancelled'

interface CancelButtonProps {
  planId: string
  isRunning: boolean
}

/** Seconds to wait after graceful cancel before showing force-cancel */
const FORCE_CANCEL_DELAY_SECS = 10

export function CancelButton({ planId, isRunning }: CancelButtonProps) {
  const [cancelState, setCancelState] = useState<CancelState>('idle')
  const [showForceCancel, setShowForceCancel] = useState(false)
  const [forceLoading, setForceLoading] = useState(false)
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirm = useConfirmDialog()
  const forceConfirm = useConfirmDialog()

  // Reset to idle when a new run starts
  // (runStatus goes back to 'running' after a previous cancel)
  const effectiveState: CancelState =
    cancelState === 'cancelled' && isRunning ? 'idle' : cancelState

  // Show force-cancel button after delay when stuck in 'cancelling'
  useEffect(() => {
    if (effectiveState === 'cancelling' && isRunning) {
      cancelTimerRef.current = setTimeout(() => {
        setShowForceCancel(true)
      }, FORCE_CANCEL_DELAY_SECS * 1000)
    } else {
      setShowForceCancel(false)
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current)
        cancelTimerRef.current = null
      }
    }
    return () => {
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current)
        cancelTimerRef.current = null
      }
    }
  }, [effectiveState, isRunning])

  const disabled = !isRunning || effectiveState !== 'idle'

  const handleClick = () => {
    confirm.open({
      title: 'Cancel Run',
      description:
        'Are you sure? This will stop all running agents. Agents that have already completed will keep their results.',
      confirmLabel: 'Cancel Run',
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

  const handleForceCancel = () => {
    forceConfirm.open({
      title: 'Force Cancel Run',
      description:
        'The graceful cancel is not responding. Force-cancel will immediately clear the runner state. Stuck agents will be abandoned. Are you sure?',
      confirmLabel: 'Force Cancel',
      variant: 'danger',
      onConfirm: async () => {
        setForceLoading(true)
        try {
          await runnerApi.forceCancelRun(planId)
          setCancelState('cancelled')
          setShowForceCancel(false)
        } finally {
          setForceLoading(false)
        }
      },
    })
  }

  // Visual config per state
  const config = {
    idle: {
      icon: <StopCircle className="w-4 h-4" />,
      label: 'Cancel Run',
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
      <div className="flex items-center gap-2">
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
        {showForceCancel && (
          <Button
            variant="danger"
            size="sm"
            onClick={handleForceCancel}
            disabled={forceLoading}
            className="!bg-red-600 !text-white !border-red-700 hover:!bg-red-500"
          >
            {forceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Force Cancel
          </Button>
        )}
      </div>
      <ConfirmDialog {...confirm.dialogProps} />
      <ConfirmDialog {...forceConfirm.dialogProps} />
    </>
  )
}
