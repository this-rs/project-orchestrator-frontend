/**
 * One attachment of a message: the picture if it is one, the chip otherwise.
 *
 * The chip is not a degraded mode kept for legacy — it is what a PDF, a zip or
 * an unreadable image shows, and it is what the thumbnail itself falls BACK to
 * while its bytes are loading or when they cannot be read. That is the whole
 * point: showing a picture must never cost the reader the filename and the
 * size they relied on.
 */
import { memo, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { useT } from '@/i18n'
import type { MessageAttachment } from '@/utils/messageAttachments'
import { formatBytes } from './attachmentState'
import { isPreviewableImage } from './attachmentPreview'
import { useDocumentImage } from './useAttachmentImages'

interface AttachmentThumbnailProps {
  attachment: MessageAttachment
}

/** A thumbnail opens at this size; the full picture is one click away. */
const THUMB_PX = 96

export const AttachmentThumbnail = memo(function AttachmentThumbnail({
  attachment,
}: AttachmentThumbnailProps) {
  const { t } = useT()
  // A file that is not a picture is never fetched: the predicate decides, and
  // `enabled` keeps the hook unconditional.
  const previewable = isPreviewableImage(attachment.mime_type)
  const { url } = useDocumentImage(attachment.id, previewable)
  const [expanded, setExpanded] = useState(false)

  if (!url) return <AttachmentChip attachment={attachment} />

  const label = t('chatA-messages.bubble.openAttachment', { name: attachment.filename })
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title={attachment.filename}
        aria-label={label}
        className="group relative block overflow-hidden rounded-lg border border-white/[0.12] bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
        style={{ width: THUMB_PX, height: THUMB_PX }}
      >
        <img
          src={url}
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

      {/* The shared Dialog brings the focus trap, Escape and the scroll lock;
          a bespoke overlay would re-implement all three, badly. */}
      <Dialog open={expanded} onClose={() => setExpanded(false)} title={attachment.filename} size="lg">
        <img
          src={url}
          alt={attachment.filename}
          className="mx-auto max-h-[60vh] w-auto max-w-full rounded-lg object-contain"
        />
        <p className="mt-2 text-center text-xs text-gray-500">
          {formatBytes(attachment.size_bytes)}
        </p>
      </Dialog>
    </>
  )
})

/**
 * Filename + size, with a paperclip. Unchanged from before thumbnails existed,
 * because it is the fallback for every file that cannot be drawn.
 */
export function AttachmentChip({ attachment }: { attachment: MessageAttachment }) {
  return (
    <span
      title={attachment.filename}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-gray-300"
    >
      <Paperclip className="w-3 h-3 text-gray-400 shrink-0" aria-hidden />
      <span className="truncate max-w-[14rem]">{attachment.filename}</span>
      <span className="text-gray-500">{formatBytes(attachment.size_bytes)}</span>
    </span>
  )
}
