import { describe, expect, it } from 'vitest'
import {
  attachmentKind,
  fileExtension,
  previewMime,
  previewMode,
} from './attachmentKind'

describe('fileExtension', () => {
  it('lowercases and drops the dot', () => {
    expect(fileExtension('Report.PDF')).toBe('pdf')
    expect(fileExtension('a.b.c.TSX')).toBe('tsx')
  })

  it('does not mistake a dotfile for an extension', () => {
    expect(fileExtension('.env')).toBe('')
    expect(fileExtension('.gitignore')).toBe('')
  })

  it('handles no extension, and a trailing dot', () => {
    expect(fileExtension('Makefile')).toBe('')
    expect(fileExtension('archive.')).toBe('')
  })

  it('survives spaces and accents in the name', () => {
    expect(fileExtension("Capture d'écran 17.16.26.png")).toBe('png')
  })
})

describe('attachmentKind — the recorded MIME wins', () => {
  it('takes image/audio/video at their word', () => {
    expect(attachmentKind('whatever.bin', 'image/png')).toBe('image')
    expect(attachmentKind('track.bin', 'audio/mpeg')).toBe('audio')
    expect(attachmentKind('clip.bin', 'video/mp4')).toBe('video')
  })

  it('knows the Office containers and the PDF', () => {
    expect(
      attachmentKind('x', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('word')
    expect(
      attachmentKind('x', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe('spreadsheet')
    expect(
      attachmentKind('x', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    ).toBe('presentation')
    expect(attachmentKind('x', 'APPLICATION/PDF; charset=binary')).toBe('pdf')
  })
})

describe('attachmentKind — the extension decides the rest', () => {
  it('separates what the backend calls text/plain', () => {
    // The whole reason this module exists: these four are all `text/plain` once
    // stored, and a chat that cannot tell them apart cannot pick an icon.
    expect(attachmentKind('notes.md', 'text/plain; charset=utf-8')).toBe('text')
    expect(attachmentKind('data.csv', 'text/plain; charset=utf-8')).toBe('spreadsheet')
    expect(attachmentKind('main.rs', 'text/plain; charset=utf-8')).toBe('code')
    expect(attachmentKind('app.log', 'text/plain; charset=utf-8')).toBe('text')
  })

  it('recognises media the server could not name', () => {
    // Nothing here detects an mp3 or an mp4 by magic bytes: the recorded type is
    // application/octet-stream and the name is all we have.
    expect(attachmentKind('podcast.mp3', 'application/octet-stream')).toBe('audio')
    expect(attachmentKind('demo.mp4', 'application/octet-stream')).toBe('video')
  })

  it('recognises archives and SVG', () => {
    expect(attachmentKind('deliverables.zip', 'application/zip')).toBe('archive')
    expect(attachmentKind('deliverables.zip', 'application/octet-stream')).toBe('archive')
    expect(attachmentKind('plan.svg', 'application/octet-stream')).toBe('image')
  })

  it('falls back to other — a real answer, not a failure', () => {
    expect(attachmentKind('mystery.bin', 'application/octet-stream')).toBe('other')
    expect(attachmentKind('no-extension', '')).toBe('other')
    expect(attachmentKind('x.qqq', 'application/x-qqq')).toBe('other')
  })
})

describe('previewMode', () => {
  it('draws what a browser can draw', () => {
    expect(previewMode('image')).toBe('image')
    expect(previewMode('pdf')).toBe('pdf')
    expect(previewMode('audio')).toBe('audio')
    expect(previewMode('video')).toBe('video')
  })

  it('shows the extracted text of every family the server read', () => {
    for (const kind of ['text', 'code', 'word', 'spreadsheet', 'presentation'] as const) {
      expect(previewMode(kind)).toBe('text')
    }
  })

  it('admits when there is nothing to show', () => {
    expect(previewMode('archive')).toBe('none')
    expect(previewMode('other')).toBe('none')
  })
})

describe('previewMime', () => {
  it('keeps a specific recorded type', () => {
    expect(previewMime('image', 'shot.png', 'image/png')).toBe('image/png')
    expect(previewMime('pdf', 'r.pdf', 'application/pdf')).toBe('application/pdf')
  })

  it('names the type the server could not, from the extension', () => {
    expect(previewMime('audio', 'podcast.mp3', 'application/octet-stream')).toBe('audio/mpeg')
    expect(previewMime('video', 'demo.mp4', 'application/octet-stream')).toBe('video/mp4')
    expect(previewMime('image', 'plan.svg', 'application/octet-stream')).toBe('image/svg+xml')
    expect(previewMime('pdf', 'r.pdf', '')).toBe('application/pdf')
  })

  it('never invents a type for an opaque file', () => {
    expect(previewMime('archive', 'd.zip', 'application/octet-stream')).toBe(
      'application/octet-stream',
    )
  })
})
