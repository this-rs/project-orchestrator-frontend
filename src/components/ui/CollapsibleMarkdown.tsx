import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface CollapsibleMarkdownProps {
  content: string
  /** Max height in px before collapsing. Default 120 */
  maxHeight?: number
  className?: string
}

export function CollapsibleMarkdown({ content, maxHeight = 120, className }: CollapsibleMarkdownProps) {
  const [expanded, setExpanded] = useState(false)
  const [needsCollapse, setNeedsCollapse] = useState(false)

  const handleRef = (el: HTMLDivElement | null) => {
    if (el) {
      setNeedsCollapse(el.scrollHeight > maxHeight)
    }
  }

  return (
    <div className={className}>
      <div
        ref={handleRef}
        className="relative"
        style={!expanded && needsCollapse ? { maxHeight, overflow: 'hidden' } : undefined}
      >
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {!expanded && needsCollapse && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none" />
        )}
      </div>
      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
