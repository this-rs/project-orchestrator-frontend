import { memo, useState, useCallback, useEffect } from 'react'
import type { NoteNodeData } from '@/types/intelligence'
import type { Note } from '@/types'
import { notesApi } from '@/services/notes'
import {
  StickyNote,
  AlertTriangle,
  Lightbulb,
  BookOpen,
  Zap,
  Eye,
  Activity,
  Check,
  XCircle,
  Tag,
  Link2,
  FileCode2,
  Braces,
  Box,
  Brain,
  Loader2,
  Sparkles,
} from 'lucide-react'

// ============================================================================
// MINI GAUGE (same pattern as FileContextCard — will be shared in Step 3)
// ============================================================================

function MiniGauge({
  label,
  value,
  color,
  max = 1,
}: {
  label: string
  value: number
  color: string
  max?: number
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 min-w-[60px] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 min-w-[32px] text-right">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
}

// ============================================================================
// STATUS BADGE
// ============================================================================

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: '#052e16', text: '#4ade80', border: '#166534' },
  needs_review: { bg: '#431407', text: '#fb923c', border: '#9a3412' },
  stale: { bg: '#431407', text: '#fb923c', border: '#9a3412' },
  obsolete: { bg: '#450a0a', text: '#f87171', border: '#991b1b' },
  archived: { bg: '#1e293b', text: '#64748b', border: '#334155' },
}

function StatusBadge({ status }: { status: string }) {
  const colors = statusColors[status] ?? { bg: '#1e293b', text: '#94a3b8', border: '#334155' }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-md border"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ============================================================================
// IMPORTANCE BADGE
// ============================================================================

const importanceConfig: Record<string, { color: string; label: string }> = {
  critical: { color: '#f87171', label: 'CRITICAL' },
  high: { color: '#fb923c', label: 'HIGH' },
  medium: { color: '#fbbf24', label: 'MEDIUM' },
  low: { color: '#94a3b8', label: 'LOW' },
}

function ImportanceBadge({ importance }: { importance: string }) {
  const cfg = importanceConfig[importance] ?? { color: '#94a3b8', label: importance }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold" style={{ color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  )
}

// ============================================================================
// NOTE TYPE ICONS & COLORS
// ============================================================================

const noteTypeIcons: Record<string, typeof StickyNote> = {
  gotcha: AlertTriangle,
  tip: Lightbulb,
  guideline: BookOpen,
  pattern: Zap,
  context: Eye,
  observation: Activity,
  assertion: Sparkles,
}

const noteTypeColors: Record<string, string> = {
  gotcha: '#f87171',
  tip: '#4ade80',
  guideline: '#60a5fa',
  pattern: '#a78bfa',
  context: '#94a3b8',
  observation: '#fbbf24',
  assertion: '#f472b6',
}

// ============================================================================
// ANCHOR ICON
// ============================================================================

const anchorIcons: Record<string, typeof Box> = {
  file: FileCode2,
  function: Braces,
  struct: Box,
  trait: Box,
  skill: Brain,
}

// ============================================================================
// SECTION LOADING PLACEHOLDER
// ============================================================================

function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <Loader2 size={10} className="text-slate-600 animate-spin" />
      <span className="text-[10px] text-slate-600">{label}</span>
    </div>
  )
}

// ============================================================================
// NOTE CONTEXT CARD — MAIN COMPONENT
// ============================================================================

interface NoteContextCardProps {
  data: NoteNodeData
  entityId: string
}

interface SynapseLink {
  noteId: string
  content: string
  noteType: string
  weight: number
}

