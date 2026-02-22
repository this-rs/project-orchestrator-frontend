import type { ContentBlock } from '@/types'
import { RotateCw } from 'lucide-react'

interface RetryIndicatorBlockProps {
  block: ContentBlock
}

export function RetryIndicatorBlock({ block }: RetryIndicatorBlockProps) {
  const attempt = block.metadata?.attempt as number | undefined
  const maxAttempts = block.metadata?.max_attempts as number | undefined
  const errorMessage = block.metadata?.error_message as string | undefined

  return (
    <div className="flex items-center gap-3 py-3 my-2 select-none">
      {/* Left dashed line */}
      <div className="flex-1 border-t border-dashed border-amber-700/50" />

      {/* Center content */}
      <div className="flex items-center gap-2 text-amber-500">
        <RotateCw className="w-3.5 h-3.5 text-amber-500" />

        <span className="text-xs whitespace-nowrap">
          {maxAttempts
            ? `Retrying (${attempt}/${maxAttempts})`
            : `Retrying (attempt ${attempt})`}
        </span>

        {errorMessage && (
          <span className="text-[10px] text-amber-600 max-w-48 truncate" title={errorMessage}>
            {errorMessage}
          </span>
        )}
      </div>

      {/* Right dashed line */}
      <div className="flex-1 border-t border-dashed border-amber-700/50" />
    </div>
  )
}
