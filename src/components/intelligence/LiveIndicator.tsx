import { memo, useState, useEffect } from 'react'
import { Radio } from 'lucide-react'

interface LiveIndicatorProps {
  connected: boolean
  lastEventAt: number | null
}

/**
 * Compact "Live" indicator that pulses when WebSocket events arrive.
 * Shows connection status and briefly pulses on each received event.
 */
function LiveIndicatorComponent({ connected, lastEventAt }: LiveIndicatorProps) {
  const [pulsing, setPulsing] = useState(false)

  // Pulse effect: briefly light up when a new event arrives
  useEffect(() => {
    if (!lastEventAt) return
    setPulsing(true)
    const timer = setTimeout(() => setPulsing(false), 600)
    return () => clearTimeout(timer)
  }, [lastEventAt])

  if (!connected) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium bg-slate-800/90 border border-slate-700 text-slate-500"
        title="WebSocket disconnected — updates paused"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
        Offline
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors duration-300 ${
        pulsing
          ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
          : 'bg-slate-800/90 border border-slate-700 text-emerald-400'
      }`}
      title="WebSocket connected — receiving live updates"
    >
      <Radio
        size={10}
        className={`shrink-0 ${pulsing ? 'text-emerald-300 animate-pulse' : 'text-emerald-500'}`}
      />
      Live
    </div>
  )
}

export const LiveIndicator = memo(LiveIndicatorComponent)
