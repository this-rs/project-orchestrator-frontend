import { useEffect } from 'react'
import { CHAT_TIMELINE_OPEN_KEY } from '@/atoms/chat'

/**
 * On a phone the timeline is a full-screen view: one left open on a previous visit must not
 * cover the chat when it opens again. Desktop keeps remembering it. Writes only when it was open.
 */
export function useResetTimelineOnPhone(setOpen: (open: boolean) => void, breakpointPx = 768) {
  useEffect(() => {
    try {
      if (!window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches) return
      if (window.localStorage.getItem(CHAT_TIMELINE_OPEN_KEY) === 'true') setOpen(false)
    } catch {
      // No storage (private mode, blocked): nothing was remembered.
    }
  }, [setOpen, breakpointPx])
}
