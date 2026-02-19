import type { ContentBlock } from '@/types'
import { FastForward } from 'lucide-react'

interface ContinueIndicatorBlockProps {
  block: ContentBlock
}

export function ContinueIndicatorBlock({ block }: ContinueIndicatorBlockProps) {
  const numTurns = block.metadata?.num_turns as number | undefined

  return (
    <div className="flex items-center gap-3 py-3 my-2 select-none">
      {/* Left dashed line */}
      <div className="flex-1 border-t border-dashed border-gray-700" />

      {/* Center content */}
      <div className="flex items-center gap-2 text-gray-500">
        {/* Forward/play icon */}
        <FastForward className="w-3.5 h-3.5 text-gray-500" />

        <span className="text-xs whitespace-nowrap">Continued</span>

        {/* Turn count */}
        {numTurns != null && (
          <span className="text-[10px] text-gray-600">
            after {numTurns} turns
          </span>
        )}
      </div>

      {/* Right dashed line */}
      <div className="flex-1 border-t border-dashed border-gray-700" />
    </div>
  )
}
