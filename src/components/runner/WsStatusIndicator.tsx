/**
 * WsStatusIndicator — displays WebSocket connection status with icon.
 */

import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import type { WsStatus } from '@/hooks/runner'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WsStatusIndicatorProps {
  status: WsStatus
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WsStatusIndicator({ status }: WsStatusIndicatorProps) {
  if (status === 'connected') return (
    <span className="flex items-center gap-1.5 text-[11px] text-green-400"><Wifi className="w-3 h-3" />Live</span>
  )
  if (status === 'connecting' || status === 'reconnecting') return (
    <span className="flex items-center gap-1.5 text-[11px] text-yellow-400">
      <Loader2 className="w-3 h-3 animate-spin" />
      {status === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
    </span>
  )
  return <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><WifiOff className="w-3 h-3" />Disconnected</span>
}
