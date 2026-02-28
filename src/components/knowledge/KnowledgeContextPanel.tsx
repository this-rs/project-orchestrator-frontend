import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  X,
  FileText,
  Code,
  Package,
  Shapes,
  GitCommit,
  Scale,
  BookOpen,
  Network,
} from 'lucide-react'
import { notesApi } from '@/services'
import {
  Badge,
  ImportanceBadge,
  CollapsibleMarkdown,
  Spinner,
  EmptyState,
} from '@/components/ui'
import type {
  Note,
  Decision,
  Commit,
  PropagatedNote,
  ContextKnowledge,
  PropagatedKnowledge,
} from '@/types'

// ── Props ───────────────────────────────────────────────────────────────

export interface KnowledgeContextPanelProps {
  entityType: string // 'file' | 'function' | 'struct' | 'trait'
  entityId: string // path or name
  projectSlug?: string
  isOpen: boolean
  onClose: () => void
}

// ── Accordion Section ───────────────────────────────────────────────────

interface AccordionSectionProps {
  title: string
  icon: React.ReactNode
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}

function AccordionSection({ title, icon, count, defaultOpen = false, children }: AccordionSectionProps) {
  const [expanded, setExpanded] = useState(defaultOpen)

  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-gray-200 hover:bg-white/[0.04] transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
        {icon}
        <span className="flex-1">{title}</span>
        <span className="text-xs text-gray-500 tabular-nums">{count}</span>
      </button>
      {expanded && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

// ── Entity type icons ───────────────────────────────────────────────────

function EntityIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 text-gray-400'
  switch (type) {
    case 'file':
      return <FileText className={cls} />
    case 'function':
      return <Code className={cls} />
    case 'struct':
      return <Package className={cls} />
    case 'trait':
      return <Shapes className={cls} />
    default:
      return <FileText className={cls} />
  }
}

// ── Relation type badge colors ──────────────────────────────────────────

const relationColors: Record<string, string> = {
  IMPORTS: 'bg-blue-500/15 text-blue-400 ring-blue-500/25',
  CO_CHANGED: 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  AFFECTS: 'bg-purple-500/15 text-purple-400 ring-purple-500/25',
  LINKED_TO: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
}

// ── Sub-components for each section ─────────────────────────────────────

function NoteItem({ note }: { note: Note }) {
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <Badge variant="default">{note.note_type}</Badge>
        <ImportanceBadge importance={note.importance} />
        {(note.staleness_score || 0) > 0.5 && (
          <span className="text-[10px] font-mono text-yellow-500" title="Staleness score">
            Stale: {((note.staleness_score || 0) * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <CollapsibleMarkdown content={note.content} maxHeight={80} />
    </div>
  )
}

function PropagatedNoteItem({ note }: { note: PropagatedNote }) {
  const colorClass = note.relation_type ? (relationColors[note.relation_type] || 'bg-gray-500/15 text-gray-400 ring-gray-500/25') : ''
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <Badge variant="default">{note.note_type}</Badge>
        <ImportanceBadge importance={note.importance} />
        {note.relation_type && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${colorClass}`}>
            {note.relation_type}
          </span>
        )}
        {note.distance != null && (
          <span className="text-[10px] font-mono text-gray-500" title="Graph distance">
            d={note.distance}
          </span>
        )}
        <span className="text-[10px] font-mono text-gray-500 ml-auto">
          {(note.relevance_score * 100).toFixed(0)}%
        </span>
      </div>
      <CollapsibleMarkdown content={note.content} maxHeight={80} />
    </div>
  )
}

function DecisionItem({ decision }: { decision: Decision }) {
  const statusColors: Record<string, string> = {
    proposed: 'bg-yellow-500/15 text-yellow-400',
    accepted: 'bg-emerald-500/15 text-emerald-400',
    deprecated: 'bg-red-500/15 text-red-400',
    superseded: 'bg-gray-500/15 text-gray-400',
  }
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[decision.status] || ''}`}>
          {decision.status}
        </span>
        {decision.chosen_option && (
          <span className="text-[10px] text-emerald-400">{decision.chosen_option}</span>
        )}
        <span className="text-[10px] text-gray-500 ml-auto">
          {new Date(decision.decided_at).toLocaleDateString()}
        </span>
      </div>
      <p className="text-xs text-gray-300 line-clamp-3">{decision.description}</p>
    </div>
  )
}

function CommitItem({ commit }: { commit: Commit }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      <GitCommit className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-300 line-clamp-1">{commit.message}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
          <code className="font-mono">{commit.sha.slice(0, 7)}</code>
          {commit.author && <span>{commit.author}</span>}
          <span>{new Date(commit.timestamp).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  )
}

// ── Relation stats bar ──────────────────────────────────────────────────

function RelationStats({ stats }: { stats: { imports: number; co_changed: number; affects: number } }) {
  const items = [
    { label: 'imports', count: stats.imports, color: 'text-blue-400' },
    { label: 'co-changed', count: stats.co_changed, color: 'text-amber-400' },
    { label: 'affects', count: stats.affects, color: 'text-purple-400' },
  ].filter((s) => s.count > 0)

  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
      <Network className="w-3.5 h-3.5 text-gray-500" />
      {items.map((item) => (
        <span key={item.label} className={`text-xs font-medium ${item.color}`}>
          {item.count} {item.label}
        </span>
      ))}
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────

export function KnowledgeContextPanel({
  entityType,
  entityId,
  projectSlug,
  isOpen,
  onClose,
}: KnowledgeContextPanelProps) {
  const [directNotes, setDirectNotes] = useState<Note[]>([])
  const [propagatedNotes, setPropagatedNotes] = useState<PropagatedNote[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [relationStats, setRelationStats] = useState<{ imports: number; co_changed: number; affects: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch all data sources in parallel
      const promises: Promise<void>[] = []

      // 1. Direct notes
      promises.push(
        notesApi
          .getEntityNotes(entityType, entityId)
          .then((res) => setDirectNotes(res.items || []))
          .catch(() => setDirectNotes([])),
      )

      // 2. Propagated notes (if project slug is available)
      if (projectSlug) {
        promises.push(
          notesApi
            .getPropagatedNotes({ entity_type: entityType, entity_id: entityId, max_depth: 3 })
            .then((res) => setPropagatedNotes(res.items || []))
            .catch(() => setPropagatedNotes([])),
        )
      }

      // 3. Context knowledge (decisions + commits)
      promises.push(
        notesApi
          .getContextKnowledge({ entity_type: entityType, entity_id: entityId })
          .then((res: ContextKnowledge) => {
            setDecisions(res.decisions || [])
            setCommits(res.commits || [])
          })
          .catch(() => {
            setDecisions([])
            setCommits([])
          }),
      )

      // 4. Propagated knowledge (relation stats)
      if (projectSlug) {
        promises.push(
          notesApi
            .getPropagatedKnowledge({ entity_type: entityType, entity_id: entityId })
            .then((res: PropagatedKnowledge) => {
              setRelationStats(res.relation_stats || null)
            })
            .catch(() => setRelationStats(null)),
        )
      }

      await Promise.all(promises)
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId, projectSlug])

  useEffect(() => {
    if (isOpen) fetchData()
  }, [isOpen, fetchData])

  if (!isOpen) return null

  const totalItems = directNotes.length + propagatedNotes.length + decisions.length + commits.length

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md flex flex-col bg-[var(--surface-base)] border-l border-white/[0.06] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0">
          <EntityIcon type={entityType} />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-200 truncate">Knowledge Context</h3>
            <p className="text-xs text-gray-500 font-mono truncate" title={entityId}>
              {entityId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Relation stats */}
        {relationStats && <RelationStats stats={relationStats} />}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner />
            </div>
          ) : totalItems === 0 ? (
            <EmptyState
              title="No knowledge context"
              description="No notes, decisions, or commits are linked to this entity yet."
            />
          ) : (
            <>
              <AccordionSection
                title="Direct Notes"
                icon={<BookOpen className="w-4 h-4 text-blue-400" />}
                count={directNotes.length}
                defaultOpen={directNotes.length > 0}
              >
                {directNotes.length === 0 ? (
                  <p className="text-xs text-gray-500 py-1">No notes directly linked</p>
                ) : (
                  directNotes.map((note) => <NoteItem key={note.id} note={note} />)
                )}
              </AccordionSection>

              <AccordionSection
                title="Propagated Notes"
                icon={<Network className="w-4 h-4 text-amber-400" />}
                count={propagatedNotes.length}
                defaultOpen={propagatedNotes.length > 0 && directNotes.length === 0}
              >
                {propagatedNotes.length === 0 ? (
                  <p className="text-xs text-gray-500 py-1">No notes propagated from related entities</p>
                ) : (
                  propagatedNotes.map((note) => <PropagatedNoteItem key={note.id} note={note} />)
                )}
              </AccordionSection>

              <AccordionSection
                title="Decisions"
                icon={<Scale className="w-4 h-4 text-purple-400" />}
                count={decisions.length}
                defaultOpen={decisions.length > 0 && directNotes.length === 0 && propagatedNotes.length === 0}
              >
                {decisions.length === 0 ? (
                  <p className="text-xs text-gray-500 py-1">No architectural decisions affect this entity</p>
                ) : (
                  decisions.map((d) => <DecisionItem key={d.id} decision={d} />)
                )}
              </AccordionSection>

              <AccordionSection
                title="Commits"
                icon={<GitCommit className="w-4 h-4 text-emerald-400" />}
                count={commits.length}
              >
                {commits.length === 0 ? (
                  <p className="text-xs text-gray-500 py-1">No commits linked to this entity</p>
                ) : (
                  commits.map((c) => <CommitItem key={c.sha} commit={c} />)
                )}
              </AccordionSection>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
