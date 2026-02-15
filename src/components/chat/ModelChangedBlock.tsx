import type { ContentBlock } from '@/types'

interface ModelChangedBlockProps {
  block: ContentBlock
}

export function ModelChangedBlock({ block }: ModelChangedBlockProps) {
  const model = (block.metadata?.model as string) ?? 'unknown'

  // Extract short label from full model name (e.g. "claude-opus-4-6" → "Opus 4.6")
  const shortLabel = (() => {
    if (model.includes('opus-4-6')) return 'Opus 4.6'
    if (model.includes('opus-4-5')) return 'Opus 4.5'
    if (model.includes('opus')) return 'Opus'
    if (model.includes('sonnet-4-5')) return 'Sonnet 4.5'
    if (model.includes('sonnet')) return 'Sonnet'
    if (model.includes('haiku')) return 'Haiku'
    return model
  })()

  return (
    <div className="flex items-center gap-2 py-1 my-1 select-none">
      {/* Refresh/switch icon (SVG) */}
      <svg
        className="w-3 h-3 text-gray-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992"
        />
      </svg>

      <span className="text-xs text-gray-500">Model →</span>

      {/* Model badge */}
      <span className="px-1.5 py-0.5 bg-violet-600/20 text-violet-400 text-[10px] rounded font-mono font-medium">
        {shortLabel}
      </span>
    </div>
  )
}
