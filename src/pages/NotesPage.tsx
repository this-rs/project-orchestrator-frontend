import { useState, useMemo, useCallback, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { motion, AnimatePresence } from 'motion/react'
import {
  FileText,
  Code,
  FolderOpen,
  Package,
  Shapes,
  AlertTriangle,
  Search,
  Brain,
  Waves,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  notesAtom,
  notesLoadingAtom,
  noteTypeFilterAtom,
  noteStatusFilterAtom,
  noteRefreshAtom,
} from '@/atoms'
import { notesApi } from '@/services'
import { PropagationVizWidget } from '@/components/particles/widgets'
import { useDistributionVizData } from '@/hooks/useVizData'
import {
  Card,
  CardContent,
  Button,
  EmptyState,
  Select,
  InteractiveNoteStatusBadge,
  ImportanceBadge,
  Badge,
  ConfirmDialog,
  FormDialog,
  OverflowMenu,
  PageShell,
  SelectZone,
  BulkActionBar,
  CollapsibleMarkdown,
  LoadMoreSentinel,
  SkeletonCard,
  Spinner,
  MetricTooltip,
} from '@/components/ui'
import type { OverflowMenuAction } from '@/components/ui'
import {
  useConfirmDialog,
  useFormDialog,
  useToast,
  useMultiSelect,
  useInfiniteList,
  useWorkspaceSlug,
} from '@/hooks'
import { CreateNoteForm } from '@/components/forms'
import { NeuronExplorer } from '@/components/knowledge'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { Note, NoteType, NoteStatus, NoteScopeType, PaginatedResponse } from '@/types'
import type { ParticleHitInfo } from '@/components/particles/ParticleViz'

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

// ── Semantic search hit type ──────────────────────────────────────────────

interface SemanticHit {
  note: Note
  score: number
  highlights: string[] | null
}

export function NotesPage() {
  // ── Search state ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'semantic' | 'exact'>('semantic')
  const [semanticResults, setSemanticResults] = useState<SemanticHit[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Propagation drawer state ──────────────────────────────────────────
  const [drawerNoteId, setDrawerNoteId] = useState<string | null>(null)

  // ── Knowledge Graph modal state ───────────────────────────────────────
  const [showGraph, setShowGraph] = useState(false)

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
  const navigate = useNavigate()

  // Propagation viz data driven by drawer note
  const distributionViz = useDistributionVizData('note', drawerNoteId ?? undefined)

  const handleParticleClick = useCallback(
    (info: ParticleHitInfo) => {
      const noteId = info.metadata?.id as string | undefined
      if (noteId) {
        navigate(`/notes/${noteId}`)
      }
    },
    [navigate],
  )

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
    (params: {
      limit: number
      offset: number
      note_type?: string
      status?: string
    }): Promise<PaginatedResponse<Note>> => {
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
        const res = await notesApi.searchSemantic({
          query: q,
          workspace_slug: wsSlug,
          limit: 20,
        })
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    if (searchMode === 'semantic') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => doSemanticSearch(value), 400)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSemanticResults([])
    setHasSearched(false)
  }

  // Filter notes for exact search mode (client-side BM25-like)
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

  // Should we show semantic results instead of the normal list?
  const showSemanticResults =
    searchMode === 'semantic' && searchQuery.trim().length > 0 && hasSearched

  return (
    <PageShell
      title="Knowledge Notes"
      description="Capture knowledge and decisions"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowGraph(true)} variant="secondary" size="sm">
            <Brain className="w-4 h-4 mr-1.5" />
            Explorer le graphe
          </Button>
          <Button onClick={openCreateNote}>Create Note</Button>
        </div>
      }
    >
      {/* ── Unified search bar + inline filters ────────────────────────── */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search input with mode toggle */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={
                searchMode === 'semantic'
                  ? 'Search by meaning...'
                  : 'Exact text search...'
              }
              className="w-full pl-10 pr-24 py-2 bg-surface-base border border-border-default rounded-lg text-gray-100 placeholder-gray-500 input-focus-glow"
              autoComplete="off"
            />
            {/* Right side: clear + mode toggle */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <MetricTooltip
                term="spreading_activation"
                description={
                  searchMode === 'semantic'
                    ? 'Semantic: finds related notes by meaning, even without exact keywords'
                    : 'Exact: matches the exact text you type'
                }
              >
                <button
                  onClick={() => {
                    const newMode = searchMode === 'semantic' ? 'exact' : 'semantic'
                    setSearchMode(newMode)
                    setSemanticResults([])
                    setHasSearched(false)
                    // Re-trigger semantic search if switching to semantic with existing query
                    if (newMode === 'semantic' && searchQuery.trim()) {
                      doSemanticSearch(searchQuery)
                    }
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    searchMode === 'semantic'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-gray-700/50 text-gray-400'
                  }`}
                  title={
                    searchMode === 'semantic'
                      ? 'Switch to exact search'
                      : 'Switch to semantic search'
                  }
                >
                  {searchMode === 'semantic' ? (
                    <ToggleRight className="w-3.5 h-3.5" />
                  ) : (
                    <ToggleLeft className="w-3.5 h-3.5" />
                  )}
                  {searchMode === 'semantic' ? 'Semantic' : 'Exact'}
                </button>
              </MetricTooltip>
            </div>
          </div>

          {/* Inline type + status filters */}
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
        </div>
      </div>

      {/* ── Semantic search loading ──────────────────────────────────── */}
      {searching && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {/* ── Semantic search results ──────────────────────────────────── */}
      {!searching && showSemanticResults && (
        <>
          {semanticResults.length === 0 ? (
            <EmptyState
              title="No matches"
              description="Try a different phrasing — semantic search finds notes by meaning, not exact words."
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {semanticResults.length} result{semanticResults.length > 1 ? 's' : ''} by
                relevance
              </p>
              {semanticResults.map((hit) => (
                <SemanticHitCard
                  key={hit.note.id}
                  hit={hit}
                  onClickNote={() =>
                    setDrawerNoteId(drawerNoteId === hit.note.id ? null : hit.note.id)
                  }
                  active={drawerNoteId === hit.note.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Normal note list (filtered by exact search or unfiltered) ── */}
      {!searching && !showSemanticResults && (
        <>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} lines={3} />
              ))}
            </div>
          ) : filteredNotes.length === 0 ? (
            <EmptyState
              variant={
                total === 0 && typeFilter === 'all' && statusFilter === 'all' && !searchQuery
                  ? 'notes'
                  : undefined
              }
              title="No notes found"
              description={
                total === 0 && typeFilter === 'all' && statusFilter === 'all' && !searchQuery
                  ? 'Knowledge notes capture important patterns, gotchas, and guidelines.'
                  : 'No notes match the current filters.'
              }
            />
          ) : (
            <>
              {filteredNotes.length > 0 && (
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
                className="space-y-3"
                variants={reducedMotion ? undefined : staggerContainer}
                initial="hidden"
                animate="visible"
              >
                <AnimatePresence mode="popLayout">
                  {filteredNotes.map((note) => (
                    <motion.div
                      key={note.id}
                      variants={fadeInUp}
                      exit="exit"
                      layout={!reducedMotion}
                    >
                      <NoteCard
                        active={drawerNoteId === note.id}
                        onSelect={() =>
                          setDrawerNoteId(drawerNoteId === note.id ? null : note.id)
                        }
                        selected={multiSelect.isSelected(note.id)}
                        onToggleSelect={(shiftKey) => multiSelect.toggle(note.id, shiftKey)}
                        note={note}
                        onUpdate={(updated) =>
                          updateItem(
                            (n) => n.id === updated.id,
                            () => updated,
                          )
                        }
                        onDelete={() =>
                          confirmDialog.open({
                            title: 'Delete Note',
                            description: 'This note will be permanently deleted.',
                            onConfirm: async () => {
                              await notesApi.delete(note.id)
                              removeItems((n) => n.id === note.id)
                              if (drawerNoteId === note.id) setDrawerNoteId(null)
                              toast.success('Note deleted')
                            },
                          })
                        }
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
              <LoadMoreSentinel
                sentinelRef={sentinelRef}
                loadingMore={loadingMore}
                hasMore={hasMore}
              />
            </>
          )}

          <BulkActionBar
            count={multiSelect.selectionCount}
            onDelete={handleBulkDelete}
            onClear={multiSelect.clear}
          />
        </>
      )}

      {/* ── Propagation Drawer (slide-in from right) ─────────────────── */}
      <AnimatePresence>
        {drawerNoteId && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="fixed right-0 top-0 h-full w-full sm:w-96 bg-surface-base border-l border-border-default shadow-2xl z-40 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-cyan-400" />
                <MetricTooltip term="spreading_activation" showIndicator>
                  <span className="text-sm font-medium text-gray-200">Propagation</span>
                </MetricTooltip>
              </div>
              <button
                onClick={() => setDrawerNoteId(null)}
                className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {distributionViz.isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Spinner />
                </div>
              ) : (
                <PropagationVizWidget
                  data={distributionViz.data ?? undefined}
                  height={400}
                  interactive
                  onParticleClick={handleParticleClick}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Click-away overlay for drawer ─────────────────────────────── */}
      <AnimatePresence>
        {drawerNoteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-30"
            onClick={() => setDrawerNoteId(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Knowledge Graph fullscreen modal ──────────────────────────── */}
      <AnimatePresence>
        {showGraph && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                <MetricTooltip term="fabric" showIndicator>
                  <h2 className="text-lg font-semibold text-gray-100">Knowledge Graph</h2>
                </MetricTooltip>
              </div>
              <button
                onClick={() => setShowGraph(false)}
                className="p-2 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <NeuronExplorer workspaceSlug={wsSlug} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FormDialog {...formDialog.dialogProps} onSubmit={noteForm.submit}>
        {noteForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Semantic Hit Card (compact) ───────────────────────────────────────────

interface SemanticHitCardProps {
  hit: SemanticHit
  onClickNote: () => void
  active?: boolean
}

const typeColorMap: Record<string, string> = {
  gotcha: 'border-l-red-500',
  guideline: 'border-l-blue-500',
  pattern: 'border-l-purple-500',
  tip: 'border-l-green-500',
  observation: 'border-l-yellow-500',
  assertion: 'border-l-orange-500',
  context: 'border-l-gray-500',
}

function SemanticHitCard({ hit, onClickNote, active }: SemanticHitCardProps) {
  const borderColor = typeColorMap[hit.note.note_type] || 'border-l-gray-500'
  return (
    <Card
      lazy="sm"
      className={`border-l-4 ${borderColor} cursor-pointer transition-colors ${active ? 'ring-1 ring-cyan-500/50 bg-cyan-500/[0.04]' : ''}`}
      onClick={onClickNote}
    >
      <CardContent>
        {/* Row 1: type + score + date */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Badge variant="default">{hit.note.note_type}</Badge>
            <ImportanceBadge importance={hit.note.importance} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-500">
              {(hit.score * 100).toFixed(0)}% match
            </span>
            <span className="text-xs text-gray-600">
              {new Date(hit.note.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        {/* Row 2: content preview */}
        <p className="text-sm text-gray-300 line-clamp-2">{hit.note.content}</p>
      </CardContent>
    </Card>
  )
}

// ── Icons for scope types and anchor entity types ─────────────────────────

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

// ── Note Card (simplified: type badge + title/preview + importance + date) ──

interface NoteCardProps {
  note: Note
  onDelete: () => void
  onUpdate: (updatedNote: Note) => void
  selected?: boolean
  onToggleSelect?: (shiftKey: boolean) => void
  /** Whether this note is selected for propagation drawer */
  active?: boolean
  /** Called when user clicks to open propagation drawer */
  onSelect?: () => void
}

function NoteCard({
  note,
  onDelete,
  onUpdate,
  selected,
  onToggleSelect,
  active,
  onSelect,
}: NoteCardProps) {
  const [expanded, setExpanded] = useState(false)
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
    <Card
      lazy="sm"
      className={`border-l-4 ${typeColors[note.note_type] || 'border-l-gray-500'} transition-colors cursor-pointer ${active ? 'ring-1 ring-cyan-500/50 bg-cyan-500/[0.04]' : ''} ${selected ? 'border-l-indigo-500 bg-indigo-500/[0.05]' : ''}`}
      onClick={onSelect}
    >
      <div className="flex">
        {onToggleSelect && <SelectZone selected={!!selected} onToggle={onToggleSelect} />}
        <CardContent className="flex-1 min-w-0">
          {/* Superseded banner */}
          {note.superseded_by && (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded bg-yellow-900/20 border border-yellow-800/30 text-yellow-500 text-xs">
              <AlertTriangleIcon />
              <span>This note has been superseded by a newer version</span>
            </div>
          )}

          {/* Row 1: type badge + importance + date + actions */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Badge variant="default">{note.note_type}</Badge>
              <ImportanceBadge importance={note.importance} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {new Date(note.created_at).toLocaleDateString()}
              </span>
              <OverflowMenu actions={menuActions} />
            </div>
          </div>

          {/* Row 2: content preview (max 2 lines) */}
          <p className="text-sm text-gray-300 line-clamp-2">{note.content}</p>

          {/* ── Expanded details (on hover/click) ──────────────────────── */}
          {expanded && (
            <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-2">
              {/* Full content */}
              <CollapsibleMarkdown content={note.content} />

              {/* Status */}
              <div className="flex items-center gap-2">
                <InteractiveNoteStatusBadge
                  status={note.status}
                  onStatusChange={handleStatusChange}
                />
                {(note.staleness_score || 0) > 0.5 && (
                  <span className="text-xs text-yellow-500">
                    Staleness: {((note.staleness_score || 0) * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Scope */}
              {showScope && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  {scopeIcons[scope.type] || null}
                  <span className="font-mono">{scope.path || scope.type}</span>
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag, index) => (
                    <Badge key={`${tag}-${index}`} variant="default">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Anchors */}
              {anchors.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {visibleAnchors.map((anchor, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs text-gray-400"
                    >
                      {anchorEntityIcons[anchor.entity_type] || <FileTextIcon />}
                      <span className="font-mono truncate max-w-48">{anchor.entity_id}</span>
                    </span>
                  ))}
                  {hiddenCount > 0 && (
                    <span className="text-xs text-gray-500">+{hiddenCount} more</span>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>Created by {note.created_by}</span>
                {note.last_confirmed_at && (
                  <span>
                    Last confirmed: {new Date(note.last_confirmed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Toggle expand */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="mt-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </CardContent>
      </div>
    </Card>
  )
}
