/**
 * « Demander ici »: what the page on screen is about (`ui_context`), and the
 * question the palette hands to the chat panel.
 *
 * `ui_context` is a SUGGESTION: the palette pre-checks it, the person confirms
 * (Enter) or unchecks it. Nothing is anchored without that gesture.
 */
import { atom } from 'jotai'
import type { ChatReference } from '@/refs/types'
import type { AddAnchorInput } from '@/services/anchors'

export interface UiContext {
  kind: string
  id: string
  /** What the page shows as the entity's name. Display and snapshot only: the server re-reads it. */
  label?: string
}

/** Set by a detail page while it is mounted (`useUiContext`). */
export const uiContextAtom = atom<UiContext | null>(null)

export const askHereOpenAtom = atom(false)

export interface AskHereRequest {
  /** Distinguishes two identical questions asked one after the other. */
  id: number
  text: string
  refs: ChatReference[]
  anchors: AddAnchorInput[]
}

/** Written by the palette, consumed (and cleared) by the chat panel. */
export const askHereRequestAtom = atom<AskHereRequest | null>(null)
