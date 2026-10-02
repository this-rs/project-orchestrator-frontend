import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { focusRing, pressFeedback } from '@/components/ui/classes'
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={ATTACH_TEXT.title}
        aria-label={forTitle ? `${ATTACH_TEXT.title} (${forTitle})` : variant === 'icon' ? ATTACH_TEXT.title : undefined}
        className={
          variant === 'icon'
            ? `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] ${pressFeedback} ${focusRing}`
            : `inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 text-xs font-medium text-gray-100 hover:bg-white/[0.1] ${pressFeedback} ${focusRing}`
        }
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        {variant === 'text' && ATTACH_TEXT.title}
      </button>
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
