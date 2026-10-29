import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { Pencil, Trash2, ArrowRight, Zap, Clock, Check, X } from 'lucide-react'
import type { QueuedMessage } from './messageQueue'

/**
 * Where the edit box stops growing and starts scrolling.
 *
 * A queued message can be long, but this row lives in the composer tray: past
 * roughly four lines the tray would push the conversation off the screen to
 * show a message that is not being written yet.
 */
const EDIT_MAX_PX = 96

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
  /**
   * Rendered inside the composer tray, under the activity bar: the tray draws
   * the one outline, so the queue must not draw a second.
   */
  bare?: boolean
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
 *
 * ## Editing a row: one box, two decisions
 *
 * A row being edited shows its whole text in a box that follows it (up to
 * `EDIT_MAX_PX`, then it scrolls) and two buttons where the row's actions were:
 * the pencil *becomes* ✓ (save the new text), and ✕ (keep the old one) appears
 * beside it. The glyph swap is the message: the same button, now meaning "commit
 * this edit", so nothing moves under the pointer between reading and correcting.
 *
 * Delete and the two-stage send button step aside for the duration. They would
 * act on the text being REPLACED — "send now" would ship the old wording, delete
 * would throw the edit away — and both are one stray tap from ✕. They come back
 * as soon as the edit ends.
 *
 * Leaving the box saves (a blur is the click that walks away, and silently
 * dropping what was typed is worse than saving it). That is why ✓ and ✕ cancel
 * their own mousedown: without it the browser would blur the box first, the save
 * would already have run, and ✕ would discard nothing.
 */
export const MessageQueueBar = memo(function MessageQueueBar({
  queue,
  onEdit,
  onDelete,
  onPrioritize,
  onSendNow,
  bare = false,
}: MessageQueueBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Focus the box, caret at the end: a queued message is corrected, rarely
  // rewritten. preventScroll because the tray floats over the transcript —
  // letting the browser scroll the field into view pans the whole page on iOS.
  useEffect(() => {
    if (!editingId) return
    const el = editRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [editingId])

  // The box follows the text it holds, soft wraps included.
  //
  // This IS the naive reset-then-measure the composer avoids (a write then a
  // read per keystroke): there it runs on the app's busiest field, here on one
  // short-lived row, where the two extra reflows are not measurable. jsdom
  // reports `scrollHeight === 0`, so under test the CSS height stays in charge.
  useLayoutEffect(() => {
    const el = editRef.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, EDIT_MAX_PX)}px`
  }, [draft, editingId])

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
    // Unchanged text is not an edit: closing the box must not push a `queue_op`
    // for nothing. An emptied box is one — `editInQueue` drops the message.
    const current = queue.find((m) => m.id === editingId)
    if (editingId && current && current.text !== draft.trim()) onEdit(editingId, draft)
    setEditingId(null)
    setDraft('')
  }, [editingId, draft, onEdit, queue])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setDraft('')
  }, [])

  if (queue.length === 0) return null

  return (
    <div
      className={bare ? '' : 'rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden'}
      data-testid="message-queue"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-white/[0.06] text-[11px] text-gray-500">
        <Clock className="w-3 h-3" />
        <span>
          {queue.length} message{queue.length > 1 ? 's' : ''} queued
        </span>
        <span className="ml-auto text-[10px] text-gray-600">
          sent when the response ends
        </span>
      </div>

      <ul className="max-h-40 overflow-y-auto divide-y divide-white/[0.04]">
        {queue.map((m) => {
          const isEditing = editingId === m.id
          return (
            <li
              key={m.id}
              className={`flex gap-2 px-2.5 py-1.5 ${
                isEditing ? 'items-end' : 'items-center'
              } ${m.prioritized ? 'bg-indigo-500/[0.06]' : ''}`}
            >
              {/* The first click's only visible effect is this badge and the
                  row moving, so it has to be legible — and it doubles as the
                  cue that the button now means "send now". */}
              {m.prioritized && (
                <span className="shrink-0 self-center text-[10px] uppercase tracking-wide text-indigo-400/80">
                  next
                </span>
              )}
              {isEditing ? (
                <textarea
                  ref={editRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    // Enter saves: this is a correction field, not a second
                    // composer — leaving a line break costs Shift+Enter, and
                    // the row stays compact on every device.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      commitEdit()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelEdit()
                    }
                  }}
                  rows={1}
                  aria-label="Edit queued message"
                  data-testid="queue-edit-box"
                  // The soft keyboard's key says what it does here — it saves.
                  // No phone offers Shift+Enter, so calling it "Return" would
                  // promise a line break the reader can never get back.
                  enterKeyHint="done"
                  // Follows its text: one line, then more, then it scrolls
                  // (EDIT_MAX_PX). No manual resize handle in a row.
                  className="flex-1 min-w-0 max-h-24 resize-none overflow-y-auto bg-white/[0.04] border border-indigo-500/40 rounded px-1.5 py-1 text-xs leading-5 text-gray-200 focus:outline-none"
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
                {/* The pencil's slot, one glyph further: ✓ commits the text in
                    the box. Same place, so the pointer does not have to hunt
                    for a new button to finish what it started. */}
                <button
                  onClick={() => (isEditing ? commitEdit() : startEdit(m))}
                  // Keep the focus where it is: a mousedown would blur the box
                  // (blur saves) before this click runs — ✕ would then discard
                  // an edit that had already been committed.
                  onMouseDown={(e) => {
                    if (isEditing) e.preventDefault()
                  }}
                  aria-label={isEditing ? 'Save edit' : 'Edit message'}
                  title={isEditing ? 'Save (Enter)' : 'Edit'}
                  data-action={isEditing ? 'save-edit' : 'start-edit'}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
                >
                  {isEditing ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                </button>
                {isEditing ? (
                  // Beside the ✓, and only while editing: the way out that keeps
                  // the message as it was (Esc does the same from the keyboard).
                  <button
                    onClick={cancelEdit}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Cancel edit"
                    title="Cancel (Esc)"
                    data-action="cancel-edit"
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  <>
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
                          ? 'Send now (interrupts the current response)'
                          : 'Send next (waits for the current response to finish)'
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
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
})
