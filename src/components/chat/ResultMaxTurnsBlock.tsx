import { useAtomValue } from 'jotai'
import { chatAutoContinueAtom } from '@/atoms'
import type { ContentBlock } from '@/types'

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
      <svg
        className="w-4 h-4 text-amber-400 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>

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
