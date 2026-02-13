/**
 * ChatRenderer — views for chat_send_message and related tools.
 *
 * Handles: chat_send_message (response with markdown text, cost, duration),
 * get_chat_session details.
 */

import type { ReactNode } from 'react'
import { McpContainer, truncate, TimeAgo, ShortId, LinkedId } from './utils'
import { ExternalLink } from '@/components/ui/ExternalLink'

// ---------------------------------------------------------------------------
// Cost formatting — smart precision based on magnitude
// ---------------------------------------------------------------------------

function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`
  if (usd >= 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(4)}`
}

// ---------------------------------------------------------------------------
// Lightweight inline markdown renderer (regex-only, no library)
// ---------------------------------------------------------------------------

/** Render inline markdown spans: bold, italic, code, links */
function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Priority order: inline code, bold, italic, links
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const full = match[0]

    if (match[1]) {
      // inline `code`
      const code = full.slice(1, -1)
      nodes.push(
        <code key={match.index} className="px-1 py-0.5 bg-white/[0.08] rounded text-[10px] font-mono text-gray-300">{code}</code>
      )
    } else if (match[2]) {
      // **bold**
      nodes.push(
        <strong key={match.index} className="text-gray-300">{full.slice(2, -2)}</strong>
      )
    } else if (match[3]) {
      // *italic*
      nodes.push(
        <em key={match.index}>{full.slice(1, -1)}</em>
      )
    } else if (match[4]) {
      // [text](url)
      const linkMatch = full.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (linkMatch) {
        const linkHref = linkMatch[2]
        nodes.push(
          <ExternalLink
            key={match.index}
            href={linkHref}
            className="text-indigo-400 hover:underline"
          >
            {linkMatch[1]}
          </ExternalLink>
        )
      } else {
        nodes.push(full)
      }
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

/**
 * Render a block of text as lightweight markdown.
 * Handles: # H1, ## H2, **bold**, *italic*, `code`, ```code blocks```,
 * - / * bullet lists, [text](url) links, empty-line spacers.
 */
function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block: ```...```
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++ // skip opening fence
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing fence
      nodes.push(
        <pre
          key={`code-${i}`}
          className="bg-black/30 rounded p-2 text-[10px] font-mono overflow-x-auto my-1 text-gray-400"
        >
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // ## H2
    if (line.startsWith('## ')) {
      nodes.push(
        <div key={`h2-${i}`} className="text-gray-400 font-semibold text-[11px] mt-1.5">
          {renderInlineMarkdown(line.slice(3))}
        </div>
      )
      i++
      continue
    }

    // # H1
    if (line.startsWith('# ')) {
      nodes.push(
        <div key={`h1-${i}`} className="text-gray-300 font-bold text-xs mt-2">
          {renderInlineMarkdown(line.slice(2))}
        </div>
      )
      i++
      continue
    }

    // Bullet list: - item or * item (but not ** which is bold)
    if (/^[\s]*[-*]\s/.test(line) && !line.trimStart().startsWith('**')) {
      const bulletContent = line.replace(/^[\s]*[-*]\s/, '')
      nodes.push(
        <div key={`li-${i}`} className="flex gap-1.5 ml-1">
          <span className="text-gray-600 select-none shrink-0">&#x2022;</span>
          <span>{renderInlineMarkdown(bulletContent)}</span>
        </div>
      )
      i++
      continue
    }

    // Empty line → spacer
    if (line.trim() === '') {
      nodes.push(<div key={`br-${i}`} className="h-1" />)
      i++
      continue
    }

    // Regular paragraph with inline markdown
    nodes.push(
      <div key={`p-${i}`}>{renderInlineMarkdown(line)}</div>
    )
    i++
  }

  return nodes
}

// ---------------------------------------------------------------------------
// chat_send_message result
// ---------------------------------------------------------------------------

function ChatSendMessageResult({ data, toolInput }: { data: Record<string, unknown>; toolInput?: Record<string, unknown> }) {
  const sentMessage = toolInput?.message as string | undefined
  const response = data.response as string | undefined
  const costUsd = data.cost_usd as number | undefined
  const durationMs = data.duration_ms as number | undefined
  const sessionId = data.session_id as string | undefined

  return (
    <McpContainer>
      {/* Sent message */}
      {sentMessage && (
        <div className="border-l-2 border-blue-500/40 pl-2.5 py-1">
          <div className="text-[10px] text-blue-400/70 font-medium mb-0.5">You</div>
          <div className="text-gray-500 text-[11px] whitespace-pre-wrap leading-relaxed">
            {truncate(sentMessage, 500)}
          </div>
        </div>
      )}

      {/* Response text — rendered as markdown */}
      {response && (
        <div className="border-l-2 border-green-500/40 pl-2.5 py-1">
          <div className="text-[10px] text-green-400/70 font-medium mb-0.5">Assistant</div>
          <div className="text-gray-400 text-[11px] max-h-60 overflow-y-auto leading-relaxed space-y-0.5">
            {renderMarkdown(truncate(response, 2000))}
          </div>
        </div>
      )}

      {/* Footer with metadata */}
      <div className="flex items-center gap-3 pt-1 border-t border-white/[0.04] text-[10px] text-gray-600">
        {durationMs != null && (
          <span>{(durationMs / 1000).toFixed(1)}s</span>
        )}
        {costUsd != null && costUsd > 0 && (
          <span>{formatCost(costUsd)}</span>
        )}
        {sessionId && (
          <LinkedId field="session_id" value={sessionId} />
        )}
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Chat session detail
// ---------------------------------------------------------------------------

function ChatSessionDetail({ data }: { data: Record<string, unknown> }) {
  const title = (data.title ?? data.preview) as string | undefined
  const model = data.model as string | undefined
  const cost = data.total_cost_usd as number | undefined
  const msgCount = data.message_count as number | undefined

  return (
    <McpContainer>
      {title && (
        <div className="text-gray-300 font-medium">{truncate(title, 100)}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-1">
        {model && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-800/20">
            {model}
          </span>
        )}
        {msgCount != null && (
          <span className="text-[10px] text-gray-600">
            {msgCount} message{msgCount !== 1 ? 's' : ''}
          </span>
        )}
        {cost != null && cost > 0 && (
          <span className="text-[10px] text-gray-600">{formatCost(cost)}</span>
        )}
      </div>

      <div className="space-y-0.5 mt-1.5 text-[10px]">
        {data.cwd ? (
          <div className="text-gray-600 font-mono truncate">{String(data.cwd)}</div>
        ) : null}
        <div className="flex items-center gap-2 text-gray-600">
          <TimeAgo date={String(data.updated_at ?? data.created_at ?? '')} />
          {data.cli_session_id ? (
            <ShortId id={String(data.cli_session_id)} entityType="session" />
          ) : null}
        </div>
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function ChatRenderer({ action, parsed, toolInput }: { action: string; parsed: unknown; toolInput?: Record<string, unknown> }) {
  if (!parsed || typeof parsed !== 'object') return null
  const data = parsed as Record<string, unknown>

  switch (action) {
    case 'chat_send_message':
      return <ChatSendMessageResult data={data} toolInput={toolInput} />
    case 'get_chat_session':
      return <ChatSessionDetail data={data} />
    default:
      return null
  }
}
