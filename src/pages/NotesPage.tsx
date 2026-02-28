import { useState, useMemo, useCallback, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { motion, AnimatePresence } from 'motion/react'
import { FileText, Code, FolderOpen, Package, Shapes, AlertTriangle, Search, Brain } from 'lucide-react'
import { notesAtom, notesLoadingAtom, noteTypeFilterAtom, noteStatusFilterAtom, noteRefreshAtom } from '@/atoms'
import { notesApi } from '@/services'
import { Card, CardContent, Button, EmptyState, Select, SearchInput, InteractiveNoteStatusBadge, ImportanceBadge, Badge, ConfirmDialog, FormDialog, OverflowMenu, PageShell, SelectZone, BulkActionBar, CollapsibleMarkdown, LoadMoreSentinel, SkeletonCard, Spinner } from '@/components/ui'
import type { OverflowMenuAction } from '@/components/ui'
import { useConfirmDialog, useFormDialog, useToast, useMultiSelect, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import { CreateNoteForm } from '@/components/forms'
import { NeuronExplorer } from '@/components/knowledge'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { Note, NoteType, NoteStatus, NoteScopeType, PaginatedResponse } from '@/types'

type NotesTab = 'list' | 'semantic' | 'graph'

const TAB_CONFIG: { key: NotesTab; label: string; icon: typeof Search }[] = [
  { key: 'list', label: 'List', icon: FileText },
  { key: 'semantic', label: 'Semantic Search', icon: Search },
  { key: 'graph', label: 'Knowledge Graph', icon: Brain },
]

const iconClass = 'w-3 h-3 flex-shrink-0'
const FileTextIcon = () => <FileText className={iconClass} />
const CodeIcon = () => <Code className={iconClass} />
const FolderIcon = () => <FolderOpen className={iconClass} />
const BoxIcon = () => <Package className={iconClass} />
const ShapesIcon = () => <Shapes className={iconClass} />
const AlertTriangleIcon = () => <AlertTriangle className={iconClass} />

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
  const [activeTab, setActiveTab] = useState<NotesTab>('list')
  const [, setNotesAtom] = useAtom(notesAtom)
  const [, setLoadingAtom] = useAtom(notesLoadingAtom)
  const [typeFilter, setTypeFilter] = useAtom(noteTypeFilterAtom)
  const [statusFilter, setStatusFilter] = useAtom(noteStatusFilterAtom)
  const noteRefresh = useAtomValue(noteRefreshAtom)
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const reducedMotion = useReducedMotion()

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
    workspaceSlug: wsSlug,
    onSubmit: async (data) => {
      await notesApi.create(data)
      toast.success('Note created')
      reset()
    },
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

  return (
    <PageShell
      title="Knowledge Notes"
      description="Capture knowledge and decisions"
      actions={
        <div className="flex flex-wrap gap-2">
          {TAB_CONFIG.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      }
    >
      {activeTab === 'list' && (
        <>
          {/* List tab filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
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
          </div>
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          variant={total === 0 && typeFilter === 'all' && statusFilter === 'all' ? 'notes' : undefined}
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
          <motion.div
            className="space-y-4"
            variants={reducedMotion ? undefined : staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {notes.map((note) => (
                <motion.div key={note.id} variants={fadeInUp} exit="exit" layout={!reducedMotion}>
                  <NoteCard
                    selected={multiSelect.isSelected(note.id)}
                    onToggleSelect={(shiftKey) => multiSelect.toggle(note.id, shiftKey)}
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
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
        </>
      )}

      <BulkActionBar
        count={multiSelect.selectionCount}
        onDelete={handleBulkDelete}
        onClear={multiSelect.clear}
      />
        </>
      )}

      {activeTab === 'semantic' && (
        <SemanticSearchTab workspaceSlug={wsSlug} />
      )}

      {activeTab === 'graph' && (
        <NeuronExplorer workspaceSlug={wsSlug} />
      )}

      <FormDialog {...formDialog.dialogProps} onSubmit={noteForm.submit}>
        {noteForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Semantic Search Tab ──────────────────────────────────────────────────

interface SemanticSearchTabProps {
  workspaceSlug: string
}

interface SemanticHit {
  note: Note
  score: number
  highlights: string[] | null
}

function SemanticSearchTab({ workspaceSlug }: SemanticSearchTabProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticHit[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const toast = useToast()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([])
        setHasSearched(false)
        return
      }
      setSearching(true)
      try {
        const res = await notesApi.searchSemantic({ query: q, workspace_slug: workspaceSlug, limit: 20 })
        // Backend returns flat array: [{ note, score, highlights }]
        setResults(Array.isArray(res) ? res : [])
        setHasSearched(true)
      } catch {
        toast.error('Semantic search failed')
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [workspaceSlug, toast],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 400)
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={handleChange}
        placeholder="Search notes by meaning..."
        className="w-full"
        autoFocus
      />

      {searching && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {!searching && hasSearched && results.length === 0 && (
        <EmptyState title="No semantic matches" description="Try a different phrasing — semantic search finds notes by meaning, not exact words." />
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-3">
          {results.map((hit) => (
            <Card key={hit.note.id} className={`border-l-4 ${hit.note.note_type === 'gotcha' ? 'border-l-red-500' : hit.note.note_type === 'guideline' ? 'border-l-blue-500' : hit.note.note_type === 'pattern' ? 'border-l-purple-500' : hit.note.note_type === 'tip' ? 'border-l-green-500' : 'border-l-gray-500'}`}>
              <CardContent>
                {/* Score bar */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                      style={{ width: `${Math.min(hit.score * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-400 shrink-0">
                    {(hit.score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="default">{hit.note.note_type}</Badge>
                  <ImportanceBadge importance={hit.note.importance} />
                  {hit.note.tags?.map((tag, i) => (
                    <Badge key={`${tag}-${i}`} variant="default">{tag}</Badge>
                  ))}
                </div>
                <CollapsibleMarkdown content={hit.note.content} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!searching && !hasSearched && (
        <EmptyState title="Semantic Search" description="Type a question or concept to find notes by meaning. Finds related notes even without exact keyword matches." />
      )}
    </div>
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
    <Card lazy="sm" className={`border-l-4 ${typeColors[note.note_type] || 'border-l-gray-500'} transition-colors ${selected ? 'border-l-indigo-500 bg-indigo-500/[0.05]' : ''}`}>
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
