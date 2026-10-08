import type { ContentBlock } from '@/types'

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
        {/* The settled core of the compaction: the dense point the particles converged on */}
        <span aria-hidden="true" className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-indigo-400/40 blur-[3px]" />
          <span className="relative h-2 w-2 rounded-full bg-indigo-400" />
        </span>

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
