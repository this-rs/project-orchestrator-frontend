/**
 * « Demander ici » (Cmd+K / Ctrl+K): a question asked from the page on screen,
 * in a new conversation anchored on that page.
 *
 * - The page's entity (`ui_context`) is a SUGGESTION, pre-checked: Enter
 *   confirms it, a click or Space on its checkbox drops it.
 * - What leaves about the page is shown exactly as sent: an allow-list
 *   (type, id, name), the name stripped of what looks like a secret, labelled
 *   "not verified" — the server re-reads the entity and has the last word.
 * - Keyboard and screen reader first: the question box takes the focus, Enter
 *   asks, Shift+Enter adds a line, Esc closes, Tab stays in the dialog, every
 *   refusal is spoken (live region).
 * - A server without the anchors routes: said before asking; the page still
 *   travels as a reference of the message (when the server takes references).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { MessageSquarePlus, ShieldQuestion } from 'lucide-react'
import { chatPanelModeAtom, refsEnabledAtom } from '@/atoms/chat'
import { askHereOpenAtom, askHereRequestAtom, uiContextAtom } from '@/atoms/anchors'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { focusRing } from '@/components/ui/classes'
import { useModalFocus } from '@/hooks/useModalFocus'
import { routeToRef } from '@/refs/entityRoutes'
import { refKindDef } from '@/refs/registry'
import { fallbackName } from '@/refs/refState'
import { isRefKind, type ChatReference } from '@/refs/types'
import { refToken } from '@/utils/messageRefs'
import { anchorsApi, AnchorsUnavailableError } from '@/services/anchors'
import { ASK_HERE_SHORTCUT_LABEL, isAskHereKey, isModKClaimed } from './askHereShortcut'
import { buildSnapshot } from './snapshot'

/** Opens the palette on Cmd+K / Ctrl+K, unless the screen owns that key. */
function useAskHereShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isAskHereKey(e) || e.defaultPrevented || isModKClaimed()) return
      e.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
}

let nextRequestId = 1

