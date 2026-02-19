import type { ContentBlock } from '@/types'
import { Scissors } from 'lucide-react'

interface CompactBoundaryBlockProps {
  block: ContentBlock
}

export function CompactBoundaryBlock({ block }: CompactBoundaryBlockProps) {
  const trigger = (block.metadata?.trigger as string) ?? 'auto'
  const preTokens = block.metadata?.pre_tokens as number | undefined

  return (
    <div className="flex items-center gap-3 py-3 my-2 select-none">
      {/* Left dashed line */}
      <div className="flex-1 border-t border-dashed border-gray-700" />

      {/* Center content */}
      <div className="flex items-center gap-2 text-gray-500">
        {/* Scissors icon */}
        <Scissors className="w-3.5 h-3.5 text-gray-500" />

        <span className="text-xs whitespace-nowrap">Context compacted</span>

        {/* Trigger badge */}
        <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-[10px] rounded font-medium">
          {trigger}
        </span>

        {/* Token count */}
        {preTokens != null && (
          <span className="text-[10px] text-gray-600">
            ~{Math.round(preTokens / 1000)}K tokens
          </span>
        )}
      </div>

      {/* Right dashed line */}
      <div className="flex-1 border-t border-dashed border-gray-700" />
    </div>
  )
}
