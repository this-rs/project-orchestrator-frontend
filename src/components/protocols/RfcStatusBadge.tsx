/**
 * RfcStatusBadge — lifecycle state of an RFC as dot + text (design system
 * `StatusText`, kind "rfc").
 */

import { StatusText } from '@/components/ui'
import type { RfcStatus } from '@/types/protocol'

interface RfcStatusBadgeProps {
  status: RfcStatus
  className?: string
}

export function RfcStatusBadge({ status, className = '' }: RfcStatusBadgeProps) {
  return <StatusText kind="rfc" status={status} className={className} />
}
