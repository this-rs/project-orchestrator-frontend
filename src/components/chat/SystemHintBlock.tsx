import type { ContentBlock } from '@/types'
import { Info } from 'lucide-react'

interface SystemHintBlockProps {
  block: ContentBlock
}

export function SystemHintBlock({ block }: SystemHintBlockProps) {
  return (
    <div className="flex items-start gap-2 py-2 my-1 px-3 rounded-lg bg-blue-900/10 border border-blue-500/15 select-none">
      <Info className="w-3.5 h-3.5 text-blue-400/70 mt-0.5 shrink-0" />
      <span className="text-xs text-blue-300/70 leading-relaxed">
        {block.content}
      </span>
    </div>
  )
}
