/**
 * WsStatusIndicator — the live-connection state of a conversation, as dot + word
 * (DESIGN.md § 4, `ToneText`): Live · Connecting… (pulses) · Disconnected.
 */

import { ToneText } from '@/components/ui'
import type { WsStatus } from '@/hooks/runner'

export interface WsStatusIndicatorProps {
  status: WsStatus
}

export function WsStatusIndicator({ status }: WsStatusIndicatorProps) {
  if (status === 'connected') return <ToneText tone="success" label="Live" className="text-[11px]" />
  if (status === 'connecting' || status === 'reconnecting') {
    return <ToneText tone="warning" pulse label={status === 'connecting' ? 'Connecting…' : 'Reconnecting…'} className="text-[11px]" />
  }
  return <ToneText tone="muted" label="Disconnected" className="text-[11px]" />
}