function NoteContextCardComponent({ data, entityId }: NoteContextCardProps) {
  // Full note data from API
  const [fullNote, setFullNote] = useState<Note | null>(null)
  const [synapses, setSynapses] = useState<SynapseLink[]>([])
  const [loading, setLoading] = useState(true)

  // Action state (confirm / invalidate)
  const [confirming, setConfirming] = useState(false)
  const [invalidating, setInvalidating] = useState(false)
  const [actionDone, setActionDone] = useState<'confirmed' | 'invalidated' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Fetch enriched data
  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      const results = await Promise.allSettled([
        // 1. Full note details
        notesApi.get(entityId),
        // 2. Neuron search for synapse connections (find notes near this one)
        notesApi.searchNeurons({ query: data.label, max_results: 5, min_score: 0.1 }),
      ])

      if (cancelled) return

      if (results[0].status === 'fulfilled') {
        setFullNote(results[0].value)
      }
      if (results[1].status === 'fulfilled') {
        const neuronResult = results[1].value
        // Extract activated notes, excluding self
        const seen = new Set<string>()
        const links: SynapseLink[] = []
        for (const n of neuronResult.results ?? []) {
          if (n.id === entityId || seen.has(n.id)) continue
          seen.add(n.id)
          links.push({
            noteId: n.id,
            content: n.content,
            noteType: n.note_type,
            weight: n.activation_score,
          })
        }
        setSynapses(links.slice(0, 5))
      }

      setLoading(false)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [entityId, data.label])

  // Actions
  const handleConfirm = useCallback(async () => {
    setConfirming(true)
    setActionError(null)
    try {
      await notesApi.confirm(entityId)
      setActionDone('confirmed')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to confirm')
    } finally {
      setConfirming(false)
    }
  }, [entityId])

  const handleInvalidate = useCallback(async () => {
    setInvalidating(true)
    setActionError(null)
    try {
      await notesApi.invalidate(entityId, 'Invalidated from graph inspector')
      setActionDone('invalidated')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to invalidate')
    } finally {
      setInvalidating(false)
    }
  }, [entityId])

  // Derived
  const NoteIcon = noteTypeIcons[data.noteType] ?? StickyNote
  const noteColor = noteTypeColors[data.noteType] ?? '#fbbf24'
  const anchors = fullNote?.anchors ?? []
  const content = fullNote?.content ?? data.label
  const tags = fullNote?.tags ?? data.tags ?? []

  return (
    <div className="space-y-3">
      {/* -- Type, Status & Importance row --------------------------------- */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border"
          style={{ backgroundColor: `${noteColor}15`, color: noteColor, borderColor: `${noteColor}40` }}
        >
          <NoteIcon size={10} />
          {data.noteType}
        </div>
        <StatusBadge status={data.status} />
        <ImportanceBadge importance={data.importance} />
      </div>

      {/* -- Energy & Staleness gauges ------------------------------------- */}
      <div className="space-y-1.5">
        <MiniGauge
          label="Energy"
          value={data.energy}
          color="#22d3ee"
        />
        <MiniGauge
          label="Staleness"
          value={data.staleness}
          color={data.staleness > 0.7 ? '#f87171' : data.staleness > 0.4 ? '#fb923c' : '#4ade80'}
        />
      </div>

      {/* -- Tags ---------------------------------------------------------- */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Tag size={10} className="text-slate-500 shrink-0" />
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-slate-400 border border-slate-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* -- Content preview ----------------------------------------------- */}
      <div className="bg-slate-800/50 rounded-md p-2 border border-slate-700/50">
        <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wider">Content</p>
        {loading && !fullNote ? (
          <SectionLoader label="Loading..." />
        ) : (
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-8 max-h-[160px] overflow-y-auto">
            {content}
          </p>
        )}
      </div>

      {/* -- Anchored entities --------------------------------------------- */}
      {anchors.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Link2 size={10} className="text-blue-400" />
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              Linked Entities
            </span>
            <span className="text-[10px] text-slate-600 font-mono">({anchors.length})</span>
          </div>
          <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
            {anchors.map((anchor) => {
              const AnchorIcon = anchorIcons[anchor.entity_type] ?? Box
              const anchorLabel = anchor.entity_id.split('/').pop() ?? anchor.entity_id
              return (
                <div
                  key={`${anchor.entity_type}-${anchor.entity_id}`}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-800/60 group"
                >
                  <AnchorIcon size={10} className="text-slate-500 shrink-0" />
                  <span className="text-[10px] text-slate-400 font-mono truncate flex-1 group-hover:text-blue-300">
                    {anchorLabel}
                  </span>
                  <span className="text-[8px] text-slate-600">{anchor.entity_type}</span>
                  {!anchor.is_valid && (
                    <span className="text-[8px] text-red-500 font-medium">stale</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* -- Synapse connections ------------------------------------------- */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Brain size={10} className="text-cyan-400" />
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            Neural Neighbors
          </span>
          {!loading && (
            <span className="text-[10px] text-slate-600 font-mono">({synapses.length})</span>
          )}
        </div>
        {loading ? (
          <SectionLoader label="Searching synapses..." />
        ) : synapses.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic pl-3">No synapse connections found</p>
        ) : (
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {synapses.map((syn) => {
              const SynIcon = noteTypeIcons[syn.noteType] ?? StickyNote
              const synColor = noteTypeColors[syn.noteType] ?? '#94a3b8'
              // Weight bar (0→1)
              const barPct = Math.max(5, syn.weight * 100)
              return (
                <div
                  key={syn.noteId}
                  className="bg-cyan-950/20 rounded-md px-2 py-1 border border-cyan-900/30 hover:border-cyan-700/40 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <SynIcon size={9} color={synColor} />
                    <span className="text-[9px] font-medium" style={{ color: synColor }}>{syn.noteType}</span>
                    <div className="flex-1" />
                    <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${barPct}%`, opacity: 0.5 + syn.weight * 0.5 }}
                      />
                    </div>
                    <span className="text-[8px] font-mono text-cyan-600">{syn.weight.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">
                    {syn.content}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* -- Actions (Confirm / Invalidate) -------------------------------- */}
      {!actionDone && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirm}
            disabled={confirming || invalidating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors
              bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60 hover:text-emerald-300
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={12} />
            {confirming ? 'Confirming...' : 'Confirm'}
          </button>
          <button
            onClick={handleInvalidate}
            disabled={confirming || invalidating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors
              bg-red-950/60 border-red-800 text-red-400 hover:bg-red-900/60 hover:text-red-300
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={12} />
            {invalidating ? 'Invalidating...' : 'Invalidate'}
          </button>
        </div>
      )}

      {/* -- Action result ------------------------------------------------- */}
      {actionDone && (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border ${
          actionDone === 'confirmed'
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
            : 'bg-red-950/40 border-red-800 text-red-400'
        }`}>
          {actionDone === 'confirmed' ? <Check size={12} /> : <XCircle size={12} />}
          Note {actionDone} successfully
        </div>
      )}

      {actionError && (
        <p className="text-[10px] text-red-400 px-1">{actionError}</p>
      )}
    </div>
  )
}

export const NoteContextCard = memo(NoteContextCardComponent)
