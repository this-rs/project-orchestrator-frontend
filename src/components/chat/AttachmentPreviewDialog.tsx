/**
 * What an attachment LOOKS like when you open it.
 *
 * Every family the platform accepts gets an answer, and none of them is a dead
 * end:
 *
 * * **draw** — a picture, a PDF (the browser's own viewer, through a blob URL),
 *   an audio or video player;
 * * **read** — the extracted text, for everything the extractors read. A Word
 *   file or a spreadsheet lands here on purpose: the server already holds their
 *   text, so saying "cannot preview" about them would be a lie;
 * * **explain** — an archive or a binary nobody can read, with the reason and
 *   the download;
 * * and a **download** button on all of them, which is the one action that never
 *   depends on the browser being able to render anything.
 */
import { createElement, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { useT } from '@/i18n'
import type { MessageAttachment } from '@/utils/messageAttachments'
import { formatBytes } from './attachmentState'
import { attachmentIcon } from './attachmentIcon'
import { attachmentKind, previewMime, previewMode } from './attachmentKind'
import {
  documentFiles,
  PREVIEW_MAX_CHARS,
  useDocumentFile,
  useDocumentText,
} from './useDocumentContent'

interface AttachmentPreviewDialogProps {
  attachment: MessageAttachment
  open: boolean
  onClose: () => void
}

export function AttachmentPreviewDialog({ attachment, open, onClose }: AttachmentPreviewDialogProps) {
  const { t } = useT()
  const kind = attachmentKind(attachment.filename, attachment.mime_type)
  const mode = previewMode(kind)
  const type = previewMime(kind, attachment.filename, attachment.mime_type)
  const [renderFailed, setRenderFailed] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Only the families that draw or play need the bytes up front; the text
  // families ask for `/chunks`, and `none` asks for nothing until the user
  // downloads.
  const draws = mode === 'image' || mode === 'pdf' || mode === 'audio' || mode === 'video'
  // Nothing is fetched while the dialog is closed: the transcript must not
  // download the bytes of every attachment of every message just to have them
  // ready. Opening the preview is the request.
  const file = useDocumentFile(open && draws ? attachment.id : undefined, draws ? type : null)
  const text = useDocumentText(attachment.id, open && mode === 'text')

  /**
   * Download through an authenticated fetch.
   *
   * Not `window.open(rawUrl)`: that URL carries no bearer token, so it only
   * works where the cookie session happens to authorise it. Reading the bytes
   * first works everywhere, and gives a real filename to `<a download>`.
   */
  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(false)
    try {
      const blob = await documentFiles.get(attachment.id)
      const url = URL.createObjectURL(new Blob([blob], { type }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachment.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // Revoking on the next tick can cancel the download in some browsers;
      // a minute is long enough for the save dialog to act.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  const body = () => {
    if (mode === 'image') {
      if (renderFailed) return <NoPreview />
      if (!file.url) return file.failed ? <NoPreview /> : <Loading />
      return (
        <img
          src={file.url}
          alt={attachment.filename}
          onError={() => setRenderFailed(true)}
          className="mx-auto max-h-[60vh] w-auto max-w-full rounded-lg object-contain"
        />
      )
    }
    if (mode === 'pdf') {
      if (file.failed) return <NoPreview />
      if (!file.url) return <Loading />
      return (
        <iframe
          src={file.url}
          title={attachment.filename}
          className="h-[60vh] w-full rounded-lg border border-white/10 bg-white"
        />
      )
    }
    if (mode === 'audio') {
      if (file.failed) return <NoPreview />
      if (!file.url) return <Loading />
      return (
        <div className="flex flex-col items-center gap-3 py-6">
          {createElement(attachmentIcon(kind), {
            className: 'w-10 h-10 text-gray-500',
            'aria-hidden': true,
          })}
          <audio src={file.url} controls onError={() => setRenderFailed(true)} className="w-full" />
        </div>
      )
    }
    if (mode === 'video') {
      if (file.failed) return <NoPreview />
      if (!file.url) return <Loading />
      return (
        <video
          src={file.url}
          controls
          onError={() => setRenderFailed(true)}
          className="mx-auto max-h-[60vh] w-full rounded-lg bg-black"
        />
      )
    }
    if (mode === 'text') {
      if (text.failed) return <LoadFailed />
      if (text.loading) return <Loading />
      if (!text.text) return <NoText />
      return (
        <div className="space-y-2">
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-xs text-gray-300">
            {text.text}
          </pre>
          {text.truncated && (
            <p className="text-[11px] text-amber-300/90">
              {t('chatA-messages.attachment.truncated', { chars: PREVIEW_MAX_CHARS.toLocaleString() })}
            </p>
          )}
        </div>
      )
    }
    return <NoPreview />
  }

  return (
    <Dialog open={open} onClose={onClose} title={attachment.filename} size="lg">
      {body()}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
        <span className="flex items-center gap-1.5 truncate text-xs text-gray-500">
          {createElement(attachmentIcon(kind), {
            className: 'w-3.5 h-3.5 shrink-0',
            'aria-hidden': true,
          })}
          <span className="truncate">{formatBytes(attachment.size_bytes)}</span>
        </span>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.12] px-2.5 py-1 text-xs text-gray-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          {t('chatA-messages.attachment.download')}
        </button>
      </div>
      {downloadError && (
        <p role="alert" className="mt-2 text-[11px] text-red-300">
          {t('chatA-messages.attachment.loadFailed')}
        </p>
      )}
    </Dialog>
  )
}

function Loading() {
  return (
    <p className="flex items-center gap-2 py-6 text-xs text-gray-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      …
    </p>
  )
}

function NoPreview() {
  const { t } = useT()
  return <p className="py-6 text-center text-xs text-gray-400">{t('chatA-messages.attachment.noPreview')}</p>
}

function NoText() {
  const { t } = useT()
  return <p className="py-6 text-center text-xs text-gray-400">{t('chatA-messages.attachment.noText')}</p>
}

function LoadFailed() {
  const { t } = useT()
  return <p className="py-6 text-center text-xs text-red-300">{t('chatA-messages.attachment.loadFailed')}</p>
}
