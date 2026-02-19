import { useAtomValue } from 'jotai'
import { chatAutoContinueAtom } from '@/atoms'
import type { ContentBlock } from '@/types'
import { AlertTriangle } from 'lucide-react'

interface ResultMaxTurnsBlockProps {
  block: ContentBlock
  onContinue: () => void
  /** When true, the Continue button is hidden (streaming resumed after continue) */
  isStreaming?: boolean
}

export function ResultMaxTurnsBlock({ block, onContinue, isStreaming }: ResultMaxTurnsBlockProps) {
  const numTurns = block.metadata?.num_turns as number | undefined
  const autoContinue = useAtomValue(chatAutoContinueAtom)

  return (
    <div className="my-2 flex items-center gap-3 px-3 py-2 bg-amber-900/20 border border-amber-600/30 rounded-lg">
      {/* Warning icon */}
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />

      <span className="text-sm text-amber-300 flex-1">
        {numTurns
          ? `Maximum turns reached (${numTurns} turns)`
          : 'Maximum turns reached'}
      </span>

      {autoContinue ? (
        <span className="text-xs text-amber-400/70 italic shrink-0">
          Auto-continuing…
        </span>
      ) : (
        !isStreaming && (
          <button
            onClick={onContinue}
            className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded transition-colors shrink-0"
          >
            Continue
          </button>
        )
      )}
    </div>
  )
}
