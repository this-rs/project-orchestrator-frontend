import { useAtomValue } from 'jotai'
import { refsAnnouncementAtom, refsEnabledAtom } from '@/atoms'

/**
 * The one screen-reader live region for references: it says, once per turn,
 * that some of them could not be read in full. Mounted with the feature (a region added
 * together with its text is not reliably announced), empty when all is well.
 */
export function RefsAnnouncer() {
  const text = useAtomValue(refsAnnouncementAtom)
  // Without refs_v1 the chat is exactly what it was: not even an empty node.
  if (!useAtomValue(refsEnabledAtom)) return null
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="refs-announcer">
      {text}
    </div>
  )
}
