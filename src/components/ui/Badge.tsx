import { useState } from 'react'
import type { TaskStatus, PlanStatus, NoteStatus, NoteImportance, ReleaseStatus, StepStatus, MilestoneStatus } from '@/types'
import { Dropdown } from './Dropdown'
import { Spinner } from './Spinner'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.08] text-gray-200 ring-gray-500/20',
  success: 'bg-green-900/50 text-green-400 ring-green-500/20 glow-success',
  warning: 'bg-yellow-900/50 text-yellow-400 ring-yellow-500/20 glow-warning',
  error: 'bg-red-900/50 text-red-400 ring-red-500/20 glow-danger',
  info: 'bg-blue-900/50 text-blue-400 ring-blue-500/20 glow-info',
  purple: 'bg-purple-900/50 text-purple-400 ring-purple-500/20 glow-purple',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}

// ============================================================================
// STATIC STATUS BADGES
// ============================================================================

const defaultConfig = { label: 'Unknown', variant: 'default' as BadgeVariant }

type StatusBadgeConfig<T extends string> = Record<T, { label: string; variant: BadgeVariant }>

export const TaskStatusBadge = ({ status }: { status: TaskStatus | undefined | null }) => {
  const config: StatusBadgeConfig<TaskStatus> = {
    pending: { label: 'Pending', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    blocked: { label: 'Blocked', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    failed: { label: 'Failed', variant: 'error' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export const PlanStatusBadge = ({ status }: { status: PlanStatus | undefined | null }) => {
  const config: StatusBadgeConfig<PlanStatus> = {
    draft: { label: 'Draft', variant: 'default' },
    approved: { label: 'Approved', variant: 'info' },
    in_progress: { label: 'In Progress', variant: 'purple' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'error' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export const NoteStatusBadge = ({ status }: { status: NoteStatus | undefined | null }) => {
  const config: StatusBadgeConfig<NoteStatus> = {
    active: { label: 'Active', variant: 'success' },
    needs_review: { label: 'Needs Review', variant: 'warning' },
    stale: { label: 'Stale', variant: 'default' },
    obsolete: { label: 'Obsolete', variant: 'error' },
    archived: { label: 'Archived', variant: 'default' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export const ImportanceBadge = ({ importance }: { importance: NoteImportance | undefined | null }) => {
  const config: StatusBadgeConfig<NoteImportance> = {
    low: { label: 'Low', variant: 'default' },
    medium: { label: 'Medium', variant: 'info' },
    high: { label: 'High', variant: 'warning' },
    critical: { label: 'Critical', variant: 'error' },
  }
  const { label, variant } = (importance && config[importance]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export const ReleaseStatusBadge = ({ status }: { status: ReleaseStatus | undefined | null }) => {
  const config: StatusBadgeConfig<ReleaseStatus> = {
    planned: { label: 'Planned', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    released: { label: 'Released', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'error' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export const StepStatusBadge = ({ status }: { status: StepStatus | undefined | null }) => {
  const config: StatusBadgeConfig<StepStatus> = {
    pending: { label: 'Pending', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    completed: { label: 'Completed', variant: 'success' },
    skipped: { label: 'Skipped', variant: 'warning' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

// ============================================================================
// INTERACTIVE STATUS BADGES — Generic factory
// ============================================================================

interface InteractiveBadgeProps<T> {
  status: T | undefined | null
  onStatusChange: (newStatus: T) => Promise<void> | void
  disabled?: boolean
}

/**
 * Factory: creates an interactive status badge component from a config map.
 * The returned component renders a clickable Badge with a Dropdown to change status.
 *
 * @param config - Maps each status value to { label, variant }
 * @param opts.normalizeStatus - If true, lowercases the status before lookup (for MilestoneStatus)
 */
function createInteractiveStatusBadge<T extends string>(
  config: StatusBadgeConfig<T>,
  opts?: { normalizeStatus?: boolean },
) {
  const options = (Object.keys(config) as T[]).map((key) => ({
    value: key,
    label: config[key].label,
  }))

  return function InteractiveStatusBadge({
    status,
    onStatusChange,
    disabled = false,
  }: InteractiveBadgeProps<T>) {
    const [loading, setLoading] = useState(false)

    const handleChange = async (newStatus: T) => {
      if (newStatus === status) return
      setLoading(true)
      try {
        await onStatusChange(newStatus)
      } finally {
        setLoading(false)
      }
    }

    const resolved = opts?.normalizeStatus
      ? (status?.toLowerCase() as T | undefined)
      : status
    const { label, variant } = (resolved && config[resolved]) || defaultConfig

    if (loading) {
      return (
        <Badge variant={variant}>
          <Spinner size="sm" className="mr-1" />
          {label}
        </Badge>
      )
    }

    return (
      <Dropdown
        trigger={
          <Badge variant={variant} className="cursor-pointer hover:opacity-80">
            {label}
          </Badge>
        }
        options={options}
        onSelect={handleChange}
        disabled={disabled}
      />
    )
  }
}

// — Exported interactive badges (same public API, backed by factory) —

export const InteractiveMilestoneStatusBadge = createInteractiveStatusBadge<MilestoneStatus>(
  {
    planned: { label: 'Planned', variant: 'default' },
    open: { label: 'Open', variant: 'info' },
    in_progress: { label: 'In Progress', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    closed: { label: 'Closed', variant: 'purple' },
  },
  { normalizeStatus: true },
)

export const InteractivePlanStatusBadge = createInteractiveStatusBadge<PlanStatus>({
  draft: { label: 'Draft', variant: 'default' },
  approved: { label: 'Approved', variant: 'info' },
  in_progress: { label: 'In Progress', variant: 'purple' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'error' },
})

export const InteractiveTaskStatusBadge = createInteractiveStatusBadge<TaskStatus>({
  pending: { label: 'Pending', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'info' },
  blocked: { label: 'Blocked', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
})

export const InteractiveNoteStatusBadge = createInteractiveStatusBadge<NoteStatus>({
  active: { label: 'Active', variant: 'success' },
  needs_review: { label: 'Needs Review', variant: 'warning' },
  stale: { label: 'Stale', variant: 'default' },
  obsolete: { label: 'Obsolete', variant: 'error' },
  archived: { label: 'Archived', variant: 'default' },
})

export const InteractiveStepStatusBadge = createInteractiveStatusBadge<StepStatus>({
  pending: { label: 'Pending', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'warning' },
})
