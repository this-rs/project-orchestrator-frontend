import { HelpCircle } from 'lucide-react'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { ROLE_ORDER, ROLE_META, ENTITY_TYPE_META, RELATION_META } from '@/utils/featureGraphModel'

const fg = NOMENCLATURE.featureGraphs

/** Collapsible plain-language explainer; closed by default so it never pushes content down. */
function HelpDisclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-gray-400">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-gray-300 marker:hidden focus-visible:outline-2 focus-visible:outline-indigo-400">
        <HelpCircle className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        <span>{summary}</span>
        <span className="ml-auto text-xs text-gray-500 group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs text-gray-500 group-open:inline">Hide</span>
      </summary>
      <div className="mt-2 space-y-2 pb-1 text-[13px] leading-relaxed">{children}</div>
    </details>
  )
}

/** Intro on the list page: what a feature graph is and how to get one. */
export function FeatureGraphListHelp() {
  return (
    <HelpDisclosure summary={`What is a ${fg.singular.toLowerCase()}?`}>
      <p>
        A {fg.singular.toLowerCase()} is the set of code entities (files, functions, structs, traits) that together
        implement <strong className="font-medium text-gray-300">one feature</strong>. It lets you see, and reason about, a
        feature without hunting through the whole codebase.
      </p>
      <p>
        <strong className="font-medium text-gray-300">Auto-build</strong> starts from an entry function and follows its
        calls (callers and callees) down to a chosen depth, then adds the related types and traits.{' '}
        <strong className="font-medium text-gray-300">New graph</strong> creates an empty one you fill in by hand.
      </p>
    </HelpDisclosure>
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
