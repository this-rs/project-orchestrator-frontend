import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface CollapsibleMarkdownProps {
  content: string
  /** Max height in px before collapsing. Default 120 */
  maxHeight?: number
  className?: string
}

export function CollapsibleMarkdown({
  content,
  maxHeight = 120,
  className,
}: CollapsibleMarkdownProps) {
  const [expanded, setExpanded] = useState(false)
  const [needsCollapse, setNeedsCollapse] = useState(false)

  const handleRef = (el: HTMLDivElement | null) => {
    if (el) {
      setNeedsCollapse(el.scrollHeight > maxHeight)
    }
  }

  const collapsed = !expanded && needsCollapse

  return (
    <div className={className}>
      <div
        ref={handleRef}
        style={
          collapsed
            ? {
                maxHeight,
                overflow: 'hidden',
                maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
              }
            : undefined
        }
      >
        <div className="prose prose-invert prose-sm max-w-none break-words overflow-x-auto">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 ml-auto text-xs text-gray-400 hover:text-indigo-400 transition-colors flex items-center gap-1"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
