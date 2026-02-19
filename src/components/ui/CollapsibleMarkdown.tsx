import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ChevronDown } from 'lucide-react'
import { ExternalLink } from '@/components/ui/ExternalLink'

const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: ({ href, children, ...props }: any) => (
    <ExternalLink href={href} {...props}>
      {children}
    </ExternalLink>
  ),
}

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
          <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
        </div>
      </div>
      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 w-full py-1.5 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1"
        >
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
