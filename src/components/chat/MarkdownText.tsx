import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ExternalLink } from '@/components/ui/ExternalLink'

/**
 * Markdown link component: uses ExternalLink which renders differently
 * in Tauri (no href, onClick only) vs browser (normal <a>).
 */
const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: ({ href, children, ...props }: any) => (
    <ExternalLink href={href} {...props}>
      {children}
    </ExternalLink>
  ),
}

/**
 * Memoized markdown renderer for chat text blocks.
 *
 * ReactMarkdown + rehype-highlight is EXPENSIVE (full md parse + syntax
 * highlighting of every code block). During streaming, a stream_delta event
 * arrives several times per second and updates the messages array — without
 * memoization every text block of every message re-parsed its entire content
 * on every delta: O(conversation size × delta rate) main-thread work. On
 * mobile this saturated the CPU (device heating up) and starved the chat
 * input of frames (laggy typing).
 *
 * With memo, only the single block whose `content` string actually changed
 * (the one being streamed into) re-parses; every completed block is a
 * reference-equality cache hit.
 */
export const MarkdownText = memo(function MarkdownText({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  )
})
