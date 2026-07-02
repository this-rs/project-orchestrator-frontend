// ============================================================================
// InsightsChip — "what the canvas sees that you can't"
// ============================================================================
//
// Compact overlay surfacing the two deep-analysis lenses:
//   ⚡ Invisible couplings — CO_CHANGED pairs with NO structural edge
//      (click = focus lens: dims everything else)
//   🔮 Predictions — plausible missing links from the 5-signal engine
//      (click = fetch once, then toggle dashed ghost edges)
// ============================================================================

import { memo, useMemo, useState, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Zap, Sparkles, Loader2 } from 'lucide-react'
import {
  focusInvisibleCouplingsAtom,
  showPredictedLinksAtom,
  predictedLinksAtom,
} from '@/atoms/intelligence'
import { detectInvisibleCouplings } from './graph3d/invisibleCouplings'
import { codeApi } from '@/services/code'
import type { IntelligenceEdge } from '@/types/intelligence'

interface InsightsChipProps {
  projectSlug?: string
  edges: IntelligenceEdge[]
}

function InsightsChipComponent({ projectSlug, edges }: InsightsChipProps) {
  const [focusCouplings, setFocusCouplings] = useAtom(focusInvisibleCouplingsAtom)
  const [showPredicted, setShowPredicted] = useAtom(showPredictedLinksAtom)
  const setPredictedLinks = useSetAtom(predictedLinksAtom)
  const [predictedCount, setPredictedCount] = useState<number | null>(null)
  const [loadingPredictions, setLoadingPredictions] = useState(false)

  // Count invisible couplings from the loaded edges (client-side, cheap)
  const invisibleCount = useMemo(() => {
    return detectInvisibleCouplings(
      edges.map((e) => ({
        source: e.source,
        target: e.target,
        relationType: ((e.data as { relationType?: string })?.relationType) ?? 'IMPORTS',
      })),
    ).size
  }, [edges])

  const togglePredictions = useCallback(async () => {
    if (showPredicted) {
      setShowPredicted(false)
      return
    }
    // Fetch once on first enable
    if (predictedCount === null && projectSlug) {
      setLoadingPredictions(true)
      try {
        const res = await codeApi.predictLinks({
          project_slug: projectSlug,
          top_n: 20,
          min_plausibility: 0.4,
        })
        const preds = (res.predictions ?? []).map((p) => ({
          source: p.source,
          target: p.target,
          plausibility: p.plausibility,
          suggested_relation: p.suggested_relation,
        }))
        setPredictedLinks(preds)
        setPredictedCount(preds.length)
      } catch {
        setPredictedCount(0)
      } finally {
        setLoadingPredictions(false)
      }
    }
    setShowPredicted(true)
  }, [showPredicted, predictedCount, projectSlug, setPredictedLinks, setShowPredicted])

  if (invisibleCount === 0 && !projectSlug) return null

  return (
    <div className="absolute top-14 right-3 z-40 flex flex-col gap-1 items-end">
      {/* Invisible couplings lens */}
      {invisibleCount > 0 && (
        <button
          onClick={() => setFocusCouplings(!focusCouplings)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border backdrop-blur-sm transition-colors ${
            focusCouplings
              ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 ring-1 ring-amber-500/30'
              : 'bg-slate-900/90 text-amber-300/90 border-slate-700 hover:border-amber-500/40'
          }`}
          title="CO_CHANGED pairs with NO structural edge — coupling invisible to any static code view. Click to focus."
        >
          <Zap size={12} />
          {invisibleCount} couplage{invisibleCount > 1 ? 's' : ''} invisible{invisibleCount > 1 ? 's' : ''}
        </button>
      )}

      {/* Predicted missing links */}
      {projectSlug && (
        <button
          onClick={() => void togglePredictions()}
          disabled={loadingPredictions}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border backdrop-blur-sm transition-colors ${
            showPredicted
              ? 'bg-violet-500/20 text-violet-200 border-violet-500/50 ring-1 ring-violet-500/30'
              : 'bg-slate-900/90 text-violet-300/90 border-slate-700 hover:border-violet-500/40'
          }`}
          title="Plausible missing links (Jaccard, co-change, proximity, Adamic-Adar, structural DNA) — dashed ghost edges"
        >
          {loadingPredictions ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {predictedCount !== null ? `${predictedCount} liens prédits` : 'Prédictions'}
        </button>
      )}
    </div>
  )
}

export const InsightsChip = memo(InsightsChipComponent)
