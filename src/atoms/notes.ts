import { atom } from 'jotai'
import type { Note, NoteType, NoteStatus, NoteImportance } from '@/types'

export const notesAtom = atom<Note[]>([])

export const notesLoadingAtom = atom<boolean>(false)

export const selectedNoteIdAtom = atom<string | null>(null)

export const selectedNoteAtom = atom<Note | null>((get) => {
  const id = get(selectedNoteIdAtom)
  const notes = get(notesAtom)
  return notes.find((n) => n.id === id) ?? null
})

// Filters
export const noteTypeFilterAtom = atom<NoteType | 'all'>('all')

export const noteStatusFilterAtom = atom<NoteStatus | 'all'>('all')

export const noteImportanceFilterAtom = atom<NoteImportance | 'all'>('all')

export const filteredNotesAtom = atom<Note[]>((get) => {
  const notes = get(notesAtom)
  const typeFilter = get(noteTypeFilterAtom)
  const statusFilter = get(noteStatusFilterAtom)
  const importanceFilter = get(noteImportanceFilterAtom)

  return notes.filter((note) => {
    if (typeFilter !== 'all' && note.note_type !== typeFilter) return false
    if (statusFilter !== 'all' && note.status !== statusFilter) return false
    if (importanceFilter !== 'all' && note.importance !== importanceFilter) return false
    return true
  })
})

// Notes needing review
export const notesNeedingReviewAtom = atom<Note[]>([])
