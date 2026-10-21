/**
 * The refusal of a typed block of the agent's text (a diagram, a formula): why, in words,
 * and the block's own text as the fallback. Never an exception, never an empty box.
 * EAGER and tiny: the fences use it before any renderer is loaded.
 */
import { AlertTriangle } from 'lucide-react'

export function ReprRefusal({ reason, detail, source, testId }: { reason: string; detail?: string; source: string; testId: string }) {
  return (
    <div className="my-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2" role="note" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-amber-300/90">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span>{reason}</span>
      </div>
      {detail && <pre className="mt-1.5 max-h-24 overflow-auto text-[11px] text-amber-200/70 whitespace-pre-wrap font-mono leading-relaxed">{detail}</pre>}
      <pre className="mt-2 max-h-40 overflow-auto text-[11px] text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">{source}</pre>
    </div>
  )
}
