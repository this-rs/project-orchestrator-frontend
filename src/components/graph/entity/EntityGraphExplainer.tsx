import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { Button } from '@/components/ui'
import { NEIGHBORHOOD_LAYERS } from '@/services/neighborhood'
import { useT } from '@/i18n'
import { typeColor } from './entityVisuals'
import { useEntityLabels } from './useEntityLabels'

/** English reference text; the component reads the catalog (graph.entity.explainer.agent). */
export const AGENT_SENTENCE =
  'This neighborhood is what the agent receives when it works on this entity.'

/**
 * Collapsible "how to read this graph" + colour legend of the types present.
 */
export function EntityGraphExplainer({
  typeCounts,
  defaultOpen = false,
}: {
  /** type → number of visible nodes of that type */
  typeCounts: [string, number][]
  defaultOpen?: boolean
}) {
  const { t } = useT()
  const { typeLabel, layerLabel, layerDescription } = useEntityLabels()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="text-xs text-gray-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button type="button" variant="ghost" size="sm" flat aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-ml-3 font-medium">
          <Info size={13} className="text-indigo-300" aria-hidden="true" />
          {t('graph.entity.explainer.how')}
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={`transition-transform duration-(--duration-instant) ease-(--ease-standard) motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          />
        </Button>
        {/* Type legend — only the types actually on screen */}
        <ul aria-label={t('graph.entity.explainer.legend')} className="flex flex-wrap gap-x-3 gap-y-1">
          {typeCounts.map(([type, count]) => (
            <li key={type} className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: typeColor(type) }}
              />
              {typeLabel(type)}
              <span className="tabular-nums text-gray-600">{count}</span>
            </li>
          ))}
        </ul>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2 leading-relaxed">
          <p className="text-gray-200">{t('graph.entity.explainer.agent')}</p>
          <dl className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-gray-300">{t('graph.entity.explainer.rings')}</dt>
            <dd>{t('graph.entity.explainer.ringsText')}</dd>
            <dt className="font-medium text-gray-300">{t('graph.entity.explainer.size')}</dt>
            <dd>{t('graph.entity.explainer.sizeText')}</dd>
            <dt className="font-medium text-gray-300">{t('graph.entity.relief')}</dt>
            <dd>{t('graph.entity.explainer.reliefText')}</dd>
            <dt className="font-medium text-gray-300">{t('graph.entity.layers')}</dt>
            <dd>
              <ul className="space-y-0.5">
                {NEIGHBORHOOD_LAYERS.map((l) => (
                  <li key={l}>
                    <span className="text-gray-300">{layerLabel(l)}</span> — {layerDescription(l)}
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
          <p className="text-gray-500">
            {t('graph.entity.explainer.tap')}
          </p>
        </div>
      )}
    </div>
  )
}
