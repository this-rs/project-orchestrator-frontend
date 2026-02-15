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
        {/* Scissors icon (SVG) */}
        <svg
          className="w-3.5 h-3.5 text-gray-500"
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
