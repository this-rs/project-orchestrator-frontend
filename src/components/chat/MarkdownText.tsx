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
 * Trailing, still-incomplete line made only of `-` or `=` (up to 3 leading
 * spaces, optional trailing blanks) that directly follows another line.
 */
const SETEXT_UNDERLINE_TAIL = /\n {0,3}(?:-+|=+)[ \t]*$/

/**
 * Hold back an ambiguous trailing line while the block is still streaming.
 *
 * LLMs constantly write "Voici les étapes :\n- première étape". Mid-stream,
 * the text often ends at "Voici les étapes :\n-": CommonMark reads a lone
 * `-` (or `=`) line under a paragraph as a SETEXT HEADING underline, so the
 * whole previous line flashes as a big <h2> for a frame or two until the
 * next delta turns it into a list item — visible flicker. Deferring that
 * single unterminated line until the next delta (or the newline that
 * completes it) removes the flash; once the line is complete it renders
 * exactly as CommonMark says, so a real `Title\n---` heading is unaffected.
 */
function holdBackAmbiguousTail(content: string): string {
  const m = SETEXT_UNDERLINE_TAIL.exec(content)
  return m ? content.slice(0, m.index + 1) : content
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
 *
 * `isStreaming` must only be set on the block currently receiving deltas.
 */
export const MarkdownText = memo(function MarkdownText({
  content,
  isStreaming = false,
}: {
  content: string
  isStreaming?: boolean
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={markdownComponents}
    >
      {isStreaming ? holdBackAmbiguousTail(content) : content}
    </ReactMarkdown>
  )
})
