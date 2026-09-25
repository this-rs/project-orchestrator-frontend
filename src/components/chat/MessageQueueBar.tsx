import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Trash2, ArrowRight, Clock } from 'lucide-react'
import type { QueuedMessage } from './messageQueue'

interface MessageQueueBarProps {
  queue: QueuedMessage[]
  /** Replace a message's text. Empty text drops the message (see `editInQueue`). */
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  /**
   * Move this message to the front of the queue. Does NOT interrupt: it leaves
   * when the running response finishes (`QUEUE_POLICY.manualSendInterrupts`).
   */
  onPrioritize: (id: string) => void
}

/**
 * The pending-message queue, floating above the input bar and over the
 * conversation.
 *
 * Rendered only when non-empty, so it costs nothing on the common path. It
 * overlays rather than pushes the conversation: growing the queue must not
 * reflow the transcript the user is reading.
 */
export const MessageQueueBar = memo(function MessageQueueBar({
  queue,
  onEdit,
  onDelete,
  onPrioritize,
}: MessageQueueBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  // No effect is needed to abandon an edit when its message is auto-flushed
  // out of the queue: rows are rendered from `queue`, so the row and its input
  // disappear with the message. `editingId` is then stale but inert —
  // `commitEdit` can only fire from a rendered row, and `editInQueue` treats an
  // unknown id as a no-op (covered by its tests). Deriving beats synchronising.

  const startEdit = useCallback((m: QueuedMessage) => {
    setEditingId(m.id)
    setDraft(m.text)
  }, [])

  const commitEdit = useCallback(() => {
    if (editingId) onEdit(editingId, draft)
    setEditingId(null)
    setDraft('')
  }, [editingId, draft, onEdit])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setDraft('')
  }, [])

  if (queue.length === 0) return null

  return (
    // `pointer-events-none` on the wrapper keeps the conversation clickable
    // around the card; the card itself re-enables them.
    <div className="absolute bottom-full left-0 right-0 px-3 pb-1 z-20 pointer-events-none">
      <div className="pointer-events-auto rounded-lg border border-white/[0.08] bg-[#14161a]/95 backdrop-blur-sm shadow-lg shadow-black/40 overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-white/[0.06] text-[11px] text-gray-500">
          <Clock className="w-3 h-3" />
          <span>
            {queue.length} message{queue.length > 1 ? 's' : ''} en attente
          </span>
        </div>

        <ul className="max-h-40 overflow-y-auto divide-y divide-white/[0.04]">
          {queue.map((m) => {
            const isEditing = editingId === m.id
            return (
              <li
                key={m.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 ${
                  m.prioritized ? 'bg-indigo-500/[0.06]' : ''
                }`}
              >
                {/* `manualSendInterrupts: false` means the send button changes
                    nothing the user can see beyond the row moving, so say it. */}
                {m.prioritized && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-indigo-400/80">
                    next
                  </span>
                )}
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitEdit()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                    aria-label="Edit queued message"
                    className="flex-1 min-w-0 bg-white/[0.04] border border-indigo-500/40 rounded px-1.5 py-0.5 text-xs text-gray-200 focus:outline-none"
                  />
                ) : (
                  <span
                    className="flex-1 min-w-0 truncate text-xs text-gray-400"
                    title={m.text}
                  >
                    {m.text}
                  </span>
                )}

                {/* Actions stay mounted rather than appearing on hover — on
                    touch there is no hover, and a queued message must be
                    editable without a pointer. */}
                <div className="shrink-0 flex items-center gap-0.5">
                  <button
                    onClick={() => (isEditing ? commitEdit() : startEdit(m))}
                    aria-label={isEditing ? 'Save edit' : 'Edit message'}
                    title={isEditing ? 'Save' : 'Edit'}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDelete(m.id)}
                    aria-label="Delete message"
                    title="Delete"
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onPrioritize(m.id)}
                    aria-label="Send next — waits for the current response to finish"
                    title={
                      m.prioritized
                        ? 'Already next in line'
                        : 'Send next (waits for the current response to finish)'
                    }
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      m.prioritized
                        ? 'text-indigo-400 bg-indigo-600/10'
                        : 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-600/10'
                    }`}
                  >
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
})
