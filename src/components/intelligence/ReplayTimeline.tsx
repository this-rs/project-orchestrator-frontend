// ============================================================================
// ReplayTimeline — scrubber overlay for the temporal replay
// ============================================================================
//
// Play/pause, speed cycle ×1/×10/×100, current-date display, and a progress
// bar with click-to-seek. Rendered by IntelligenceGraphPage while
// replayStateAtom.active is true; controls come from useGraphReplay.
// ============================================================================

import { memo, useCallback, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { Play, Pause, Gauge, History, X } from 'lucide-react'
import { replayStateAtom } from '@/atoms/intelligence'
import type { GraphReplayControls } from './useGraphReplay'

interface ReplayTimelineProps {
  controls: GraphReplayControls
}

function formatReplayDate(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    + ' · '
    + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function ReplayTimelineComponent({ controls }: ReplayTimelineProps) {
  const replay = useAtomValue(replayStateAtom)
  const barRef = useRef<HTMLDivElement>(null)

  const { startTime, endTime, currentTime, playing, speed } = replay
  const range = Math.max(1, endTime - startTime)
  const progress = Math.min(1, Math.max(0, (currentTime - startTime) / range))
  const loading = startTime === 0

  // Click-to-seek: restart replay fast-forwarding silently to the target time
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = barRef.current
    if (!el || startTime === 0) return
    const rect = el.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    controls.seek(startTime + fraction * (endTime - startTime))
  }, [controls, startTime, endTime])

  if (!replay.active) return null

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(40rem,calc(100%-2rem))] rounded-lg bg-slate-900/90 backdrop-blur-sm border border-slate-700 px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <History size={12} className="text-violet-400 shrink-0" />
        <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">Replay</span>

        {/* Play / Pause */}
        <button
          onClick={playing ? controls.pause : controls.play}
          disabled={loading}
          className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={11} /> : <Play size={11} />}
        </button>

        {/* Speed cycle ×1 / ×10 / ×100 */}
        <button
          onClick={controls.cycleSpeed}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-mono font-medium bg-slate-800 border border-slate-700 text-cyan-300 hover:bg-slate-700 transition-colors"
          title="Cycle playback speed (×1 / ×10 / ×100)"
        >
          <Gauge size={10} />
          ×{speed}
        </button>

        {/* Current virtual date */}
        <span className="text-[11px] font-mono text-slate-300 ml-1 tabular-nums">
          {loading ? 'Loading history…' : formatReplayDate(currentTime)}
        </span>

        {/* Exit */}
        <button
          onClick={controls.exit}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
          title="Exit replay and restore the live graph"
        >
          <X size={11} />
          Exit
        </button>
      </div>

      {/* Progress bar — click to seek */}
      <div
        ref={barRef}
        onClick={handleSeek}
        className={`relative h-2 rounded-full bg-slate-800 border border-slate-700/60 overflow-hidden ${loading ? 'cursor-wait' : 'cursor-pointer'}`}
        title="Click to seek"
      >
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-600/80 to-cyan-500/80 transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Range labels */}
      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
        <span>{loading ? '' : formatReplayDate(startTime)}</span>
        <span>{loading ? '' : formatReplayDate(endTime)}</span>
      </div>
    </div>
  )
}

export const ReplayTimeline = memo(ReplayTimelineComponent)