export function AskHerePalette() {
  const { t } = useT()
  const [isOpen, setOpen] = useAtom(askHereOpenAtom)
  const uiContext = useAtomValue(uiContextAtom)
  const refsEnabled = useAtomValue(refsEnabledAtom)
  const setRequest = useSetAtom(askHereRequestAtom)
  const [panelMode, setPanelMode] = useAtom(chatPanelModeAtom)
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [checked, setChecked] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anchorsAvailable, setAnchorsAvailable] = useState<boolean | null>(null)
  const titleId = useId()
  const descId = useId()
  const checkId = useId()

  const openPalette = useCallback(() => setOpen(true), [setOpen])
  useAskHereShortcut(openPalette)
  const close = useCallback(() => setOpen(false), [setOpen])
  useModalFocus(containerRef, { active: isOpen, initialFocus: textRef, onEscape: close })

  // The page's entity: what it declared, else what its address designates.
  const entity = useMemo(() => {
    if (uiContext) return uiContext
    const ref = routeToRef(location.pathname)
    return ref ? { kind: ref.kind, id: ref.id } : null
  }, [uiContext, location.pathname])

  const snapshot = useMemo(() => (entity ? buildSnapshot(entity, t('anchors.ask.redacted')) : null), [entity, t])
  const canReference = !!entity && refsEnabled && isRefKind(entity.kind)

  // Each opening starts from the suggestion, checked, and asks the server once whether it anchors.
  useEffect(() => {
    if (!isOpen) return
    setChecked(true)
    setError(null)
    setAnchorsAvailable(null)
    const anchor = snapshot?.anchor
    if (!anchor) return
    let live = true
    void Promise.resolve()
      .then(() => anchorsApi.listAnchoredSessions({ target_type: anchor.target_type, target_id: anchor.target_id, limit: 1 }))
      .then(() => live && setAnchorsAvailable(true))
      .catch((err: unknown) => live && setAnchorsAvailable(!(err instanceof AnchorsUnavailableError)))
    return () => {
      live = false
    }
  }, [isOpen, snapshot])

  const submit = useCallback(() => {
    const question = text.trim()
    if (!question) {
      setError(t('anchors.ask.emptyQuestion'))
      textRef.current?.focus()
      return
    }
    const refs: ChatReference[] = []
    let message = question
    if (checked && entity && canReference) {
      const ref: ChatReference = { kind: entity.kind, id: entity.id, ...(entity.label ? { label: entity.label } : {}) }
      refs.push(ref)
      message = `${question} ${refToken(ref)}`
    }
    const anchors = checked && snapshot?.anchor && anchorsAvailable !== false ? [snapshot.anchor] : []
    setRequest({ id: nextRequestId++, text: message, refs, anchors })
    if (panelMode === 'closed') setPanelMode('open')
    setText('')
    setOpen(false)
  }, [text, checked, entity, canReference, snapshot, anchorsAvailable, setRequest, panelMode, setPanelMode, setOpen, t])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  if (!isOpen) return null

  const def = entity ? refKindDef(entity.kind) : null
  const name = entity ? (entity.label?.trim() || fallbackName(entity)) : ''
  const anchor = snapshot?.anchor ?? null

  return createPortal(
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-end justify-center md:items-start md:p-4 md:pt-[12vh]" data-testid="ask-here">
      <div className="absolute inset-0 bg-black/60" onClick={close} aria-hidden="true" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onSubmit={onSubmit}
        className="relative w-full max-h-[90dvh] overflow-y-auto rounded-t-xl border border-white/[0.08] bg-surface-popover p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl md:max-w-lg md:rounded-xl md:pb-4"
      >
        <div className="flex items-start gap-2">
          <MessageSquarePlus className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-gray-100">
              {t('anchors.ask.title')}
            </h2>
            <p id={descId} className="text-xs text-gray-400">
              {t('anchors.ask.description')} <span className="text-gray-500">{t('anchors.ask.shortcut', { shortcut: ASK_HERE_SHORTCUT_LABEL })}</span>
            </p>
          </div>
        </div>

        <label htmlFor={`${titleId}-q`} className="mt-3 block text-xs font-medium text-gray-300">
          {t('anchors.ask.questionLabel')}
        </label>
        <textarea
          id={`${titleId}-q`}
          ref={textRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={t('anchors.ask.questionPlaceholder')}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${titleId}-keys`}
          className={`mt-1 w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-base text-gray-100 placeholder:text-gray-500 md:text-sm ${focusRing}`}
        />
        <p id={`${titleId}-keys`} className="mt-1 text-[11px] text-gray-500">
          {t('anchors.ask.keys')}
        </p>

        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-gray-300">{t('anchors.ask.anchorsLegend')}</legend>
          {entity && def ? (
            <div className="mt-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <div className="flex min-h-11 items-center gap-2 md:min-h-9">
                <input
                  id={checkId}
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className={`size-5 shrink-0 accent-indigo-500 md:size-4 ${focusRing}`}
                  data-testid="ask-here-suggestion"
                />
                <label htmlFor={checkId} className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 text-sm text-gray-200">
                  <def.Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                  <span className="sr-only">{def.name}: </span>
                  <span className="min-w-0 break-words">{name}</span>
                  <span className="text-[11px] text-gray-500">{t('anchors.ask.suggested')}</span>
                </label>
              </div>
              {checked && anchor && (
                <div className="mt-1 border-t border-white/[0.06] pt-2" data-testid="ask-here-snapshot">
                  <p className="flex items-start gap-1 text-[11px] font-medium text-gray-300">
                    <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
                    {t('anchors.ask.snapshotTitle')}
                  </p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    <dt className="text-gray-500">{t('anchors.ask.fieldType')}</dt>
                    <dd className="font-mono text-gray-300">{anchor.target_type}</dd>
                    <dt className="text-gray-500">{t('anchors.ask.fieldId')}</dt>
                    <dd className="break-all font-mono text-gray-300">{anchor.target_id}</dd>
                    {anchor.snapshot_name && (
                      <>
                        <dt className="text-gray-500">{t('anchors.ask.fieldName')}</dt>
                        <dd className="break-words text-gray-300" data-testid="ask-here-snapshot-name">{anchor.snapshot_name}</dd>
                      </>
                    )}
                  </dl>
                  <p className="mt-1 text-[11px] text-amber-300/90">{t('anchors.ask.unverified')}</p>
                  {snapshot?.redacted && <p className="text-[11px] text-gray-400">{t('anchors.ask.redactedNote')}</p>}
                  {anchorsAvailable === false && (
                    <p className="mt-1 text-[11px] text-gray-400" data-testid="ask-here-anchors-unavailable">
                      {t('anchors.ask.anchorsUnavailable')}
                    </p>
                  )}
                </div>
              )}
              {checked && !anchor && <p className="mt-1 text-[11px] text-gray-400">{t('anchors.ask.referenceOnly')}</p>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400">{t('anchors.ask.nothing')}</p>
          )}
        </fieldset>

        <p role="alert" className={error ? 'mt-2 text-xs text-amber-300' : 'sr-only'}>
          {error ?? ''}
        </p>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            {t('anchors.ask.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('anchors.ask.submit')}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
