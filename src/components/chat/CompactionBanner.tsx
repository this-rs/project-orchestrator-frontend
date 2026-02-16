/**
 * CompactionBanner — shown when the context window is being compacted.
 *
 * Appears between ChatMessages and ChatInput with a spinner and message.
 * Automatically hidden when compact_boundary event arrives.
 */

interface CompactionBannerProps {
  visible: boolean
}

export function CompactionBanner({ visible }: CompactionBannerProps) {
  if (!visible) return null

  return (
    <div className="flex items-center justify-center gap-2.5 px-4 py-2.5 mx-3 mb-2 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 animate-in fade-in duration-300">
      {/* Spinning icon */}
      <svg
        className="w-3.5 h-3.5 text-amber-400 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>

      <span className="text-xs text-amber-300/90 font-medium">
        Compacting conversation context...
      </span>

      {/* Pulsing dot */}
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
      </span>
    </div>
  )
}
