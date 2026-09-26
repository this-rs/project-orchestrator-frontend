import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { AlertTriangle, Brain, Check, Trash2, X, XCircle } from 'lucide-react'
import { noteTypeFilterAtom, noteStatusFilterAtom, noteRefreshAtom } from '@/atoms'
import { notesApi } from '@/services'
import {
  BulkActionBar,
  Button,
  ConfirmDialog,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  FilterBar,
  FormDialog,
  LoadMoreSentinel,
  PageShell,
  RelativeTime,
  Select,
  RowCheckbox,
  StatusMenu,
  StatusText,
  TONE_CLASSES,
  focusRing,
  getStatusOptions,
  textLink,
  pluralize,
} from '@/components/ui'
import type { OverflowMenuAction } from '@/components/ui'
import { popIn, pressFeedback } from '@/components/ui/classes'
import {
  useConfirmDialog,
  useFormDialog,
  useToast,
  useMultiSelect,
  useInfiniteList,
  useWorkspaceSlug,
} from '@/hooks'
import { CreateNoteForm } from '@/components/forms'
import { useInvalidateNoteForm } from '@/components/forms/NoteForms'
import { NeuronExplorer } from '@/components/knowledge/NeuronExplorer'
import { NoteTypeLabel } from '@/components/knowledge/NoteTypeLabel'
import { noteTitle, notePreview, noteTypeOptions, pct } from '@/components/knowledge/noteMeta'
import { workspacePath } from '@/utils/paths'
import type { Note, NoteType, NoteStatus, PaginatedResponse } from '@/types'

const typeOptions = [{ value: 'all', label: 'All types' }, ...noteTypeOptions]
const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('note')]

// ── Semantic search hit type ──────────────────────────────────────────────

interface SemanticHit {
  note: Note
  score: number
  highlights: string[] | null
}

type SearchMode = 'semantic' | 'exact'

