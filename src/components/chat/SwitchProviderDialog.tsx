import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { useT } from '@/i18n'
import { PROVIDER_ERROR_TITLES, providerErrorExplanation } from '@/constants/providerErrors'
import type { SwitchProviderRefusal } from '@/services/chat'

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'
/** 24px at least with a mouse, 44px on a touch screen. */
const TARGET = 'min-h-6 pointer-coarse:min-h-11'
const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export interface SwitchProviderDialogProps {
  /** Where the conversation goes: "Provider › model". */
  target: string
  /** Where it runs now. */
  current: string
  /** The composer's draft: the message to send, editable. Empty = asked here. */
  initialMessage: string
  pending: boolean
  refusal: SwitchProviderRefusal | null
  projectSlug?: string | null
  onConfirm: (message: string) => void
  onCancel: () => void
  /** Where focus goes back when the dialog closes (the element that opened it may be gone). */
  returnFocus?: () => HTMLElement | null
}

/**
 * Confirmation of a move to another provider: what happens (a new session, the history
 * replayed as text, the oldest turns possibly left out, this session closed) and the
 * message to continue with, which the route requires. Modal: focus is trapped inside,
 * Escape cancels, and focus goes back to the menu's trigger on close.
 */
export function SwitchProviderDialog({ target, current, initialMessage, pending, refusal, projectSlug, onConfirm, onCancel, returnFocus }: SwitchProviderDialogProps) {
  const { t } = useT()
  const id = useId()
  const [message, setMessage] = useState(initialMessage)
  const [missing, setMissing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const returnFocusRef = useRef(returnFocus)

  // Focus the message on open; give focus back on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    textareaRef.current?.focus()
    const back = returnFocusRef.current
    return () => {
      const el = (previous && previous !== document.body && previous.isConnected ? previous : null) ?? back?.() ?? null
      el?.focus()
    }
  }, [])

  const submit = () => {
    if (pending) return
    if (!message.trim()) {
      setMissing(true)
      textareaRef.current?.focus()
      return
    }
    onConfirm(message)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!pending) onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
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

  const refusalText =
    refusal === null
      ? null
      : refusal.kind === 'provider'
        ? `${PROVIDER_ERROR_TITLES[refusal.info.code]}. ${providerErrorExplanation(refusal.info, projectSlug)}`
        : t(`routing.switch.refused.${refusal.kind}`)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="switch-provider-dialog">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={() => !pending && onCancel()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-what`}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-md rounded-xl border border-white/[0.08] bg-surface-popover p-4 text-sm text-gray-200 shadow-xl"
      >
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold text-gray-100">
          <ArrowRightLeft className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
          <span className="min-w-0 break-words">{t('routing.switch.title', { target })}</span>
        </h2>
        <ul id={`${id}-what`} className="mt-3 list-disc space-y-1 pl-5 text-xs leading-snug text-gray-300">
          <li>{t('routing.switch.newSession', { target })}</li>
          <li>{t('routing.switch.replay')}</li>
          <li>{t('routing.switch.omitted')}</li>
          <li>{t('routing.switch.closed', { current })}</li>
        </ul>
        <label htmlFor={`${id}-message`} className="mt-4 block text-xs font-medium text-gray-200">
          {t('routing.switch.message', { target })}
        </label>
        <textarea
          id={`${id}-message`}
          ref={textareaRef}
          data-testid="switch-provider-message"
          required
          aria-required="true"
          aria-invalid={missing && !message.trim() ? true : undefined}
          aria-describedby={`${id}-hint`}
          value={message}
          disabled={pending}
          onChange={(e) => {
            setMessage(e.target.value)
            if (e.target.value.trim()) setMissing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          rows={3}
          className={`mt-1 w-full resize-y rounded border border-white/[0.12] bg-surface-base px-2 py-1.5 text-base text-gray-100 placeholder-gray-500 sm:text-xs ${FOCUS}`}
        />
        <p id={`${id}-hint`} className={`mt-1 text-[11px] leading-snug ${missing && !message.trim() ? 'text-amber-200' : 'text-gray-500'}`}>
          {missing && !message.trim() ? t('routing.switch.messageMissing') : t('routing.switch.messageHint')}
        </p>
        {refusalText && (
          <p role="alert" data-testid="switch-provider-refusal" className="mt-3 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{refusalText}</span>
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className={`rounded px-3 py-1 text-xs text-gray-300 hover:bg-white/[0.06] disabled:opacity-50 ${TARGET} ${FOCUS}`}>
            {t('routing.switch.cancel')}
          </button>
          <button
            type="button"
            data-testid="switch-provider-confirm"
            onClick={submit}
            disabled={pending}
            aria-busy={pending || undefined}
            className={`rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60 ${TARGET} ${FOCUS}`}
          >
            {pending ? t('routing.switch.pending') : t('routing.switch.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
