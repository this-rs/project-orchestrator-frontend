import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { glassFlat, iconButton } from '@/components/ui/classes'
import { useRequestAttentionRefresh } from '@/hooks/useAttentionCount'
import { AttachSessionDialog, ATTACH_TEXT } from './AttachSessionDialog'

/**
 * "Rattacher à…" button + its dialog. After a successful link it asks the single
 * attention source to refetch (the badge count follows) and calls `onAttached`
 * so the host can refresh its own tree.
 */
export function AttachSessionButton({
  sessionId,
  projectId,
  projectSlug,
  workspaceSlug,
  onAttached,
  variant = 'text',
  forTitle,
}: {
  sessionId: string
  projectId?: string | null
  projectSlug?: string | null
  /** Fallback scope when the project is unknown. */
  workspaceSlug?: string | null
  onAttached?: () => void
  /** `icon`: compact, for a header; `text`: for a tree node. */
  variant?: 'text' | 'icon'
  /** Title of the session, so a screen reader can tell twelve identical buttons apart. */
  forTitle?: string | null
}) {
  const [open, setOpen] = useState(false)
  const requestAttentionRefresh = useRequestAttentionRefresh()
  return (
    <>
      {/* Repeated under every node of a tree: flat glass, so the tree never blurs ten times. */}
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          title={ATTACH_TEXT.title}
          aria-label={forTitle ? `${ATTACH_TEXT.title} (${forTitle})` : ATTACH_TEXT.title}
          className={`${iconButton('ghost', 'w-9 h-9 md:w-8 md:h-8')} ${glassFlat} shrink-0`}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          flat
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          title={ATTACH_TEXT.title}
          aria-label={forTitle ? `${ATTACH_TEXT.title} (${forTitle})` : undefined}
          className="gap-1.5 text-xs"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {ATTACH_TEXT.title}
        </Button>
      )}
      <AttachSessionDialog
        open={open}
        onClose={() => setOpen(false)}
        sessionId={sessionId}
        projectId={projectId}
        projectSlug={projectSlug}
        workspaceSlug={workspaceSlug}
        onAttached={() => {
          requestAttentionRefresh()
          onAttached?.()
        }}
      />
    </>
  )
}
