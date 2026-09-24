import { memo } from 'react'
import { AlertTriangle, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'
import {
  formatBytes,
  truncateFilename,
  type Attachment,
} from './attachmentState'

interface AttachmentsProps {
  attachments: Attachment[]
  /** Remove one attachment. Aborts its upload if it is still running. */
  onRemove: (localId: string) => void
  /**
   * A send is being held until these uploads settle
   * (`ATTACHMENT_POLICY.deferSendWhileUploading`). Shown as a line of text
   * because a button that silently did nothing is exactly the failure this
   * feature exists to avoid.
   */
  pendingSend?: boolean
}

/**
 * The thumbnail row above the textarea, one chip per attached file.
 *
 * Renders only when there is something to show, so it costs nothing on the
 * common path. It sits in the input's flex column rather than floating over
 * the conversation like `MessageQueueBar`: these files belong to the message
 * being composed, so they must push the textarea down and stay visibly part
 * of it, not overlay the transcript the user is reading.
 *
 * Pure rendering — every rule it displays comes from `attachmentState.ts`.
 */
export const Attachments = memo(function Attachments({
  attachments,
  onRemove,
  pendingSend,
}: AttachmentsProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-col gap-1 pt-1">
      <ul className="flex flex-wrap gap-1.5">
        {attachments.map((a) => {
          const isImage = a.mimeType.startsWith('image/')
          const Icon = isImage ? ImageIcon : FileText
          const hasWarnings = a.status === 'ready' && (a.warnings?.length ?? 0) > 0

          return (
            <li
              key={a.localId}
              data-testid="attachment-chip"
              data-status={a.status}
              // The full name and any failure live in `title`: the chip is
              // deliberately narrow, and the truncated name alone is not
              // enough to tell two screenshots apart.
              title={
                a.status === 'error'
                  ? `${a.filename} — ${a.error}`
                  : hasWarnings
                    ? `${a.filename}\n${a.warnings?.join('\n')}`
                    : a.filename
              }
              className={`group relative flex items-center gap-1.5 pl-1.5 pr-0.5 py-1 rounded-lg border text-[11px] max-w-[14rem] overflow-hidden ${
                a.status === 'error'
                  ? 'border-red-500/40 bg-red-600/[0.08]'
                  : 'border-white/[0.08] bg-white/[0.04]'
              }`}
            >
              {/* Progress is painted as a fill behind the chip rather than as
                  a separate bar: it keeps the row one line tall whatever is
                  happening, so nothing reflows when an upload finishes. */}
              {a.status === 'uploading' && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-indigo-500/15 transition-[width] duration-200"
                  style={{ width: `${a.progress}%` }}
                />
              )}

              <span className="relative shrink-0">
                {a.status === 'uploading' ? (
                  <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                ) : a.status === 'error' ? (
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                ) : (
                  <Icon className={`w-3 h-3 ${hasWarnings ? 'text-amber-400' : 'text-gray-400'}`} />
                )}
              </span>

              <span className="relative min-w-0 flex flex-col leading-tight">
                <span className={a.status === 'error' ? 'text-red-200' : 'text-gray-300'}>
                  {truncateFilename(a.filename)}
                </span>
                <span className="text-[10px] text-gray-500">
                  {a.status === 'uploading' ? (
                    <>
                      {formatBytes(a.sizeBytes)} · {a.progress}%
                    </>
                  ) : a.status === 'error' ? (
                    <span className="text-red-400/90">{a.error}</span>
                  ) : hasWarnings ? (
                    <span className="text-amber-400/90">
                      {a.warnings?.length} warning{(a.warnings?.length ?? 0) > 1 ? 's' : ''}
                    </span>
                  ) : (
                    formatBytes(a.sizeBytes)
                  )}
                </span>
              </span>

              {/* Always mounted, never hover-only: a failed attachment must be
                  removable on a touch screen, and removing it is how the user
                  unblocks the send. */}
              <button
                onClick={() => onRemove(a.localId)}
                aria-label={`Remove ${a.filename}`}
                title="Remove"
                className="relative shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          )
        })}
      </ul>

      {pendingSend && (
        <p
          data-testid="attachment-pending-send"
          className="flex items-center gap-1.5 text-[10px] text-indigo-300/80"
        >
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Message will be sent when the upload finishes
        </p>
      )}
    </div>
  )
})
