import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { focusRing, glass, pressFeedback } from '@/components/ui/classes'
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight'

/**
 * The message field of an orphan request ("Reprendre la session") or of a
 * live session without thread ("Repondre").
 *
 * - Floating layer => glass is allowed (DESIGN.md, "Matiere"): a bottom sheet
 *   on a phone, a centred panel from `md`. One layer, never glass on glass.
 * - The field is `text-base` on a phone (16px, otherwise iOS zooms) and the
 *   panel pads the bottom with `env(safe-area-inset-bottom)`.
 * - It only ever SENDS A MESSAGE (`onSend(text)` = a `user_message`): the
 *   server cannot answer a dead CLI with permission_response / input_response
 *   (spike 0.1). There is deliberately no "Allow" here.
 * - Esc / backdrop / Cancel close it; Tab stays inside; a failed send keeps
 *   the text and says why.
 */

export interface ContinueSheetProps {
  open: boolean
  onClose: () => void
  /** Short title naming what is resumed ("Reprendre la session"). */
  title: string
  /** Help under the title (what resuming does). */
  help?: string
  /** Text the field opens with (editable). Re-applied each time the sheet opens. */
  initialText?: string
  /** Label of the send button. */
  submitLabel: string
  /** Sends the message; a rejection is shown and keeps the sheet open. */
  onSend: (text: string) => Promise<void>
  /** Label of the field (screen readers). */
  fieldLabel?: string
}

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return "L'envoi a échoué."
}

/** Mounted only while open, so its state (text, error) is fresh on each opening. */
function SheetBody({ onClose, title, help, initialText = '', submitLabel, onSend, fieldLabel = 'Message' }: Omit<ContinueSheetProps, 'open'>) {
  const [text, setText] = useState(initialText)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // iOS keyboard: the sheet must end on top of the keyboard, not under it (shared hook, also used by the chat).
  const keyboardBox = useVisualViewportHeight()
  const titleId = useId()
  const helpId = useId()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = fieldRef.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
    return () => previous?.focus?.()
  }, [])

  const canSend = text.trim().length > 0 && !sending

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await onSend(text.trim())
      onClose()
    } catch (e) {
      setError(errorText(e))
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!sending) onClose()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" style={keyboardBox ? { height: keyboardBox.height } : undefined} onKeyDown={onKeyDown}>
      {/* Dimmed, not blurred: the page stays readable behind the sheet. */}
      <div data-testid="sheet-backdrop" className="absolute inset-0 bg-black/50" onClick={() => !sending && onClose()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={help ? helpId : undefined}
        data-testid="continue-sheet"
        className={`${glass} relative flex max-h-[85dvh] w-full flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-2xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-2xl md:pb-4`}
      >
        <h2 id={titleId} className="text-sm font-semibold text-gray-100">
          {title}
        </h2>
        {help && (
          <p id={helpId} className="text-xs text-gray-400">
            {help}
          </p>
        )}
        <textarea
          ref={fieldRef}
          aria-label={fieldLabel}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          disabled={sending}
          className={`min-h-24 w-full resize-y rounded-lg border border-white/[0.1] bg-surface-base px-3 py-2 text-base text-gray-100 placeholder-gray-500 md:text-sm ${focusRing}`}
        />
        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className={`min-h-9 rounded-lg px-3 text-sm text-gray-300 hover:bg-white/[0.06] disabled:opacity-50 ${pressFeedback} ${focusRing}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${pressFeedback} ${focusRing}`}
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ContinueSheet({ open, ...rest }: ContinueSheetProps) {
  if (!open) return null
  return <SheetBody {...rest} />
}
