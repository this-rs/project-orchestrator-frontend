import { useState, useMemo, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { notesAtom, notesLoadingAtom, noteTypeFilterAtom, noteStatusFilterAtom, noteRefreshAtom } from '@/atoms'
import { notesApi } from '@/services'
import { Card, CardContent, Button, LoadingPage, EmptyState, Select, InteractiveNoteStatusBadge, ImportanceBadge, Badge, ConfirmDialog, FormDialog, OverflowMenu, PageShell, SelectZone, BulkActionBar, CollapsibleMarkdown, LoadMoreSentinel } from '@/components/ui'
import type { OverflowMenuAction } from '@/components/ui'
import { useConfirmDialog, useFormDialog, useToast, useMultiSelect, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import { CreateNoteForm } from '@/components/forms'
import type { Note, NoteType, NoteStatus, NoteScopeType, PaginatedResponse } from '@/types'

// Inline SVG icons (project convention: no icon library)
const iconClass = 'w-3 h-3 flex-shrink-0'
const FileTextIcon = () => <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 13H8" /><path d="M16 17H8" /><path d="M16 13h-2" /></svg>
const CodeIcon = () => <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
const FolderIcon = () => <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>
const BoxIcon = () => <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
const ShapesIcon = () => <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" /><rect x="3" y="14" width="7" height="7" rx="1" /><circle cx="17.5" cy="17.5" r="3.5" /></svg>
const AlertTriangleIcon = () => <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>

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
  const [, setNotesAtom] = useAtom(notesAtom)
  const [, setLoadingAtom] = useAtom(notesLoadingAtom)
  const [typeFilter, setTypeFilter] = useAtom(noteTypeFilterAtom)
  const [statusFilter, setStatusFilter] = useAtom(noteStatusFilterAtom)
  const noteRefresh = useAtomValue(noteRefreshAtom)
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const toast = useToast()
  const [formLoading, setFormLoading] = useState(false)
  const wsSlug = useWorkspaceSlug()

  const filters = useMemo(
    () => ({
      note_type: typeFilter !== 'all' ? typeFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      _refresh: noteRefresh,
      _ws: wsSlug,
    }),
    [typeFilter, statusFilter, noteRefresh, wsSlug],
  )

  const fetcher = useCallback(
    (params: { limit: number; offset: number; note_type?: string; status?: string }): Promise<PaginatedResponse<Note>> => {
      return notesApi.list({
        limit: params.limit,
        offset: params.offset,
        note_type: params.note_type,
        status: params.status,
        workspace_slug: wsSlug,
      })
    },
    [wsSlug],
  )

  const {
    items: notes,
    loading,
    loadingMore,
    hasMore,
    total,
    sentinelRef,
    reset,
    removeItems,
    updateItem,
  } = useInfiniteList({ fetcher, filters })

  // Sync notes atom
  useCallback(() => {
    setNotesAtom(notes)
    setLoadingAtom(loading)
  }, [notes, loading, setNotesAtom, setLoadingAtom])

  const noteForm = CreateNoteForm({
    onSubmit: async (data) => {
      setFormLoading(true)
      try {
        await notesApi.create(data)
        toast.success('Note created')
        formDialog.close()
        reset()
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
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await notesApi.delete(items[i].id)
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        const ids = new Set(items.map((n) => n.id))
        removeItems((n) => ids.has(n.id))
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
            onChange={(value) => setTypeFilter(value as NoteType | 'all')}
            className="w-full sm:w-36"
          />
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as NoteStatus | 'all')}
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
                onToggleSelect={(shiftKey) => multiSelect.toggle(note.id, shiftKey)}
                key={note.id}
                note={note}
                onUpdate={(updated) => updateItem((n) => n.id === updated.id, () => updated)}
                onDelete={() => confirmDialog.open({
                  title: 'Delete Note',
                  description: 'This note will be permanently deleted.',
                  onConfirm: async () => {
                    await notesApi.delete(note.id)
                    removeItems((n) => n.id === note.id)
                    toast.success('Note deleted')
                  },
                })}
              />
            ))}
          </div>
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
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

// Icons for scope types and anchor entity types
const scopeIcons: Record<NoteScopeType, React.ReactNode> = {
  workspace: <ShapesIcon />,
  project: null,
  module: <FolderIcon />,
  file: <FileTextIcon />,
  function: <CodeIcon />,
  struct: <BoxIcon />,
  trait: <ShapesIcon />,
}

const anchorEntityIcons: Record<string, React.ReactNode> = {
  file: <FileTextIcon />,
  function: <CodeIcon />,
  struct: <BoxIcon />,
  trait: <ShapesIcon />,
  module: <FolderIcon />,
}

const MAX_VISIBLE_ANCHORS = 5

interface NoteCardProps {
  note: Note
  onDelete: () => void
  onUpdate: (updatedNote: Note) => void
  selected?: boolean
  onToggleSelect?: (shiftKey: boolean) => void
}

function NoteCard({ note, onDelete, onUpdate, selected, onToggleSelect }: NoteCardProps) {
  const tags = note.tags || []
  const anchors = note.anchors || []
  const toast = useToast()
  const typeColors: Record<NoteType, string> = {
    guideline: 'border-l-blue-500',
    gotcha: 'border-l-red-500',
    pattern: 'border-l-purple-500',
    context: 'border-l-gray-500',
    tip: 'border-l-green-500',
    observation: 'border-l-yellow-500',
    assertion: 'border-l-orange-500',
  }

  const scope = note.scope
  const showScope = scope && scope.type !== 'project' && scope.type !== 'workspace'

  const handleStatusChange = async (newStatus: NoteStatus) => {
    try {
      const updated = await notesApi.update(note.id, { status: newStatus })
      onUpdate(updated)
      toast.success(`Status changed to ${newStatus.replace('_', ' ')}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleConfirm = async () => {
    try {
      const updated = await notesApi.confirm(note.id)
      onUpdate(updated)
      toast.success('Note confirmed as valid')
    } catch {
      toast.error('Failed to confirm note')
    }
  }

  const handleInvalidate = async () => {
    const reason = window.prompt('Reason for invalidation:')
    if (!reason) return
    try {
      const updated = await notesApi.invalidate(note.id, reason)
      onUpdate(updated)
      toast.success('Note invalidated')
    } catch {
      toast.error('Failed to invalidate note')
    }
  }

  const menuActions: OverflowMenuAction[] = [
    { label: 'Confirm', onClick: handleConfirm },
    { label: 'Invalidate', onClick: handleInvalidate },
    { label: 'Delete', variant: 'danger', onClick: onDelete },
  ]

  const visibleAnchors = anchors.slice(0, MAX_VISIBLE_ANCHORS)
  const hiddenCount = anchors.length - visibleAnchors.length

  return (
    <Card className={`border-l-4 ${typeColors[note.note_type] || 'border-l-gray-500'} transition-colors ${selected ? 'border-l-indigo-500 bg-indigo-500/[0.05]' : ''}`}>
      <div className="flex">
        {onToggleSelect && (
          <SelectZone selected={!!selected} onToggle={onToggleSelect} />
        )}
        <CardContent className="flex-1 min-w-0">
        {/* Superseded banner */}
        {note.superseded_by && (
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded bg-yellow-900/20 border border-yellow-800/30 text-yellow-500 text-xs">
            <AlertTriangleIcon />
            <span>This note has been superseded by a newer version</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{note.note_type}</Badge>
            <InteractiveNoteStatusBadge status={note.status} onStatusChange={handleStatusChange} />
            <ImportanceBadge importance={note.importance} />
          </div>
          <div className="flex items-center gap-2">
            {(note.staleness_score || 0) > 0.5 && (
              <span className="text-xs text-yellow-500">Staleness: {((note.staleness_score || 0) * 100).toFixed(0)}%</span>
            )}
            <OverflowMenu actions={menuActions} />
          </div>
        </div>

        {/* Scope indicator */}
        {showScope && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-400">
            {scopeIcons[scope.type] || null}
            <span className="font-mono">{scope.path || scope.type}</span>
          </div>
        )}

        {/* Markdown content */}
        <CollapsibleMarkdown content={note.content} />

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {tags.map((tag, index) => (
              <Badge key={`${tag}-${index}`} variant="default">{tag}</Badge>
            ))}
          </div>
        )}

        {/* Detailed anchors */}
        {anchors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {visibleAnchors.map((anchor, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs text-gray-400">
                {anchorEntityIcons[anchor.entity_type] || <FileTextIcon />}
                <span className="font-mono truncate max-w-48">{anchor.entity_id}</span>
              </span>
            ))}
            {hiddenCount > 0 && (
              <span className="text-xs text-gray-500">+{hiddenCount} more</span>
            )}
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
