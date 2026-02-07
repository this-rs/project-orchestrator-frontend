import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { notesAtom, notesLoadingAtom, noteTypeFilterAtom, noteStatusFilterAtom } from '@/atoms'
import { notesApi } from '@/services'
import { Card, CardContent, Button, LoadingPage, EmptyState, Select, NoteStatusBadge, ImportanceBadge, Badge, Pagination, ConfirmDialog, FormDialog, OverflowMenu, PageShell, SelectCheckbox, BulkActionBar } from '@/components/ui'
import { usePagination, useConfirmDialog, useFormDialog, useToast, useMultiSelect } from '@/hooks'
import { CreateNoteForm } from '@/components/forms'
import type { Note, NoteType, NoteStatus } from '@/types'

const typeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'guideline', label: 'Guideline' },
  { value: 'gotcha', label: 'Gotcha' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'context', label: 'Context' },
  { value: 'tip', label: 'Tip' },
  { value: 'observation', label: 'Observation' },
  { value: 'assertion', label: 'Assertion' },
]

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'stale', label: 'Stale' },
  { value: 'obsolete', label: 'Obsolete' },
  { value: 'archived', label: 'Archived' },
]

export function NotesPage() {
  const [notes, setNotes] = useAtom(notesAtom)
  const [loading, setLoading] = useAtom(notesLoadingAtom)
  const [typeFilter, setTypeFilter] = useAtom(noteTypeFilterAtom)
  const [statusFilter, setStatusFilter] = useAtom(noteStatusFilterAtom)
  const [total, setTotal] = useState(0)
  const { page, pageSize, offset, setPage, paginationProps } = usePagination()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const toast = useToast()
  const [formLoading, setFormLoading] = useState(false)

  const fetchNotes = async () => {
    setLoading(true)
    try {
      const params: { limit: number; offset: number; note_type?: string; status?: string } = { limit: pageSize, offset }
      if (typeFilter !== 'all') params.note_type = typeFilter
      if (statusFilter !== 'all') params.status = statusFilter
      const response = await notesApi.list(params)
      setNotes(response.items || [])
      setTotal(response.total || 0)
    } catch (error) {
      console.error('Failed to fetch notes:', error)
      toast.error('Failed to load notes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function fetchNotes() {
      setLoading(true)
      try {
        const params: { limit: number; offset: number; note_type?: string; status?: string } = { limit: pageSize, offset }
        if (typeFilter !== 'all') {
          params.note_type = typeFilter
        }
        if (statusFilter !== 'all') {
          params.status = statusFilter
        }
        const response = await notesApi.list(params)
        setNotes(response.items || [])
        setTotal(response.total || 0)
      } catch (error) {
        console.error('Failed to fetch notes:', error)
        toast.error('Failed to load notes')
      } finally {
        setLoading(false)
      }
    }
    fetchNotes()
  }, [setNotes, setLoading, page, pageSize, offset, typeFilter, statusFilter])

  const handleTypeFilterChange = (newFilter: NoteType | 'all') => {
    setTypeFilter(newFilter)
    setPage(1)
  }

  const handleStatusFilterChange = (newFilter: NoteStatus | 'all') => {
    setStatusFilter(newFilter)
    setPage(1)
  }

  const noteForm = CreateNoteForm({
    onSubmit: async (data) => {
      setFormLoading(true)
      try {
        await notesApi.create(data)
        toast.success('Note created')
        formDialog.close()
        fetchNotes()
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const openCreateNote = () => formDialog.open({ title: 'Create Note', size: 'lg' })

  const multiSelect = useMultiSelect(notes, (n) => n.id)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${count} note${count > 1 ? 's' : ''}`,
      description: `This will permanently delete ${count} note${count > 1 ? 's' : ''}.`,
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        for (const item of items) {
          await notesApi.delete(item.id)
        }
        setNotes((prev) => prev.filter((n) => !multiSelect.selectedIds.has(n.id)))
        setTotal((prev) => prev - items.length)
        multiSelect.clear()
        toast.success(`Deleted ${count} note${count > 1 ? 's' : ''}`)
      },
    })
  }

  if (loading) return <LoadingPage />

  return (
    <PageShell
      title="Knowledge Notes"
      description="Capture knowledge and decisions"
      actions={
        <>
          <Select
            options={typeOptions}
            value={typeFilter}
            onChange={(e) => handleTypeFilterChange(e.target.value as NoteType | 'all')}
            className="w-full sm:w-36"
          />
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value as NoteStatus | 'all')}
            className="w-full sm:w-36"
          />
          <Button onClick={openCreateNote}>Create Note</Button>
        </>
      }
    >
      {notes.length === 0 ? (
        <EmptyState
          title="No notes found"
          description={total === 0 && typeFilter === 'all' && statusFilter === 'all' ? 'Knowledge notes capture important patterns, gotchas, and guidelines.' : 'No notes match the current filters.'}
        />
      ) : (
        <>
          {notes.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={multiSelect.toggleAll}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {multiSelect.isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <div className="space-y-4">
            {notes.map((note) => (
              <NoteCard
                selected={multiSelect.isSelected(note.id)}
                onToggleSelect={() => multiSelect.toggle(note.id)}
                key={note.id}
                note={note}
                onDelete={() => confirmDialog.open({
                  title: 'Delete Note',
                  description: 'This note will be permanently deleted.',
                  onConfirm: async () => {
                    await notesApi.delete(note.id)
                    setNotes(prev => prev.filter(n => n.id !== note.id))
                    toast.success('Note deleted')
                  },
                })}
              />
            ))}
          </div>
          <div className="mt-6">
            <Pagination {...paginationProps(total)} />
          </div>
        </>
      )}

      <BulkActionBar
        count={multiSelect.selectionCount}
        onDelete={handleBulkDelete}
        onClear={multiSelect.clear}
      />
      <FormDialog {...formDialog.dialogProps} onSubmit={noteForm.submit} loading={formLoading}>
        {noteForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

function NoteCard({ note, onDelete, selected, onToggleSelect }: { note: Note; onDelete: () => void; selected?: boolean; onToggleSelect?: () => void }) {
  const tags = note.tags || []
  const anchors = note.anchors || []
  const typeColors: Record<NoteType, string> = {
    guideline: 'border-l-blue-500',
    gotcha: 'border-l-red-500',
    pattern: 'border-l-purple-500',
    context: 'border-l-gray-500',
    tip: 'border-l-green-500',
    observation: 'border-l-yellow-500',
    assertion: 'border-l-orange-500',
  }

  return (
    <Card className={`border-l-4 ${typeColors[note.note_type] || 'border-l-gray-500'}`}>
      <div className="flex">
        {onToggleSelect && (
          <SelectCheckbox checked={!!selected} onChange={onToggleSelect} />
        )}
      <CardContent className="flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{note.note_type}</Badge>
            <NoteStatusBadge status={note.status} />
            <ImportanceBadge importance={note.importance} />
          </div>
          <div className="flex items-center gap-2">
            {(note.staleness_score || 0) > 0.5 && (
              <span className="text-xs text-yellow-500">Staleness: {((note.staleness_score || 0) * 100).toFixed(0)}%</span>
            )}
            <OverflowMenu
              actions={[
                { label: 'Delete', variant: 'danger', onClick: () => onDelete() },
              ]}
            />
          </div>
        </div>

        <p className="text-gray-200 whitespace-pre-wrap break-words overflow-hidden">{note.content}</p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {tags.map((tag, index) => (
              <Badge key={`${tag}-${index}`} variant="default">{tag}</Badge>
            ))}
          </div>
        )}

        {anchors.length > 0 && (
          <div className="mt-3 text-xs text-gray-500">
            Linked to {anchors.length} {anchors.length === 1 ? 'entity' : 'entities'}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>Created by {note.created_by}</span>
          <span>{new Date(note.created_at).toLocaleDateString()}</span>
          {note.last_confirmed_at && (
            <span>Last confirmed: {new Date(note.last_confirmed_at).toLocaleDateString()}</span>
          )}
        </div>
      </CardContent>
      </div>
    </Card>
  )
}
