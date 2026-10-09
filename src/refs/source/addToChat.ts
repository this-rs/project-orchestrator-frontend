/**
 * The ONE way an entity becomes a reference of the draft from outside the
 * composer: a drop (composer or panel zone), the "Add to chat" button, the
 * keyboard shortcut. The `#` picker keeps its own caret-aware insertion but
 * shares the decisions (dedupe, cap) through `reconcileRefs` / `MAX_REFS_PER_MESSAGE`.
 *
 * The draft TEXT stays the source of truth (it holds the `#kind:id` token and
 * persists); the labels only dress the chip. The server re-resolves everything.
 */
import { atom } from 'jotai'
import { chatDraftInputAtom, chatPanelModeAtom, chatRefLabelsAtom, refsEnabledAtom } from '@/atoms/chat'
import { toastMessagesAtom } from '@/atoms/ui'
import { refToken } from '@/utils/messageRefs'
import { fallbackName, reconcileRefs, refKey } from '../refState'
import { MAX_REFS_PER_MESSAGE, type ChatReference, type EntityRef } from '../types'
import { parseEntityRef } from './refSource'

/** The reference being dragged in this document (set by the host at dragstart): drop zones read it, `dataTransfer` is closed during a drag. */
export const draggingRefAtom = atom<(EntityRef & { label?: string }) | null>(null)

/** Why the composer cannot take a reference right now (disabled, read-only…); null when it can. Written by the chat panel. */
export const chatComposerBlockedAtom = atom<string | null>(null)

/** The sentence for the screen-reader live region of the host. */
export const refsAddAnnouncementAtom = atom<{ text: string; n: number }>({ text: '', n: 0 })

export type AddRefStatus = 'added' | 'duplicate' | 'full' | 'blocked' | 'invalid' | 'off'
export interface AddRefResult {
  status: AddRefStatus
  message: string
}
export interface AddRefInput {
  ref: unknown
  label?: string
  subtitle?: string
  /** A button/keyboard add gives feedback the eye can see (toast); a drop already shows the chip. */
  via: 'drop' | 'button' | 'keyboard' | 'longpress'
}

export const addRefToChatAtom = atom(null, (get, set, input: AddRefInput): AddRefResult => {
  // Without refs_v1 nothing of the feature exists: no state, no feedback.
  if (!get(refsEnabledAtom)) return { status: 'off', message: '' }

  const say = (result: AddRefResult, tone: 'success' | 'info' | 'warning') => {
    set(refsAddAnnouncementAtom, (prev) => ({ text: result.message, n: prev.n + 1 }))
    if (result.status !== 'added' || input.via !== 'drop') {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      set(toastMessagesAtom, (prev) => [...prev, { id, type: tone, message: result.message }])
      setTimeout(() => set(toastMessagesAtom, (prev) => prev.filter((t) => t.id !== id)), 4000)
    }
    return result
  }

  const entity = parseEntityRef(input.ref)
  if (!entity) return say({ status: 'invalid', message: 'This item cannot be added to the chat.' }, 'warning')
  const ref: ChatReference = { ...entity, label: input.label?.trim() || undefined, subtitle: input.subtitle }
  const name = ref.label ?? fallbackName(ref)

  // The chat is where the user is going: open it (without taking the focus away).
  if (get(chatPanelModeAtom) === 'closed') set(chatPanelModeAtom, 'open')

  const blocked = get(chatComposerBlockedAtom)
  if (blocked !== null) {
    return say({ status: 'blocked', message: `Cannot add ${name}: the message box is unavailable (${blocked}).` }, 'warning')
  }

  const draft = get(chatDraftInputAtom)
  const labels = get(chatRefLabelsAtom)
  const current = reconcileRefs(draft, Object.values(labels))
  const key = refKey(ref)
  if (current.some((r) => refKey(r) === key)) {
    return say({ status: 'duplicate', message: `${name} is already in the message.` }, 'info')
  }
  if (current.length >= MAX_REFS_PER_MESSAGE) {
    return say(
      { status: 'full', message: `Reference limit reached: a message carries at most ${MAX_REFS_PER_MESSAGE}. ${name} was not added.` },
      'warning',
    )
  }

  set(chatRefLabelsAtom, { ...labels, [key]: ref })
  const glue = draft === '' || /\s$/.test(draft) ? '' : ' '
  set(chatDraftInputAtom, `${draft}${glue}${refToken(ref)} `)
  return say({ status: 'added', message: `${name} added to the message.` }, 'success')
})
