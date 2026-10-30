/**
 * One attachment of a message, in the transcript.
 *
 * Two forms, one meaning:
 *
 * * a **picture** shows itself (a thumbnail), because a screenshot's content is
 *   the message;
 * * anything else is a **chip**: the icon of its family, its name and its size,
 *   and a click opens it — the PDF in the browser's viewer, an audio or video in
 *   a player, a document as its EXTRACTED TEXT, an archive with the reason it
 *   cannot be shown.
 *
 * The chip is not a degraded mode kept for legacy: it is also what a picture
 * falls back to while its bytes load and when they cannot be read. Showing a
 * file must never cost the reader its name and its size.
 */
import { createElement, memo, useState } from 'react'
import { useT } from '@/i18n'
import type { MessageAttachment } from '@/utils/messageAttachments'
import { formatBytes } from './attachmentState'
import { attachmentIcon } from './attachmentIcon'
import { attachmentKind, previewMime, previewMode } from './attachmentKind'
import { useDocumentFile } from './useDocumentContent'
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog'

interface AttachmentCardProps {
  attachment: MessageAttachment
}

/** A thumbnail opens at this size; the full picture is one click away. */
const THUMB_PX = 96

export const AttachmentCard = memo(function AttachmentCard({ attachment }: AttachmentCardProps) {
  const { t } = useT()
  const kind = attachmentKind(attachment.filename, attachment.mime_type)
  const mode = previewMode(kind)
  const [open, setOpen] = useState(false)

  // Only a picture is fetched for the transcript itself: a list of messages must
  // not download every PDF ever attached. The rest is fetched when opened.
  const thumbnail = useDocumentFile(
    mode === 'image' ? attachment.id : undefined,
    mode === 'image' ? previewMime(kind, attachment.filename, attachment.mime_type) : null,
  )

  const label = t('chatA-messages.bubble.openAttachment', { name: attachment.filename })

  const trigger = thumbnail.url ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={attachment.filename}
      aria-label={label}
      className="group relative block overflow-hidden rounded-lg border border-white/[0.12] bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      style={{ width: THUMB_PX, height: THUMB_PX }}
    >
      <img
        src={thumbnail.url}
        alt={attachment.filename}
        // `object-cover` rather than `contain`: a row of thumbnails of equal
        // size reads as a row; letterboxed ones read as an accident.
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        loading="lazy"
        decoding="async"
      />
      {/* The name is not lost: it is the tooltip, the alt text and the label. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-gray-200 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {attachment.filename}
      </span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={attachment.filename}
      aria-label={label}
      className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
    >
      {/* createElement, not <Icon />: the component is LOOKED UP, not declared,
          during render (react-hooks/static-components) — same shape as the tool
          renderer registry in `tools/index.tsx`. */}
      {createElement(attachmentIcon(kind), {
        className: 'h-3.5 w-3.5 shrink-0 text-gray-400',
        'aria-hidden': true,
      })}
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-gray-500">{formatBytes(attachment.size_bytes)}</span>
    </button>
  )

  return (
    <>
      {trigger}
      {/* Mounted only once opened: a transcript with fifty attachments must not
          carry fifty dialog subtrees (focus trap, motion variants, portal) that
          nobody has asked for. The trade is the exit animation, which nothing
          here depends on. */}
      {open && (
        <AttachmentPreviewDialog
          attachment={attachment}
          open
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
})
