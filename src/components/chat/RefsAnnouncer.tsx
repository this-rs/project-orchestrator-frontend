import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { refsAnnouncementAtom, refsEnabledAtom } from '@/atoms'

/** Long enough for a screen reader to read the sentence, short enough to be gone by the next turn. */
export const ANNOUNCEMENT_LIFETIME_MS = 4000

/**
 * The one screen-reader live region for references: it says, once per turn,
 * that some of them could not be read in full. Mounted with the feature (a region added
 * together with its text is not reliably announced), empty when all is well.
 */
export function RefsAnnouncer() {
  const text = useAtomValue(refsAnnouncementAtom)
  const setText = useSetAtom(refsAnnouncementAtom)
  // Spoken once: emptied after a while, so the same sentence for the next turn is a change again.
  useEffect(() => {
    if (!text) return
    const timer = setTimeout(() => setText(''), ANNOUNCEMENT_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [text, setText])
  // Without refs_v1 the chat is exactly what it was: not even an empty node.
  if (!useAtomValue(refsEnabledAtom)) return null
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="refs-announcer">
      {text}
    </div>
  )
}
