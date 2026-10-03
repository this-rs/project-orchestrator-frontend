/**
 * Documents attached to a chat message, as they come back from the server.
 *
 * The backend folds the references into the message text as one trailing
 * `<po-attachments>[…]</po-attachments>` block (`chat::message_attachments`
 * in the backend — this file is its twin). Every path that carries a message
 * (live broadcast, history replay, queue drain) therefore carries the
 * attachments too, with no field to forget on any of them.
 *
 * Anything that shows or compares a user message's text must go through
 * `splitAttachments` first; otherwise the raw JSON ends up in the bubble.
 */

export interface MessageAttachment {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
}

const OPEN = '\n\n<po-attachments>'
const CLOSE = '</po-attachments>'

/**
 * The visible text and the references of a stored message.
 *
 * A block that does not parse is left in the text: showing an odd line is
 * better than losing what the user wrote.
 */
export function splitAttachments(content: string): {
  text: string
  attachments: MessageAttachment[]
} {
  const start = content.lastIndexOf(OPEN)
  if (start >= 0 && content.endsWith(CLOSE)) {
    const inner = content.slice(start + OPEN.length, content.length - CLOSE.length)
    try {
      const parsed: unknown = JSON.parse(inner)
      if (Array.isArray(parsed)) {
        const attachments = parsed.filter(
          (a): a is MessageAttachment =>
            !!a && typeof a === 'object' && typeof (a as MessageAttachment).id === 'string',
        )
        return { text: content.slice(0, start), attachments }
      }
    } catch {
      /* fall through: not our block */
    }
  }
  return { text: content, attachments: [] }
}
