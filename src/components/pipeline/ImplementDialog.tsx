import { Rocket, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ImplementMode } from './ImplementButton'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImplementDialogProps {
  /** Whether the dialog is visible */
  open: boolean
  /** Close the dialog */
  onClose: () => void
  /** Confirm and launch implementation */
  onConfirm: () => void
  /** What kind of entity is being implemented */
  mode: ImplementMode
  /** Human-readable name of the entity */
  entityTitle: string
  /** Whether the confirm action is in progress */
  loading?: boolean
}

const modeLabels: Record<ImplementMode, string> = {
  plan: 'Plan',
  task: 'Task',
  milestone: 'Milestone',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Confirmation dialog before launching a pipeline execution.
 * Shows a warning about resource usage and asks for confirmation.
 */
export function ImplementDialog({
  open,
  onClose,
  onConfirm,
  mode,
  entityTitle,
  loading = false,
}: ImplementDialogProps) {
  if (!open) return null

  const label = modeLabels[mode]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-[#1a1a2e] border border-white/[0.08] rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Rocket className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-100">
              Implement {label}
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              Launch autonomous pipeline execution
            </p>
          </div>
        </div>

        {/* Entity info */}
        <div className="p-3 bg-white/[0.04] rounded-lg">
          <p className="text-sm text-gray-300 font-medium truncate">{entityTitle}</p>
          <p className="text-xs text-gray-500 mt-1">
            {mode === 'plan' && 'All tasks in this plan will be executed in wave order.'}
            {mode === 'task' && 'This task will be executed by an autonomous agent.'}
            {mode === 'milestone' && 'All plans linked to this milestone will be executed.'}
          </p>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            This will spawn agent sessions that consume API credits.
            Make sure the plan is properly configured before launching.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            loading={loading}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            <Rocket className="w-4 h-4 mr-1.5" />
            Launch
          </Button>
        </div>
      </div>
    </div>
  )
}
