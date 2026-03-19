import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImplementMode = 'plan' | 'task' | 'milestone'

interface ImplementButtonProps {
  /** What kind of entity to implement */
  mode: ImplementMode
  /** ID of the entity to implement */
  entityId: string
  /** Callback when the button is clicked (opens confirmation dialog) */
  onClick: () => void
  /** Disable the button (e.g. when a run is already active) */
  disabled?: boolean
  /** Optional size override */
  size?: 'sm' | 'md'
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Implement" button with rocket icon and indigo styling.
 * Triggers the ImplementDialog for confirmation before launching a pipeline.
 */
export function ImplementButton({
  mode: _mode,
  entityId: _entityId,
  onClick,
  disabled = false,
  size = 'sm',
  className = '',
}: ImplementButtonProps) {
  return (
    <Button
      variant="primary"
      size={size}
      disabled={disabled}
      onClick={onClick}
      className={`bg-indigo-600 hover:bg-indigo-500 ${className}`}
    >
      <Rocket className="w-4 h-4 mr-1.5" />
      Implement
    </Button>
  )
}
