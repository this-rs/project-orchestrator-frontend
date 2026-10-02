import { atom } from 'jotai'

/**
 * Pending-request count shown on every "Today" entry of the chrome.
 * Written by ONE source (useAttentionCountSource, mounted once in the layout),
 * read by any number of badges. `error` hides the badge; it never breaks navigation.
 */
export type AttentionCountState =
  | { status: 'loading'; count: null }
  | { status: 'ready'; count: number }
  | { status: 'error'; count: null }

export const attentionCountAtom = atom<AttentionCountState>({ status: 'loading', count: null })
