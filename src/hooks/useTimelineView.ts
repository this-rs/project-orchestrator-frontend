import { useCallback, useState } from 'react'

/** How a conversation's timeline is drawn: one row per parallel action (`tracks`) or the span tree (`tree`). */
export type TimelineView = 'tracks' | 'tree'

const STORAGE_KEY = 'po.timeline.view'
const DEFAULT_VIEW: TimelineView = 'tracks'

function stored(): TimelineView {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'tracks' || v === 'tree') return v
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_VIEW
}

/** The reader's choice of timeline view, kept in this browser (a convenience, never shared). */
export function useTimelineView(): [TimelineView, (view: TimelineView) => void] {
  const [view, setView] = useState<TimelineView>(stored)
  const set = useCallback((next: TimelineView) => {
    setView(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage unavailable
    }
  }, [])
  return [view, set]
}
