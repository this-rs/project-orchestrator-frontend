import type { ContentBlock } from '@/types'

interface ResultErrorBlockProps {
  block: ContentBlock
}

export function ResultErrorBlock({ block }: ResultErrorBlockProps) {
  return (
    <div className="my-2 flex items-start gap-3 px-3 py-2 bg-red-900/10 border border-red-500/20 rounded-lg">
      {/* Alert icon */}
      <svg
        className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>

      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-red-400">Execution error</span>
        {block.content && (
          <p className="text-sm text-red-400/80 mt-0.5 break-words">{block.content}</p>
        )}
      </div>
    </div>
  )
}
