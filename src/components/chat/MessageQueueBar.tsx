import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Trash2, ArrowRight, Zap, Clock } from 'lucide-react'
import type { QueuedMessage } from './messageQueue'

interface MessageQueueBarProps {
  queue: QueuedMessage[]
  /** Replace a message's text. Empty text drops the message (see `editInQueue`). */
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  /**
   * First click on the row's send button: move this message to the front of the
   * queue and mark it "next". Does NOT interrupt — it leaves when the running
   * response finishes.
   */
  onPrioritize: (id: string) => void
  /**
   * Second click, on a row already marked "next": dispatch it now. The backend
   * interrupts the running generation to process it
   * (`QUEUE_POLICY.manualSendInterrupts`).
   */
  onSendNow: (id: string) => void
}

/**
 * The pending-message queue, sitting directly above the composer.
 *
 * Rendered only when non-empty, so it costs nothing on the common path.
 *
 * It is a normal block in the composer's column, NOT an overlay. The first
 * version floated it (`absolute bottom-full`) to avoid reflowing the transcript;
 * the result was a panel that could be covered, clipped or simply missed, and
 * "I queue a message and see nothing" was the actual bug report. Taking the
 * height is the price of being unmissable — and the transcript is pinned to its
 * bottom anyway, so what it pushes up is what the user already read.
 */
export const MessageQueueBar = memo(function MessageQueueBar({
  queue,
  onEdit,
  onDelete,
  onPrioritize,
  onSendNow,
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
    <div
      className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden"
      data-testid="message-queue"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-white/[0.06] text-[11px] text-gray-500">
        <Clock className="w-3 h-3" />
        <span>
          {queue.length} message{queue.length > 1 ? 's' : ''} en attente
        </span>
        <span className="ml-auto text-[10px] text-gray-600">
          part à la fin de la réponse
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
              {/* The first click's only visible effect is this badge and the
                  row moving, so it has to be legible — and it doubles as the
                  cue that the button now means "send now". */}
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
                {/* One button, two stages. A separate "send now" button would
                    put a response-truncating action one stray tap away; here it
                    is only reachable once the row says "next". */}
                <button
                  onClick={() => (m.prioritized ? onSendNow(m.id) : onPrioritize(m.id))}
                  aria-label={
                    m.prioritized
                      ? 'Send now — interrupts the current response'
                      : 'Send next — waits for the current response to finish'
                  }
                  title={
                    m.prioritized
                      ? 'Envoyer maintenant (interrompt la réponse en cours)'
                      : 'Envoyer ensuite (attend la fin de la réponse)'
                  }
                  data-stage={m.prioritized ? 'send-now' : 'send-next'}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                    m.prioritized
                      ? 'text-indigo-300 bg-indigo-600/20 hover:bg-indigo-600/40 hover:text-white'
                      : 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-600/10'
                  }`}
                >
                  {m.prioritized ? <Zap className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
})
