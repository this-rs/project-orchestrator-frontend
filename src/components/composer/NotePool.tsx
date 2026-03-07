// ============================================================================
// NotePool — Draggable note list for the Pattern Composer
// ============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  BookOpen,
  AlertTriangle,
  Lightbulb,
  FileText,
  Layers,
  Search,
  Filter,
  GripVertical,
} from 'lucide-react'
import { notesApi } from '@/services/notes'
import type { Note, NoteType } from '@/types'

// ============================================================================
// CONSTANTS
// ============================================================================

const NOTE_TYPE_CONFIG: Record<NoteType, { icon: typeof BookOpen; color: string; label: string }> = {
  guideline: { icon: BookOpen, color: '#3B82F6', label: 'Guideline' },
  gotcha: { icon: AlertTriangle, color: '#EF4444', label: 'Gotcha' },
  pattern: { icon: Layers, color: '#8B5CF6', label: 'Pattern' },
  tip: { icon: Lightbulb, color: '#F59E0B', label: 'Tip' },
  context: { icon: FileText, color: '#6B7280', label: 'Context' },
  observation: { icon: FileText, color: '#10B981', label: 'Observation' },
  assertion: { icon: FileText, color: '#EC4899', label: 'Assertion' },
}

const TYPE_FILTERS: NoteType[] = ['guideline', 'gotcha', 'pattern', 'tip', 'context', 'observation', 'assertion']

// ============================================================================
// DRAGGABLE NOTE ITEM
// ============================================================================

interface DraggableNoteProps {
  note: Note
}

function DraggableNoteItem({ note }: DraggableNoteProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `note-${note.id}`,
    data: { type: 'note', note },
  })

  const cfg = NOTE_TYPE_CONFIG[note.note_type as NoteType] ?? NOTE_TYPE_CONFIG.context
  const Icon = cfg.icon

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 1000,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-2 px-2 py-1.5 rounded-md border transition-all duration-150 cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-50 border-indigo-500 bg-indigo-950/30'
          : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
      }`}
      {...listeners}
      {...attributes}
    >
      <GripVertical size={12} className="text-slate-600 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <Icon size={12} style={{ color: cfg.color }} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
          {note.content.slice(0, 120)}
          {note.content.length > 120 ? '...' : ''}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className="text-[9px] font-medium px-1 py-0.5 rounded"
            style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}
          >
            {cfg.label}
          </span>
          {note.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[9px] text-slate-500 px-1 py-0.5 rounded bg-slate-800">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// NOTE POOL
// ============================================================================

interface NotePoolProps {
  projectId: string
  /** Note IDs already bound to states (shown as dimmed) */
  boundNoteIds?: Set<string>
}

function NotePoolComponent({ projectId, boundNoteIds }: NotePoolProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<NoteType | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  // Fetch notes for the project
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params: Record<string, string> = { project_id: projectId, limit: '100' }
        if (typeFilter) params.note_type = typeFilter
        const result = await notesApi.list(params)
        if (!cancelled) setNotes(result.items)
      } catch (err) {
        console.error('[NotePool] fetch error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, typeFilter])

  // Filter by search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes
    const q = searchQuery.toLowerCase()
    return notes.filter(
      (n) =>
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [notes, searchQuery])

  // Separate bound vs available
  const { available, bound } = useMemo(() => {
    const avail: Note[] = []
    const bnd: Note[] = []
    for (const note of filteredNotes) {
      if (boundNoteIds?.has(note.id)) {
        bnd.push(note)
      } else {
        avail.push(note)
      }
    }
    return { available: avail, bound: bnd }
  }, [filteredNotes, boundNoteIds])

  const handleTypeFilter = useCallback((type: NoteType | '') => {
    setTypeFilter((prev) => (prev === type ? '' : type))
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Note Pool
          </h3>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`p-1 rounded transition-colors ${
              showFilters || typeFilter ? 'text-indigo-400 bg-indigo-950/30' : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            <Filter size={12} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-slate-800/50 border border-slate-700/50 rounded-md text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Type filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-1 mt-2">
            {TYPE_FILTERS.map((type) => {
              const cfg = NOTE_TYPE_CONFIG[type]
              const active = typeFilter === type
              return (
                <button
                  key={type}
                  onClick={() => handleTypeFilter(type)}
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
                    active
                      ? 'border-current bg-current/10'
                      : 'border-slate-700 text-slate-500 hover:text-slate-400'
                  }`}
                  style={active ? { color: cfg.color, borderColor: cfg.color } : undefined}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {loading ? (
          <p className="text-[10px] text-slate-500 text-center py-4">Loading notes...</p>
        ) : available.length === 0 && bound.length === 0 ? (
          <p className="text-[10px] text-slate-500 text-center py-4">No notes found</p>
        ) : (
          <>
            {available.map((note) => (
              <DraggableNoteItem key={note.id} note={note} />
            ))}
            {bound.length > 0 && (
              <>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-3 mb-1 px-1">
                  Already bound ({bound.length})
                </div>
                {bound.map((note) => (
                  <div key={note.id} className="opacity-40 pointer-events-none">
                    <DraggableNoteItem note={note} />
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer count */}
      <div className="px-3 py-1.5 border-t border-slate-700/50 text-[9px] text-slate-600">
        {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
        {typeFilter && ` (${NOTE_TYPE_CONFIG[typeFilter]?.label})`}
      </div>
    </div>
  )
}

export const NotePool = memo(NotePoolComponent)
