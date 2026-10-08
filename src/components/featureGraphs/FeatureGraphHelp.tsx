import { focusRing } from '@/components/ui/classes'
import { ROLE_ORDER, ROLE_META, ENTITY_TYPE_META, RELATION_META } from '@/utils/featureGraphModel'

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
  return (
    <HelpDisclosure summary="How to read this feature graph">
      <p>
        These are the code entities that implement one feature. Each entity has a{' '}
        <strong className="font-medium text-gray-300">role</strong> in it:
      </p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {ROLE_ORDER.map((role) => (
          <div key={role}>
            <dt className="inline font-medium text-gray-300">{ROLE_META[role].label}</dt>
            <dd className="inline"> — {ROLE_META[role].description}</dd>
          </div>
        ))}
      </dl>
      <p>
        Every entity shows a readable title, its exact code name and a one-line explanation (the first sentence of its
        documentation when it has one). Group them by role, file or type, and search across all of them. The importance
        gauge reads Key, Supporting or Minor — how central the entity is to this feature</p>
    </HelpDisclosure>
  )
}

/** Legend for node colours (by entity type) and edge styles (by relation). */
export function GraphLegend({ relationTypes }: { relationTypes: string[] }) {
  return (
    <div className="space-y-1.5 text-xs text-gray-500" aria-label="Legend">
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <li className="text-gray-600">Node colour = type</li>
        {Object.values(ENTITY_TYPE_META).map((t) => (
          <li key={t.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: t.border }} aria-hidden="true" />
            {t.label}
          </li>
        ))}
      </ul>
      {relationTypes.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <li className="text-gray-600">Arrow = relation</li>
          {relationTypes.map((type) => {
            const r = RELATION_META[type]
            return (
              <li key={type} className="inline-flex items-center gap-1.5" title={r?.description || undefined}>
                <span
                  className="h-0 w-3.5 border-t-2"
                  style={{ borderColor: r?.stroke ?? '#4b5563', borderStyle: r?.dashed ? 'dashed' : 'solid' }}
                  aria-hidden="true"
                />
                {r?.label ?? type}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
