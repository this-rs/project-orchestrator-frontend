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
        <svg
          className="w-3.5 h-3.5 text-gray-500 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 8.25a3.75 3.75 0 1 1-3-6m3 6l7.72-4.875M7.5 8.25l7.72 4.875m0-9.75a3.75 3.75 0 0 1 0 5.196L12 12m3.22-7.554L12 12m0 0l3.22 7.554m0 0a3.75 3.75 0 1 1-3-1.304m3 1.304l-7.72-4.875m0 0a3.75 3.75 0 1 1-3 1.304m3-1.304L12 12"
          />
        </svg>

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
