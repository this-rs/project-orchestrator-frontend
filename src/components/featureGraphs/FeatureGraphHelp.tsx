import { focusRing } from '@/components/ui/classes'
import { ROLE_ORDER, ENTITY_TYPE_META, RELATION_META } from '@/utils/featureGraphModel'
import { useT } from '@/i18n'
import { useFeatureGraphLabels } from './useFeatureGraphLabels'

/**
 * Closed-by-default plain-language disclosure (DESIGN.md § 5 « Explaining a concept »): the same
 * shape as `ConceptIntro` — a plain-text `<summary>`, no icon, no badge — for text that is NOT a
 * concept of the registry (a legend, how to read one screen). The concept itself ("what is a
 * feature graph") is `<PageShell intro="featureGraphs">`.
 */
function HelpDisclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group/help text-sm">
      <summary
        className={`inline-flex min-h-9 cursor-pointer list-none items-center rounded text-gray-400 underline-offset-4 hover:text-gray-200 hover:underline group-open/help:text-gray-200 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        {summary}
      </summary>
      <div className="mt-1 max-w-[var(--measure-md)] space-y-2 pb-1 text-[13px] leading-relaxed text-gray-400">{children}</div>
    </details>
  )
}

/** Intro on the detail page: roles glossary. */
export function FeatureGraphDetailHelp() {
  const { t } = useT()
  const labels = useFeatureGraphLabels()
  return (
    <HelpDisclosure summary={t('featureGraphs.help.summary')}>
      <p>{t('featureGraphs.help.intro')}</p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {ROLE_ORDER.map((role) => (
          <div key={role}>
            <dt className="inline font-medium text-gray-300">{labels.roleLabel(role)}</dt>
            <dd className="inline"> — {labels.roleDescription(role)}</dd>
          </div>
        ))}
      </dl>
      <p>{t('featureGraphs.help.body')}</p>
    </HelpDisclosure>
  )
}

/** Legend for node colours (by entity type) and edge styles (by relation). */
export function GraphLegend({ relationTypes }: { relationTypes: string[] }) {
  const { t } = useT()
  const labels = useFeatureGraphLabels()
  return (
    <div className="space-y-1.5 text-xs text-gray-500" aria-label={t('featureGraphs.help.legend')}>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <li className="text-gray-600">{t('featureGraphs.help.nodeColour')}</li>
        {Object.entries(ENTITY_TYPE_META).map(([type, meta]) => (
          <li key={type} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: meta.border }} aria-hidden="true" />
            {labels.typeLabel(type)}
          </li>
        ))}
      </ul>
      {relationTypes.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <li className="text-gray-600">{t('featureGraphs.help.arrow')}</li>
          {relationTypes.map((type) => {
            const r = RELATION_META[type]
            return (
              <li key={type} className="inline-flex items-center gap-1.5" title={labels.relationDescription(type) || undefined}>
                <span
                  className="h-0 w-3.5 border-t-2"
                  style={{ borderColor: r?.stroke ?? '#4b5563', borderStyle: r?.dashed ? 'dashed' : 'solid' }}
                  aria-hidden="true"
                />
                {labels.relationLabel(type)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
