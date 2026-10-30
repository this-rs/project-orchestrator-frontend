/**
 * The icon of an attachment family.
 *
 * In a `.ts` module rather than in the card, because both the chip in the
 * transcript and the preview dialog ask for it, and a component file may only
 * export components.
 */
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
} from 'lucide-react'
import type { AttachmentKind } from './attachmentKind'

export function attachmentIcon(kind: AttachmentKind) {
  switch (kind) {
    case 'image':
      return FileImage
    case 'pdf':
      return FileType
    case 'audio':
      return FileAudio
    case 'video':
      return FileVideo
    case 'word':
      return FileText
    case 'spreadsheet':
      return FileSpreadsheet
    case 'presentation':
      return Presentation
    case 'text':
      return FileText
    case 'code':
      return FileCode
    case 'archive':
      return FileArchive
    case 'other':
      return File
  }
}
