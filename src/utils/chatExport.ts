import type { ChatMessage, ContentBlock } from '@/types'

export interface ChatExportMeta {
  sessionId?: string
  projectSlug?: string
  workspaceSlug?: string
  exportedAt: Date
}

/**
 * Serialize a block to readable markdown.
 * Tool calls are summarized, images/binary replaced by placeholders.
 */
function blockToMarkdown(block: ContentBlock): string {
  switch (block.type) {
    case 'text':
      return block.content

    case 'thinking':
      return `<details>\n<summary>Thinking...</summary>\n\n${block.content}\n</details>`

    case 'tool_use': {
      const toolName = (block.metadata?.tool_name as string) ?? 'unknown_tool'
      // Truncate very long inputs for readability
      const input = block.content.length > 2000
        ? block.content.slice(0, 2000) + '\n[... truncated]'
        : block.content
      return `**Tool Call: \`${toolName}\`**\n\`\`\`\n${input}\n\`\`\``
    }

    case 'tool_result': {
      const content = block.content || '(empty result)'
      const truncated = content.length > 3000
        ? content.slice(0, 3000) + '\n[... truncated]'
        : content
      const isError = block.metadata?.is_error ? ' (ERROR)' : ''
      return `**Tool Result${isError}:**\n\`\`\`\n${truncated}\n\`\`\``
    }

    case 'error':
    case 'result_error':
      return `> **Error:** ${block.content}`

    case 'result_max_turns':
      return `> *Max turns reached*`

    case 'compact_boundary':
      return `---\n*Context compacted*\n---`

    case 'system_init':
    case 'system_hint':
      return `> *System: ${block.content}*`

    case 'continue_indicator':
    case 'retry_indicator':
      return '' // Skip UI-only indicators

    case 'permission_request':
      return `> **Permission requested:** ${block.content}`

    case 'input_request':
    case 'ask_user_question':
      return `> **Input requested:** ${block.content}`

    case 'model_changed':
      return `> *Model changed: ${block.content}*`

    case 'viz':
      return '[Visualization]'

    default:
      return block.content || ''
  }
}

/**
 * Serialize a ChatMessage to markdown.
 */
function messageToMarkdown(msg: ChatMessage, index: number): string {
  const role = msg.role === 'user' ? 'User' : 'Assistant'
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''
  const costInfo = msg.cost_usd ? ` ($${msg.cost_usd.toFixed(4)})` : ''
  const durationInfo = msg.duration_ms ? ` (${(msg.duration_ms / 1000).toFixed(1)}s)` : ''

  const header = `### ${index + 1}. ${role}${time ? ` — ${time}` : ''}${costInfo}${durationInfo}`

  const body = msg.blocks
    .map(blockToMarkdown)
    .filter(Boolean)
    .join('\n\n')

  return `${header}\n\n${body}`
}

/**
 * Serialize a single message to markdown without the role/index header.
 *
 * Intended for the per-message "Copy as Markdown" button — the user already
 * sees who wrote the message in the UI, so the heading would be redundant
 * when pasting elsewhere. Empty blocks (UI-only indicators) are filtered out.
 *
 * For full debug exports with headers + metadata, use `messagesToMarkdown`.
 */
export function messageBodyToMarkdown(msg: ChatMessage): string {
  return msg.blocks
    .map(blockToMarkdown)
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Serialize an array of ChatMessages to a full markdown document.
 * Designed for debugging — includes all tool calls, errors, etc.
 */
export function messagesToMarkdown(
  messages: ChatMessage[],
  meta?: ChatExportMeta,
): string {
  const lines: string[] = []

  // Header
  lines.push('# Chat Export')
  if (meta?.sessionId) lines.push(`**Session:** \`${meta.sessionId}\``)
  if (meta?.projectSlug) lines.push(`**Project:** ${meta.projectSlug}`)
  if (meta?.workspaceSlug) lines.push(`**Workspace:** ${meta.workspaceSlug}`)
  lines.push(`**Exported:** ${(meta?.exportedAt ?? new Date()).toLocaleString()}`)
  lines.push(`**Messages:** ${messages.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Messages
  for (let i = 0; i < messages.length; i++) {
    lines.push(messageToMarkdown(messages[i], i))
    lines.push('')
  }

  return lines.join('\n')
}
