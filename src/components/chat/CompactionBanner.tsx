/**
 * CompactionBanner — shown when the context window is being compacted.
 *
 * Appears between ChatMessages and ChatInput with a spinner and message.
 * Automatically hidden when compact_boundary event arrives.
 *
 * Design: subtle, matches the dark theme. Uses the same muted gray palette
 * as CompactBoundaryBlock and SystemInitBlock — compaction is a normal process
 * event, not an alert.
 */

import { Scissors } from 'lucide-react'

interface CompactionBannerProps {
  visible: boolean
}

export function CompactionBanner({ visible }: CompactionBannerProps) {
  if (!visible) return null

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 mx-3 mb-2 select-none">
      {/* Left dashed line */}
      <div className="flex-1 border-t border-dashed border-gray-700/60" />

      {/* Center content */}
      <div className="flex items-center gap-2 text-gray-500">
        {/* Spinning scissors icon */}
        <Scissors className="w-3.5 h-3.5 text-gray-500 animate-spin" />

        <span className="text-xs text-gray-400 whitespace-nowrap">
          Compacting context
        </span>

        {/* Pulsing dot */}
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-50" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-gray-500" />
        </span>
      </div>

      {/* Right dashed line */}
      <div className="flex-1 border-t border-dashed border-gray-700/60" />
    </div>
  )
}
