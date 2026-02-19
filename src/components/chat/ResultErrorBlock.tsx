import type { ContentBlock } from '@/types'
import { AlertCircle } from 'lucide-react'

interface ResultErrorBlockProps {
  block: ContentBlock
}

export function ResultErrorBlock({ block }: ResultErrorBlockProps) {
  return (
    <div className="my-2 flex items-start gap-3 px-3 py-2 bg-red-900/10 border border-red-500/20 rounded-lg">
      {/* Alert icon */}
      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-red-400">Execution error</span>
        {block.content && (
          <p className="text-sm text-red-400/80 mt-0.5 break-words">{block.content}</p>
        )}
      </div>
    </div>
  )
}
