import type { ContentBlock } from '@/types'
import { getModelShortLabel } from '@/constants/models'
import { RefreshCw } from 'lucide-react'

interface ModelChangedBlockProps {
  block: ContentBlock
}

export function ModelChangedBlock({ block }: ModelChangedBlockProps) {
  const model = (block.metadata?.model as string) ?? 'unknown'

  return (
    <div className="flex items-center gap-2 py-1 my-1 select-none">
      {/* Refresh/switch icon */}
      <RefreshCw className="w-3 h-3 text-gray-500" />

      <span className="text-xs text-gray-500">Model &rarr;</span>

      {/* Model badge */}
      <span className="px-1.5 py-0.5 bg-violet-600/20 text-violet-400 text-[10px] rounded font-mono font-medium">
        {getModelShortLabel(model)}
      </span>
    </div>
  )
}
