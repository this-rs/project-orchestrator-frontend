// ============================================================================
// EdgeProvenancePanel — "why does this link exist?"
// ============================================================================
//
// Every fiber of the mental tissue is explainable. Clicking an edge in the 3D
// graph opens this panel with relation-specific provenance:
//   - CO_CHANGED  → the shared commits that created the coupling
//   - SYNAPSE     → weight + the two connected notes (content preview, energy)
//   - AFFECTS     → the architectural decision (rationale, chosen option)
//   - LINKED_TO   → the note attached to the code entity
//   - default     → endpoints, weight, relation semantics
// ============================================================================

import { memo, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { X, GitCommitHorizontal, Zap, Scale, StickyNote, Link2 } from 'lucide-react'
import { selectedEdgeAtom } from '@/atoms/intelligence'
import { commitsApi } from '@/services/commits'
import { decisionsApi } from '@/services/decisions'
import { notesApi } from '@/services/notes'
import type { Decision, Note } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip the `entityType:` prefix from a graph node id */
function rawId(nodeId: string): string {
  const idx = nodeId.indexOf(':')
  return idx > 0 ? nodeId.slice(idx + 1) : nodeId
}

function entityTypeOf(nodeId: string): string {
  const idx = nodeId.indexOf(':')
  return idx > 0 ? nodeId.slice(0, idx) : ''
}

interface SharedCommit {
  sha: string
  message: string
  date?: string
}

// ── Component ────────────────────────────────────────────────────────────────

function EdgeProvenancePanelComponent() {
  const [edge, setEdge] = useAtom(selectedEdgeAtom)
  const [loading, setLoading] = useState(false)
  const [sharedCommits, setSharedCommits] = useState<SharedCommit[] | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [notes, setNotes] = useState<Note[]>([])

  // Escape closes the panel
  useEffect(() => {
    if (!edge) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEdge(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edge, setEdge])

  // Fetch relation-specific provenance
  useEffect(() => {
    if (!edge) return
    let cancelled = false
    setLoading(true)
    setSharedCommits(null)
    setDecision(null)
    setNotes([])

    const load = async () => {
      try {
        if (edge.relationType === 'CO_CHANGED' || edge.relationType === 'CO_CHANGED_TRANSITIVE') {
          // Shared commits = intersection of both files' histories
          const [a, b] = await Promise.all([
            commitsApi.getFileHistory(rawId(edge.source), { limit: 100 }),
            commitsApi.getFileHistory(rawId(edge.target), { limit: 100 }),
          ])
          if (cancelled) return
          const bShas = new Map(b.items.map((c) => [c.commit_sha, c]))
          const shared = a.items
            .filter((c) => bShas.has(c.commit_sha))
            .slice(0, 8)
            .map((c) => ({ sha: c.commit_sha, message: c.message, date: c.date }))
          setSharedCommits(shared)
        } else if (edge.relationType === 'AFFECTS') {
          // Decision → code entity: fetch the decision (source is decision:uuid)
          const decisionEnd = entityTypeOf(edge.source) === 'decision' ? edge.source : edge.target
          if (entityTypeOf(decisionEnd) === 'decision') {
            const d = await decisionsApi.get(rawId(decisionEnd))
            if (!cancelled) setDecision(d)
          }
        } else if (edge.relationType === 'SYNAPSE' || edge.relationType === 'LINKED_TO') {
          // Fetch the note endpoint(s) for content preview + energy
          const noteEnds = [edge.source, edge.target].filter((id) => entityTypeOf(id) === 'note')
          const fetched = await Promise.all(
            noteEnds.map((id) => notesApi.get(rawId(id)).catch(() => null)),
          )
          if (!cancelled) setNotes(fetched.filter((n): n is Note => n !== null))
        }
      } catch {
        // Provenance is best-effort — the panel still shows endpoints/weight
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [edge])

  if (!edge) return null

  const relIcon =
    edge.relationType.startsWith('CO_CHANGED') ? <GitCommitHorizontal size={13} className="text-orange-300" />
    : edge.relationType === 'SYNAPSE' ? <Zap size={13} className="text-cyan-300" />
    : edge.relationType === 'AFFECTS' ? <Scale size={13} className="text-violet-300" />
    : edge.relationType === 'LINKED_TO' ? <StickyNote size={13} className="text-slate-300" />
    : <Link2 size={13} className="text-slate-400" />

  return (
    <div className="absolute bottom-3 right-3 z-50 w-80 max-h-[60%] overflow-y-auto rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-600 shadow-2xl p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {relIcon}
        <span className="text-xs font-semibold text-slate-200">{edge.relationType}</span>
        {edge.weight !== undefined && (
          <span className="text-[10px] text-slate-500">w {edge.weight.toFixed(2)}</span>
        )}
        {edge.count !== undefined && (
          <span className="text-[10px] text-slate-500">×{edge.count}</span>
        )}
        <button
          onClick={() => setEdge(null)}
          className="ml-auto p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Endpoints */}
      <div className="text-[11px] text-slate-400 mb-2 break-all">
        <span className="text-slate-300">{edge.sourceLabel}</span>
        <span className="text-slate-600 mx-1">→</span>
        <span className="text-slate-300">{edge.targetLabel}</span>
      </div>

      {loading && (
        <div className="text-[11px] text-slate-500 animate-pulse py-1">Loading provenance…</div>
      )}

      {/* CO_CHANGED — shared commits */}
      {!loading && sharedCommits && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Shared commits {sharedCommits.length > 0 && `(${sharedCommits.length})`}
          </div>
          {sharedCommits.length === 0 && (
            <div className="text-[11px] text-slate-500">
              No shared commits in recent history — coupling may come from older activity.
            </div>
          )}
          {sharedCommits.map((c) => (
            <div key={c.sha} className="rounded-md bg-slate-800/60 border border-slate-700/60 px-2 py-1">
              <div className="flex items-center gap-1.5">
                <code className="text-[10px] text-orange-300">{c.sha.slice(0, 7)}</code>
                {c.date && <span className="text-[9px] text-slate-600">{new Date(c.date).toLocaleDateString()}</span>}
              </div>
              <div className="text-[11px] text-slate-300 truncate">{c.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* AFFECTS — decision rationale */}
      {!loading && decision && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Decision</div>
          <div className="text-[11px] text-slate-200">{decision.description}</div>
          {decision.chosen_option && (
            <div className="rounded-md bg-violet-950/30 border border-violet-800/40 px-2 py-1 text-[11px] text-violet-200">
              {decision.chosen_option}
            </div>
          )}
          {decision.rationale && (
            <div className="text-[11px] text-slate-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {decision.rationale}
            </div>
          )}
        </div>
      )}

      {/* SYNAPSE / LINKED_TO — note previews */}
      {!loading && notes.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            {edge.relationType === 'SYNAPSE' ? 'Connected neurons' : 'Attached note'}
          </div>
          {notes.map((n) => {
            // energy lives on the fabric-extended note payload (not the base Note type)
            const energy = (n as Note & { energy?: number }).energy
            return (
            <div key={n.id} className="rounded-md bg-slate-800/60 border border-slate-700/60 px-2 py-1.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] px-1 py-px rounded bg-slate-700/70 text-slate-300">{n.note_type}</span>
                <span className="text-[9px] text-slate-500">{n.importance}</span>
                {typeof energy === 'number' && (
                  <span className="text-[9px] text-cyan-400/80 ml-auto">⚡ {(energy * 100).toFixed(0)}%</span>
                )}
              </div>
              <div className="text-[11px] text-slate-300 line-clamp-3 whitespace-pre-wrap">
                {n.content}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const EdgeProvenancePanel = memo(EdgeProvenancePanelComponent)
