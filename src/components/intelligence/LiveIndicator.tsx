import { memo, useState, useEffect } from 'react'
import { Radio, Brain } from 'lucide-react'

/** Neural activity window — "thinking" while events flowed in the last 5s */
const THINKING_WINDOW_MS = 5000

interface LiveIndicatorProps {
  connected: boolean
  lastEventAt: number | null
  /** Timestamp of the last activation/reinforcement event — drives the
   *  observatory "thinking" pulse (rate-based: events in last 5s > 0) */
  lastNeuralEventAt?: number | null
}

/**
 * Compact "Live" indicator that pulses when WebSocket events arrive.
 * Shows connection status and briefly pulses on each received event.
 *
 * Observatory mode: when activation/reinforcement events flowed within the
 * last 5 seconds, the indicator switches to a violet "Thinking" pulse.
 */
function LiveIndicatorComponent({ connected, lastEventAt, lastNeuralEventAt }: LiveIndicatorProps) {
  const [pulsing, setPulsing] = useState(false)
  const [thinking, setThinking] = useState(false)

  // Pulse effect: briefly light up when a new event arrives
  useEffect(() => {
    if (!lastEventAt) return
    setPulsing(true)
    const timer = setTimeout(() => setPulsing(false), 600)
    return () => clearTimeout(timer)
  }, [lastEventAt])

  // Thinking state: active while neural events flowed within the window.
  // Re-evaluated every second so it decays without needing new events.
  // (First update is deferred a tick to avoid sync setState in the effect.)
  useEffect(() => {
    if (!lastNeuralEventAt) return
    const update = () => setThinking(Date.now() - lastNeuralEventAt < THINKING_WINDOW_MS)
    const kickoff = setTimeout(update, 0)
    const interval = setInterval(update, 1000)
    return () => {
      clearTimeout(kickoff)
      clearInterval(interval)
    }
  }, [lastNeuralEventAt])

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

  // Observatory "thinking" state — neural activity (activation/reinforcement)
  if (thinking) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium bg-violet-950/80 border border-violet-500/50 text-violet-300"
        title="Neural activity — activation/reinforcement events are flowing"
      >
        <Brain size={10} className="shrink-0 text-violet-300 animate-pulse" />
        Thinking
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
