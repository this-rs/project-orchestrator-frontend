import { useCallback, useState } from 'react'

/**
 * localStorage key of the capability banner's collapsed state. The value is the list of feature ids
 * the reader has already seen and put away (`{"seen":["images","nats"]}`), not a plain boolean: a
 * gap they have not seen yet brings the banner back once.
 */
export const CAPABILITY_BANNER_COLLAPSED_KEY = 'chat-capability-banner-collapsed'

function readSeen(): readonly string[] | null {
  try {
    const raw = window.localStorage.getItem(CAPABILITY_BANNER_COLLAPSED_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const seen = (parsed as { seen?: unknown } | null)?.seen
    return Array.isArray(seen) && seen.every((s) => typeof s === 'string') ? seen : null
  } catch {
    return null
  }
}

function writeSeen(seen: readonly string[] | null): void {
  try {
    if (seen === null) window.localStorage.removeItem(CAPABILITY_BANNER_COLLAPSED_KEY)
    else window.localStorage.setItem(CAPABILITY_BANNER_COLLAPSED_KEY, JSON.stringify({ seen: [...seen].sort() }))
  } catch {
    // Private window, blocked storage: the choice lasts for this page only.
  }
}

/** Collapsed when every missing feature of this conversation was already seen when the reader collapsed the banner. */
export function isCollapsedFor(seen: readonly string[] | null, missing: readonly string[]): boolean {
  if (seen === null || missing.length === 0) return false
  return missing.every((id) => seen.includes(id))
}

/**
 * Whether the capability banner is put away as an icon in the chat header. Remembered across
 * conversations and reloads; a feature missing for the first time (not in what was put away)
 * expands it again, so a new gap is always seen once. A gap that goes away keeps it collapsed.
 */
export function useCapabilityBannerCollapse(missing: readonly string[]) {
  const [seen, setSeen] = useState<readonly string[] | null>(readSeen)
  const collapsed = isCollapsedFor(seen, missing)
  const collapse = useCallback(() => {
    setSeen((prev) => {
      const next = Array.from(new Set([...(prev ?? []), ...missing]))
      writeSeen(next)
      return next
    })
  }, [missing])
  const expand = useCallback(() => {
    writeSeen(null)
    setSeen(null)
  }, [])
  return { collapsed, collapse, expand }
}