export function NotesPage() {
  // ── Search state ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic')
  const [semanticResults, setSemanticResults] = useState<SemanticHit[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Knowledge Graph overlay ───────────────────────────────────────────
  const [showGraph, setShowGraph] = useState(false)

  const [typeFilter, setTypeFilter] = useAtom(noteTypeFilterAtom)
  const [statusFilter, setStatusFilter] = useAtom(noteStatusFilterAtom)
  const noteRefresh = useAtomValue(noteRefreshAtom)
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const invalidateDialog = useFormDialog()
  const toast = useToast()
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
    (params: { limit: number; offset: number; note_type?: string; status?: string }): Promise<PaginatedResponse<Note>> =>
      notesApi.list({
        limit: params.limit,
        offset: params.offset,
        note_type: params.note_type,
        status: params.status,
        workspace_slug: wsSlug,
      }),
    [wsSlug],
  )

  const { items: notes, loading, loadingMore, hasMore, total, sentinelRef, reset, removeItems, updateItem } =
    useInfiniteList({ fetcher, filters })

  const noteForm = CreateNoteForm({
    workspaceSlug: wsSlug,
    onSubmit: async (data) => {
      await notesApi.create(data)
      toast.success('Note created')
      reset()
    },
  })

  const openCreateNote = () => formDialog.open({ title: 'Create note', size: 'lg' })

  const multiSelect = useMultiSelect(notes, (n) => n.id)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${pluralize(count, 'note')}?`,
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

  // ── Row mutations (shared by the list and semantic hits) ──────────────

  const applyUpdate = useCallback(
    (updated: Note) => {
      updateItem(
        (n) => n.id === updated.id,
        (n) => ({ ...n, ...updated, anchors: updated.anchors?.length ? updated.anchors : n.anchors }),
      )
      setSemanticResults((prev) =>
        prev.map((h) => (h.note.id === updated.id ? { ...h, note: { ...h.note, ...updated } } : h)),
      )
    },
    [updateItem],
  )

  const handleStatusChange = async (note: Note, status: NoteStatus) => {
    try {
      const updated = await notesApi.update(note.id, { status })
      applyUpdate({ ...note, ...updated, status })
      toast.success(`Status changed to ${status.replace('_', ' ')}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleConfirm = async (note: Note) => {
    try {
      const updated = await notesApi.confirm(note.id)
      applyUpdate({ ...note, ...updated })
      toast.success('Note confirmed as valid')
    } catch {
      toast.error('Failed to confirm note')
    }
  }

  const handleDelete = async (note: Note) => {
    await notesApi.delete(note.id)
    removeItems((n) => n.id === note.id)
    setSemanticResults((prev) => prev.filter((h) => h.note.id !== note.id))
    toast.success('Note deleted')
  }

  // Invalidate asks for a reason in a dialog (was window.prompt — unusable in the desktop app / some mobile browsers)
  const invalidateTarget = useRef<Note | null>(null)
  const invalidateForm = useInvalidateNoteForm(async (reason) => {
    const note = invalidateTarget.current
    if (!note) return
    const updated = await notesApi.invalidate(note.id, reason)
    applyUpdate({ ...note, ...updated })
    toast.success('Note invalidated')
  })
  const openInvalidate = (note: Note) => {
    invalidateTarget.current = note
    invalidateForm.reset()
    invalidateDialog.open({ title: 'Invalidate note', submitLabel: 'Invalidate' })
  }

  const rowActions = (note: Note): OverflowMenuAction[] => [
    { label: 'Confirm', icon: Check, onClick: () => handleConfirm(note) },
    { label: 'Invalidate', icon: XCircle, onClick: () => openInvalidate(note) },
    {
      label: 'Delete',
      icon: Trash2,
      variant: 'danger',
      onClick: () => handleDelete(note),
      confirm: { title: 'Delete note?', description: 'This note will be permanently deleted.' },
    },
  ]

  // ── Unified search handler ────────────────────────────────────────────

  const doSemanticSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSemanticResults([])
        setHasSearched(false)
        return
      }
      setSearching(true)
      try {
        const res = await notesApi.searchSemantic({ query: q, workspace_slug: wsSlug, limit: 20 })
        setSemanticResults(Array.isArray(res) ? res : [])
        setHasSearched(true)
      } catch {
        toast.error('Search failed')
        setSemanticResults([])
      } finally {
        setSearching(false)
      }
    },
    [wsSlug, toast],
  )

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (searchMode === 'semantic') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (!value.trim()) {
        setSemanticResults([])
        setHasSearched(false)
        return
      }
      debounceRef.current = setTimeout(() => doSemanticSearch(value), 400)
    }
  }

  const toggleSearchMode = () => {
    const next: SearchMode = searchMode === 'semantic' ? 'exact' : 'semantic'
    setSearchMode(next)
    setSemanticResults([])
    setHasSearched(false)
    // Re-trigger semantic search if switching to semantic with an existing query
    if (next === 'semantic' && searchQuery.trim()) doSemanticSearch(searchQuery)
  }

  // Exact mode: client-side filter on the loaded notes
  const filteredNotes = useMemo(() => {
    if (searchMode !== 'exact' || !searchQuery.trim()) return notes
    const q = searchQuery.toLowerCase()
    return notes.filter(
      (n) =>
        n.content.toLowerCase().includes(q) ||
        n.note_type.toLowerCase().includes(q) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q)),
    )
  }, [notes, searchQuery, searchMode])

  const showSemanticResults = searchMode === 'semantic' && searchQuery.trim().length > 0 && hasSearched

  // ── Filters ───────────────────────────────────────────────────────────
  const activeFilterCount = (typeFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    typeFilter !== 'all' ? typeOptions.find((o) => o.value === typeFilter)?.label ?? typeFilter : '',
    statusFilter !== 'all' ? statusOptions.find((o) => o.value === statusFilter)?.label ?? statusFilter : '',
  ]
  const clearFilters = () => {
    setTypeFilter('all')
    setStatusFilter('all')
  }
  const isPristine = total === 0 && activeFilterCount === 0 && !searchQuery

  const renderRow = (note: Note, extra?: { score: number }) => (
    <NoteRow
      key={note.id}
      note={note}
      href={workspacePath(wsSlug, `/notes/${note.id}`)}
      score={extra?.score}
      selectable={!extra}
      selected={!extra && multiSelect.isSelected(note.id)}
      onToggleSelect={(shift) => multiSelect.toggle(note.id, shift)}
      onStatusChange={(s) => handleStatusChange(note, s)}
      actions={rowActions(note)}
    />
  )

  return (
    <PageShell
      title="Knowledge Notes"
      description="Guidelines, gotchas and patterns your agents receive while they work."
      count={loading || showSemanticResults ? undefined : total}
      width="wide"
      actions={
        <>
          <Button onClick={() => setShowGraph(true)} variant="secondary" size="sm">
            <Brain className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Graph
          </Button>
          <Button size="sm" onClick={openCreateNote}>
            New note
          </Button>
        </>
      }
      filters={
        <div className="space-y-1.5">
          <FilterBar
            search={searchQuery}
            onSearchChange={handleSearchChange}
            searchPlaceholder={searchMode === 'semantic' ? 'Search by meaning…' : 'Exact text search…'}
            searchLabel="Search notes"
            activeCount={activeFilterCount}
            activeLabels={activeLabels}
            onClear={clearFilters}
            trailing={
              <button
                type="button"
                onClick={toggleSearchMode}
                aria-label={`Search mode: ${searchMode}. Switch to ${searchMode === 'semantic' ? 'exact' : 'semantic'}`}
                className={`h-9 px-2.5 rounded-lg border text-xs font-medium ${pressFeedback} ${focusRing} ${
                  searchMode === 'semantic'
                    ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
                    : 'border-white/[0.06] bg-white/[0.03] text-gray-400 hover:text-gray-200'
                }`}
              >
                {searchMode === 'semantic' ? 'Semantic' : 'Exact'}
              </button>
            }
            filters={
              <>
                <Select
                  options={typeOptions}
                  value={typeFilter}
                  onChange={(value) => setTypeFilter(value as NoteType | 'all')}
                />
                <Select
                  options={statusOptions}
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as NoteStatus | 'all')}
                />
              </>
            }
          />
          {searchQuery.trim() && (
            <p className="px-1 text-[11px] leading-4 text-gray-500">
              {searchMode === 'semantic'
                ? 'Semantic search finds notes by meaning, even without the exact words.'
                : 'Exact search matches the text you type in the notes loaded below.'}
            </p>
          )}
        </div>
      }
    >
      {/* ── Semantic search ───────────────────────────────────────────── */}
      {searching ? (
        <EntityListSkeleton rows={4} />
      ) : showSemanticResults ? (
        semanticResults.length === 0 ? (
          <EmptyState
            title="No matching notes"
            description="Try a different phrasing — semantic search finds notes by meaning, not exact words."
            action={
              <Button size="sm" variant="secondary" onClick={() => setSearchQuery('')}>
                Clear
              </Button>
            }
          />
        ) : (
          <>
            <p className="px-1 pb-1.5 text-[11px] text-gray-500">
              {semanticResults.length} result{semanticResults.length > 1 ? 's' : ''} by relevance
            </p>
            <EntityList aria-label="Search results">
              {semanticResults.map((hit) => renderRow(hit.note, { score: hit.score }))}
            </EntityList>
          </>
        )
      ) : loading ? (
        <EntityListSkeleton rows={6} />
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          variant={isPristine ? 'notes' : undefined}
          title={isPristine ? 'No notes yet' : 'No matching notes'}
          description={
            isPristine
              ? 'Knowledge notes capture important patterns, gotchas, and guidelines.'
              : 'No notes match the current filters.'
          }
          action={
            isPristine ? (
              <Button size="sm" onClick={openCreateNote}>
                New note
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => { clearFilters(); setSearchQuery('') }}>
                Clear
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5 min-h-9">
            <span className="text-[11px] text-gray-500 tabular-nums">
              {filteredNotes.length < total ? `${filteredNotes.length} of ${total} loaded` : `${total} notes`}
            </span>
            <button type="button" onClick={multiSelect.toggleAll} className={`px-1 py-2 text-xs ${textLink}`}>
              {multiSelect.isAllSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <EntityList aria-label="Notes">{filteredNotes.map((note) => renderRow(note))}</EntityList>
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
        </>
      )}

      <BulkActionBar count={multiSelect.selectionCount} onDelete={handleBulkDelete} onClear={multiSelect.clear} />

      {showGraph && <KnowledgeGraphOverlay wsSlug={wsSlug} onClose={() => setShowGraph(false)} />}

      <FormDialog {...formDialog.dialogProps} onSubmit={noteForm.submit}>
        {noteForm.fields}
      </FormDialog>
      <FormDialog {...invalidateDialog.dialogProps} onSubmit={invalidateForm.submit}>
        {invalidateForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Note row ──────────────────────────────────────────────────────────────

interface NoteRowProps {
  note: Note
  href: string
  /** Semantic match score (0–1) — shown instead of the date. */
  score?: number
  selectable: boolean
  selected: boolean
  onToggleSelect: (shiftKey: boolean) => void
  onStatusChange: (status: NoteStatus) => Promise<void>
  actions: OverflowMenuAction[]
}

function NoteRow({ note, href, score, selectable, selected, onToggleSelect, onStatusChange, actions }: NoteRowProps) {
  const tags = note.tags || []
  const staleness = note.staleness_score || 0
  const scope = note.scope && note.scope.type !== 'project' && note.scope.type !== 'workspace' ? note.scope : null
  const preview = notePreview(note.content)
  return (
    <EntityRow
      title={noteTitle(note.content)}
      href={href}
      selected={selected}
      muted={note.status === 'archived' || note.status === 'obsolete'}
      leading={selectable ? <RowCheckbox checked={selected} onToggle={onToggleSelect} label={`Select ${noteTitle(note.content)}`} /> : undefined}
      trailing={
        score !== undefined ? (
          <span title="Semantic match">{Math.round(score * 100)}%</span>
        ) : (
          <RelativeTime date={note.created_at} />
        )
      }
      description={preview || undefined}
      meta={[
        <StatusMenu key="status" kind="note" status={note.status} onChange={onStatusChange} />,
        <StatusText key="imp" kind="importance" status={note.importance} dot={false} />,
        <NoteTypeLabel key="type" type={note.note_type} />,
        staleness > 0.5 ? (
          <StatusText key="stale" status="stale" label={`stale ${pct(staleness)}`} dot={false} />
        ) : null,
        note.superseded_by ? (
          <span key="sup" className={`inline-flex items-center gap-1 ${TONE_CLASSES.warning.text}`}>
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            superseded
          </span>
        ) : null,
        scope ? (
          <span key="scope" className="font-mono truncate max-w-[12rem]" title={scope.path || scope.type}>
            {scope.path || scope.type}
          </span>
        ) : null,
        note.anchors?.length ? pluralize(note.anchors.length, 'link') : null,
        tags.length > 0 ? (
          <span key="tags" className="truncate max-w-[14rem]" title={tags.map((t) => `#${t}`).join(' ')}>
            {tags
              .slice(0, 3)
              .map((t) => `#${t}`)
              .join(' ')}
            {tags.length > 3 ? ` +${tags.length - 3}` : ''}
          </span>
        ) : null,
        score !== undefined ? <RelativeTime key="date" date={note.created_at} /> : null,
      ]}
      actions={actions}
    />
  )
}

// ── Knowledge graph overlay (global neuron explorer) ──────────────────────

function KnowledgeGraphOverlay({ wsSlug, onClose }: { wsSlug: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="knowledge-graph-title"
      className={`fixed inset-0 z-50 flex flex-col bg-surface-base pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${popIn}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-white/[0.06] shrink-0">
        <div className="min-w-0">
          <h2 id="knowledge-graph-title" className="text-sm font-semibold text-gray-100">
            Knowledge graph
          </h2>
          <p className="text-[11px] leading-4 text-gray-500 truncate">Every note as a neuron, synapses as links</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close knowledge graph"
          className={`w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/[0.06] ${focusRing}`}
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <NeuronExplorer workspaceSlug={wsSlug} />
      </div>
    </div>
  )
}
