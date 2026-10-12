import type { ContentBlock } from '@/types'
import { AlertTriangle } from 'lucide-react'

interface ResultMaxTurnsBlockProps {
  block: ContentBlock
  onContinue: () => void
  /** When true, the Continue button is hidden (streaming resumed after continue) */
  isStreaming?: boolean
  /** Set when the transcript is read-only (mirror): Continue is shown inert, with this reason. */
  disabledReason?: string | null
}

export function ResultMaxTurnsBlock({ block, onContinue, isStreaming, disabledReason }: ResultMaxTurnsBlockProps) {
  const numTurns = block.metadata?.num_turns as number | undefined

  return (
    <div className="my-2 flex items-center gap-3 px-3 py-2 bg-amber-900/20 border border-amber-600/30 rounded-lg">
      {/* Warning icon */}
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />

      <span className="text-sm text-amber-300 flex-1">
        {numTurns
          ? `Maximum turns reached (${numTurns} turns)`
          : 'Maximum turns reached'}
      </span>

      {/* The backend continues such a turn on its own (always on, capped): its
          `auto_continue` adds a continue_indicator and this block is hidden. The
          button is for a turn it did not continue (cap reached, kill switch). */}
      {!isStreaming && (
        <button
          onClick={onContinue}
          disabled={!!disabledReason}
          title={disabledReason ?? undefined}
          className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-600"
        >
          Continue
        </button>
      )}
    </div>
  )
}
