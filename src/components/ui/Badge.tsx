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
  success: 'bg-green-900/50 text-green-400 ring-green-500/20',
  warning: 'bg-yellow-900/50 text-yellow-400 ring-yellow-500/20',
  error: 'bg-red-900/50 text-red-400 ring-red-500/20',
  info: 'bg-blue-900/50 text-blue-400 ring-blue-500/20',
  purple: 'bg-purple-900/50 text-purple-400 ring-purple-500/20',
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

// Default fallback for unknown status
const defaultConfig = { label: 'Unknown', variant: 'default' as BadgeVariant }

// Status-specific badges with fallback handling
export function TaskStatusBadge({ status }: { status: TaskStatus | undefined | null }) {
  const config: Record<TaskStatus, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    blocked: { label: 'Blocked', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    failed: { label: 'Failed', variant: 'error' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export function PlanStatusBadge({ status }: { status: PlanStatus | undefined | null }) {
  const config: Record<PlanStatus, { label: string; variant: BadgeVariant }> = {
    draft: { label: 'Draft', variant: 'default' },
    approved: { label: 'Approved', variant: 'info' },
    in_progress: { label: 'In Progress', variant: 'purple' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'error' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export function NoteStatusBadge({ status }: { status: NoteStatus | undefined | null }) {
  const config: Record<NoteStatus, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Active', variant: 'success' },
    needs_review: { label: 'Needs Review', variant: 'warning' },
    stale: { label: 'Stale', variant: 'default' },
    obsolete: { label: 'Obsolete', variant: 'error' },
    archived: { label: 'Archived', variant: 'default' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export function ImportanceBadge({ importance }: { importance: NoteImportance | undefined | null }) {
  const config: Record<NoteImportance, { label: string; variant: BadgeVariant }> = {
    low: { label: 'Low', variant: 'default' },
    medium: { label: 'Medium', variant: 'info' },
    high: { label: 'High', variant: 'warning' },
    critical: { label: 'Critical', variant: 'error' },
  }
  const { label, variant } = (importance && config[importance]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export function ReleaseStatusBadge({ status }: { status: ReleaseStatus | undefined | null }) {
  const config: Record<ReleaseStatus, { label: string; variant: BadgeVariant }> = {
    planned: { label: 'Planned', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    released: { label: 'Released', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'error' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

export function StepStatusBadge({ status }: { status: StepStatus | undefined | null }) {
  const config: Record<StepStatus, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    completed: { label: 'Completed', variant: 'success' },
    skipped: { label: 'Skipped', variant: 'warning' },
  }
  const { label, variant } = (status && config[status]) || defaultConfig
  return <Badge variant={variant}>{label}</Badge>
}

// ============================================================================
// INTERACTIVE STATUS BADGES (with dropdown to change status)
// ============================================================================

interface InteractiveBadgeProps<T> {
  status: T | undefined | null
  onStatusChange: (newStatus: T) => Promise<void> | void
  disabled?: boolean
}

export function InteractiveMilestoneStatusBadge({
  status,
  onStatusChange,
  disabled = false,
}: InteractiveBadgeProps<MilestoneStatus>) {
  const [loading, setLoading] = useState(false)

  const config: Record<MilestoneStatus, { label: string; variant: BadgeVariant }> = {
    planned: { label: 'Planned', variant: 'default' },
    open: { label: 'Open', variant: 'info' },
    in_progress: { label: 'In Progress', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    closed: { label: 'Closed', variant: 'purple' },
  }

  const options: { value: MilestoneStatus; label: string }[] = [
    { value: 'planned', label: 'Planned' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'closed', label: 'Closed' },
  ]

  const handleChange = async (newStatus: MilestoneStatus) => {
    if (newStatus === status) return
    setLoading(true)
    try {
      await onStatusChange(newStatus)
    } finally {
      setLoading(false)
    }
  }

  const normalizedStatus = status?.toLowerCase() as MilestoneStatus | undefined
  const { label, variant } = (normalizedStatus && config[normalizedStatus]) || defaultConfig

  if (loading) {
    return <Badge variant={variant}><Spinner size="sm" className="mr-1" />{label}</Badge>
  }

  return (
    <Dropdown
      trigger={<Badge variant={variant} className="cursor-pointer hover:opacity-80">{label}</Badge>}
      options={options}
      onSelect={handleChange}
      disabled={disabled}
    />
  )
}

export function InteractivePlanStatusBadge({
  status,
  onStatusChange,
  disabled = false,
}: InteractiveBadgeProps<PlanStatus>) {
  const [loading, setLoading] = useState(false)

  const config: Record<PlanStatus, { label: string; variant: BadgeVariant }> = {
    draft: { label: 'Draft', variant: 'default' },
    approved: { label: 'Approved', variant: 'info' },
    in_progress: { label: 'In Progress', variant: 'purple' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'error' },
  }

  const options: { value: PlanStatus; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'approved', label: 'Approved' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

  const handleChange = async (newStatus: PlanStatus) => {
    if (newStatus === status) return
    setLoading(true)
    try {
      await onStatusChange(newStatus)
    } finally {
      setLoading(false)
    }
  }

  const { label, variant } = (status && config[status]) || defaultConfig

  if (loading) {
    return <Badge variant={variant}><Spinner size="sm" className="mr-1" />{label}</Badge>
  }

  return (
    <Dropdown
      trigger={<Badge variant={variant} className="cursor-pointer hover:opacity-80">{label}</Badge>}
      options={options}
      onSelect={handleChange}
      disabled={disabled}
    />
  )
}

export function InteractiveTaskStatusBadge({
  status,
  onStatusChange,
  disabled = false,
}: InteractiveBadgeProps<TaskStatus>) {
  const [loading, setLoading] = useState(false)

  const config: Record<TaskStatus, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    blocked: { label: 'Blocked', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    failed: { label: 'Failed', variant: 'error' },
  }

  const options: { value: TaskStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
  ]

  const handleChange = async (newStatus: TaskStatus) => {
    if (newStatus === status) return
    setLoading(true)
    try {
      await onStatusChange(newStatus)
    } finally {
      setLoading(false)
    }
  }

  const { label, variant } = (status && config[status]) || defaultConfig

  if (loading) {
    return <Badge variant={variant}><Spinner size="sm" className="mr-1" />{label}</Badge>
  }

  return (
    <Dropdown
      trigger={<Badge variant={variant} className="cursor-pointer hover:opacity-80">{label}</Badge>}
      options={options}
      onSelect={handleChange}
      disabled={disabled}
    />
  )
}

export function InteractiveNoteStatusBadge({
  status,
  onStatusChange,
  disabled = false,
}: InteractiveBadgeProps<NoteStatus>) {
  const [loading, setLoading] = useState(false)

  const config: Record<NoteStatus, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Active', variant: 'success' },
    needs_review: { label: 'Needs Review', variant: 'warning' },
    stale: { label: 'Stale', variant: 'default' },
    obsolete: { label: 'Obsolete', variant: 'error' },
    archived: { label: 'Archived', variant: 'default' },
  }

  const options: { value: NoteStatus; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'needs_review', label: 'Needs Review' },
    { value: 'stale', label: 'Stale' },
    { value: 'obsolete', label: 'Obsolete' },
    { value: 'archived', label: 'Archived' },
  ]

  const handleChange = async (newStatus: NoteStatus) => {
    if (newStatus === status) return
    setLoading(true)
    try {
      await onStatusChange(newStatus)
    } finally {
      setLoading(false)
    }
  }

  const { label, variant } = (status && config[status]) || defaultConfig

  if (loading) {
    return <Badge variant={variant}><Spinner size="sm" className="mr-1" />{label}</Badge>
  }

  return (
    <Dropdown
      trigger={<Badge variant={variant} className="cursor-pointer hover:opacity-80">{label}</Badge>}
      options={options}
      onSelect={handleChange}
      disabled={disabled}
    />
  )
}

export function InteractiveStepStatusBadge({
  status,
  onStatusChange,
  disabled = false,
}: InteractiveBadgeProps<StepStatus>) {
  const [loading, setLoading] = useState(false)

  const config: Record<StepStatus, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'Pending', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    completed: { label: 'Completed', variant: 'success' },
    skipped: { label: 'Skipped', variant: 'warning' },
  }

  const options: { value: StepStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'skipped', label: 'Skipped' },
  ]

  const handleChange = async (newStatus: StepStatus) => {
    if (newStatus === status) return
    setLoading(true)
    try {
      await onStatusChange(newStatus)
    } finally {
      setLoading(false)
    }
  }

  const { label, variant } = (status && config[status]) || defaultConfig

  if (loading) {
    return <Badge variant={variant}><Spinner size="sm" className="mr-1" />{label}</Badge>
  }

  return (
    <Dropdown
      trigger={<Badge variant={variant} className="cursor-pointer hover:opacity-80">{label}</Badge>}
      options={options}
      onSelect={handleChange}
      disabled={disabled}
    />
  )
}
