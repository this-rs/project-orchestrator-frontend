/**
 * RunStatusBadge — status of a protocol run as dot + text (design system
 * `StatusText`, kind "run"). The dot pulses only while the run is running.
 */

import { StatusText } from '@/components/ui'

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface RunStatusBadgeProps {
  status: RunStatus
  className?: string
}

export function RunStatusBadge({ status, className = '' }: RunStatusBadgeProps) {
  return <StatusText kind="run" status={status} pulse={status === 'running'} className={`text-[11px] ${className}`} />
}
