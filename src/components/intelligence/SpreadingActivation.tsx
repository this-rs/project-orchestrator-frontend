import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { atom } from 'jotai'
import { Search, X, Zap } from 'lucide-react'
import { notesApi } from '@/services/notes'

// ============================================================================
// ACTIVATION STATE — shared atoms for graph-wide activation overlay
// ============================================================================

export interface ActivationState {
  /** Note IDs that are "direct" matches (cyan glow) */
  directIds: Set<string>
  /** Note IDs that are "propagated" (violet glow) */
  propagatedIds: Set<string>
  /** Map of noteId → activation score (0–1) for intensity */
  scores: Map<string, number>
  /** Edge IDs (synapse) that should pulse — source→target pairs where both endpoints are activated */
  activeEdges: Set<string>
  /** Current animation phase: idle, searching, direct, propagating, done */
  phase: 'idle' | 'searching' | 'direct' | 'propagating' | 'done'
}

const emptyActivation: ActivationState = {
  directIds: new Set(),
  propagatedIds: new Set(),
  scores: new Map(),
  activeEdges: new Set(),
  phase: 'idle',
}

export const activationStateAtom = atom<ActivationState>(emptyActivation)

/** Whether the search overlay is open */
export const activationSearchOpenAtom = atom<boolean>(false)

// ============================================================================
// SEARCH OVERLAY COMPONENT
// ============================================================================

interface SpreadingActivationProps {
  projectSlug: string | undefined
}

function SpreadingActivationComponent({ projectSlug }: SpreadingActivationProps) {
  const [isOpen, setIsOpen] = useAtom(activationSearchOpenAtom)
  const setActivation = useSetAtom(activationStateAtom)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const animationRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Cleanup animation timeouts on unmount
  useEffect(() => {
    return () => {
      animationRef.current.forEach(clearTimeout)
    }
  }, [])

  const clearActivation = useCallback(() => {
    animationRef.current.forEach(clearTimeout)
    animationRef.current = []
    setActivation(emptyActivation)
  }, [setActivation])

  const handleClose = useCallback(() => {
    clearActivation()
    setQuery('')
    setIsOpen(false)
  }, [clearActivation, setIsOpen])

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !projectSlug) return

    // Clear previous animation
    clearActivation()
    setSearching(true)
    setActivation((prev) => ({ ...prev, phase: 'searching' }))

    try {
      const response = await notesApi.searchNeurons({
        query: query.trim(),
        project_slug: projectSlug,
        max_results: 30,
        max_hops: 3,
      })

      const results = response.results
      if (results.length === 0) {
        setActivation(emptyActivation)
        setSearching(false)
        return
      }

      const direct = results.filter((r) => r.source.type === 'direct')
      const propagated = results.filter((r) => r.source.type === 'propagated')

      // Phase 1: Light up direct matches (cyan) — immediate
      const directIds = new Set(direct.map((r) => r.id))
      const scores = new Map<string, number>()
      direct.forEach((r) => scores.set(r.id, r.activation_score))

      setActivation({
        directIds,
        propagatedIds: new Set(),
        scores,
        activeEdges: new Set(),
        phase: 'direct',
      })

      // Phase 2: Propagate along synapses — staggered animation
      // Group propagated by hop distance (estimated from activation_score)
      const sorted = [...propagated].sort((a, b) => b.activation_score - a.activation_score)
      const batchSize = Math.max(1, Math.ceil(sorted.length / 5)) // 5 waves
      const delayPerBatch = 200 // ms between waves

      let accumulated = new Set<string>()
      const allScores = new Map(scores)

      for (let i = 0; i < sorted.length; i += batchSize) {
        const batch = sorted.slice(i, i + batchSize)
        const delay = 400 + (i / batchSize) * delayPerBatch // 400ms initial delay after direct

        const timeout = setTimeout(() => {
          batch.forEach((r) => {
            accumulated.add(r.id)
            allScores.set(r.id, r.activation_score)
          })

          // Build active edges: synapse edges between any two activated nodes
          const allActivated = new Set([...directIds, ...accumulated])
          const activeEdges = new Set<string>()
          results.forEach((r) => {
            if (r.source.via && allActivated.has(r.source.via) && allActivated.has(r.id)) {
              activeEdges.add(`${r.source.via}-${r.id}`)
            }
          })

          setActivation({
            directIds,
            propagatedIds: new Set(accumulated),
            scores: new Map(allScores),
            activeEdges,
            phase: i + batchSize >= sorted.length ? 'done' : 'propagating',
          })
          // Clone accumulated for next iteration closure
          accumulated = new Set(accumulated)
        }, delay)

        animationRef.current.push(timeout)
      }

      // If no propagated results, mark as done after direct phase
      if (propagated.length === 0) {
        const timeout = setTimeout(() => {
          setActivation((prev) => ({ ...prev, phase: 'done' }))
        }, 400)
        animationRef.current.push(timeout)
      }
    } catch {
      setActivation(emptyActivation)
    } finally {
      setSearching(false)
    }
  }, [query, projectSlug, clearActivation, setActivation])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch()
      if (e.key === 'Escape') handleClose()
    },
    [handleSearch, handleClose],
  )

  if (!isOpen) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-96">
      <div className="flex items-center gap-2 rounded-lg bg-slate-900/95 backdrop-blur-sm border border-slate-700 shadow-xl px-3 py-2">
        <Search size={14} className="text-slate-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search to visualize spreading activation..."
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none"
        />
        {searching && (
          <Zap size={14} className="text-cyan-400 animate-pulse shrink-0" />
        )}
        <button
          onClick={handleClose}
          className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Activation legend */}
      <div className="flex items-center gap-3 mt-1.5 px-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          Direct match
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          Propagated
        </span>
        <span className="ml-auto opacity-60">Enter to search · Esc to close</span>
      </div>
    </div>
  )
}

export const SpreadingActivation = memo(SpreadingActivationComponent)
