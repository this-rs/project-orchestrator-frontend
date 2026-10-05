import { Info } from 'lucide-react'
import { ENGINE_BANNER_TITLE, engineFeatureLabel } from '@/constants/engine'

/**
 * Above the composer when the engine running this session lists features it
 * cannot provide: the user learns it before missing them, not after.
 */
export function EngineBanner({ degraded }: { degraded: readonly string[] }) {
  if (degraded.length === 0) return null
  return (
    <div
      role="note"
      data-testid="engine-banner"
      className="mx-3 mb-1 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium text-amber-100">{ENGINE_BANNER_TITLE}</p>
        <ul className="mt-0.5 list-disc pl-4 text-amber-200/80">
          {degraded.map((id) => (
            <li key={id}>{engineFeatureLabel(id)}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
